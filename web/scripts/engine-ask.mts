import "dotenv/config";
import { answerQuestion, type Answer } from "../../src/ask/answer.js";
import type { ReviewBundle } from "../../src/ask/types.js";
import { AnthropicClient } from "../../src/vendor/llm.js";

interface Payload {
  bundle: ReviewBundle;
  question: string;
}

export interface AskResult {
  answer: Answer;
  model: string | null;
  /** What the answerer said as it worked, including the line it writes when it discards a draft. */
  notes: string[];
}

/**
 * The answerer reports a discarded draft by writing a line, so the line is kept as well
 * as forwarded. It goes to stderr rather than stdout because stdout carries the result.
 */
const notes: string[] = [];
console.log = (...args: unknown[]) => {
  notes.push(args.map((arg) => String(arg)).join(" "));
  console.error(...args);
};

async function readPayload(): Promise<Payload> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Payload;
}

/**
 * One question answered against a finished review, in the engine's own process.
 *
 * With no ANTHROPIC_API_KEY the answerer is handed no model and the evidence table
 * writes the paragraph itself, which is a normal state and not a failure.
 */
async function main(): Promise<void> {
  const payload = await readPayload();
  const client = process.env["ANTHROPIC_API_KEY"] ? new AnthropicClient() : null;
  const answer = await answerQuestion(payload.bundle, payload.question, client);
  const result: AskResult = { answer, model: client?.model ?? null, notes };
  process.stdout.write(JSON.stringify(result));
}

void main();
