import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { answerQuestion, type Answer } from "../../src/ask/answer";
import type { ReviewBundle } from "../../src/ask/types";
import { checkIdea, type DeskState } from "../../src/checklist/gate";
import type { ChecklistItem, Idea, IdeaCheck } from "../../src/review/types";
import { createBitget } from "../../src/vendor/bitget/client";
import { AnthropicClient, type LlmClient } from "../../src/vendor/llm";
import { engineRoot } from "./desk";

/** How long the desk waits on the engine before it tells the reader the wait is over. */
const LIMITS = { gate: 45_000, ask: 90_000 };

export class EngineError extends Error {
  constructor(
    message: string,
    public readonly detail: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export interface GateRequest {
  idea: Idea;
  items: ChecklistItem[];
  state: DeskState;
}

export interface AskRequest {
  bundle: ReviewBundle;
  question: string;
}

export interface AskResult {
  answer: Answer;
  model: string | null;
  /** What the answerer said as it worked, including the line it writes when it discards a draft. */
  notes: string[];
}

export type EngineMode = "spawn" | "import";

/**
 * Which way the desk reaches the engine.
 *
 * Spawning is the better of the two and stays the default wherever it is possible: the
 * Bitget and Anthropic keys are read by a child process and never sit in the server that
 * renders pages. It needs the engine folder beside the app, with its node_modules and the
 * tsx runner in it, which is true on the machine that watches the ledger and false on a
 * hosted deploy of web/ by itself. There the engine is imported into this process instead.
 * VIDIYAL_ENGINE_MODE overrides the guess in either direction.
 */
export function engineMode(): EngineMode {
  const named = process.env.VIDIYAL_ENGINE_MODE?.trim();
  if (named === "import" || named === "spawn") return named;
  return existsSync(resolve(engineRoot(), "node_modules/tsx")) ? "spawn" : "import";
}

/**
 * One idea held against the checklist, whichever way the engine is reachable. Both ways
 * answer with the same IdeaCheck, and a failure either way is an EngineError carrying
 * what went wrong, so the page above this never learns which mode it ran in.
 */
export async function runGate(request: GateRequest): Promise<IdeaCheck> {
  if (engineMode() === "spawn") return await callEngine<IdeaCheck>("gate", request);
  return await withLimit("gate", gateHere(request));
}

/**
 * One question answered against a finished review. client is only passed by a test: left
 * out, the answerer gets Claude when ANTHROPIC_API_KEY is set and nothing when it is not,
 * which is a normal state in which the evidence table writes the paragraph itself.
 */
export async function runAsk(request: AskRequest, client?: LlmClient | null): Promise<AskResult> {
  if (engineMode() === "spawn") return await callEngine<AskResult>("ask", request);
  return await withLimit("ask", askHere(request, client === undefined ? modelClient() : client));
}

function modelClient(): LlmClient | null {
  return process.env.ANTHROPIC_API_KEY ? new AnthropicClient() : null;
}

async function gateHere(request: GateRequest): Promise<IdeaCheck> {
  try {
    return await checkIdea(createBitget(), request.idea, request.items, request.state);
  } catch (cause) {
    throw new EngineError("the gate could not be run", (cause as Error).message);
  }
}

/**
 * The answerer reports a discarded draft by logging one line that starts with "ask: ",
 * and the page shows that line rather than hiding the fact that a draft was thrown away.
 * The spawned script keeps it by replacing console.log, so this does the same. Only the
 * answerer's own lines are kept, and console.log is put back before the answer returns.
 * Two questions answered in the same instant could each keep the other's line; that costs
 * a note, never a number, since every number in an answer comes from the evidence table.
 */
async function askHere(request: AskRequest, client: LlmClient | null): Promise<AskResult> {
  const notes: string[] = [];
  const spoken = console.log;
  console.log = (...args: unknown[]) => {
    const line = args.map((arg) => String(arg)).join(" ");
    if (line.startsWith("ask: ")) notes.push(line);
    spoken(...args);
  };
  try {
    const answer = await answerQuestion(request.bundle, request.question, client);
    return { answer, model: client?.model ?? null, notes };
  } catch (cause) {
    throw new EngineError("the question could not be answered", (cause as Error).message);
  } finally {
    console.log = spoken;
  }
}

/**
 * The same wait the spawned engine gets. Nothing is killed when it runs out, because a
 * Bitget read already in flight inside this process cannot be cancelled: the reader stops
 * waiting and the work finishes into nothing.
 */
async function withLimit<T>(script: keyof typeof LIMITS, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const overrun = new Promise<never>((_, fail) => {
    timer = setTimeout(() => {
      fail(
        new EngineError(
          `the ${script} run passed ${LIMITS[script] / 1000} seconds without an answer and was stopped`,
          "Bitget, the news feed or the model took longer than the desk waits. Nothing was sent anywhere. Try it again.",
        ),
      );
    }, LIMITS[script]);
  });

  try {
    return await Promise.race([work, overrun]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Run one engine script in its own Node process and read its answer.
 *
 * The engine is TypeScript that resolves the way Node does, which is not how the web
 * bundler resolves, so it runs through tsx from the engine's own folder rather than
 * being bundled into the server. The side effect is the one worth having: the Bitget and
 * Anthropic keys are read by the child from the engine's .env and never sit in the
 * process that renders pages.
 */
async function callEngine<T>(script: keyof typeof LIMITS, payload: unknown): Promise<T> {
  const root = engineRoot();
  const file = resolve(root, "web/scripts", `engine-${script}.mts`);

  return await new Promise<T>((done, fail) => {
    const child = spawn(process.execPath, ["--import", "tsx", file], {
      cwd: root,
      windowsHide: true,
    });

    let out = "";
    let err = "";
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      child.kill();
      fail(
        new EngineError(
          `the ${script} run passed ${LIMITS[script] / 1000} seconds without an answer and was stopped`,
          "Bitget, the news feed or the model took longer than the desk waits. Nothing was sent anywhere. Try it again.",
        ),
      );
    }, LIMITS[script]);

    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    // The engine writes its own working notes here. Only the tail is ever shown, and
    // only when the run failed, so a reader gets the reason rather than a blank screen.
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });

    child.on("error", (cause) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fail(new EngineError("the engine could not be started", cause.message));
    });

    child.on("close", (code) => {
      if (settled) return;
      clearTimeout(timer);
      if (code !== 0 || out.trim() === "") {
        fail(new EngineError(`the engine stopped with code ${code ?? "unknown"}`, tail(err)));
        return;
      }
      try {
        done(JSON.parse(out) as T);
      } catch {
        fail(new EngineError("the engine answered something the desk could not read", tail(out)));
      }
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

function tail(text: string): string {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(-4).join(" ").slice(-400);
}
