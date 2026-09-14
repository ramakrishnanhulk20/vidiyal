import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewBundle } from "../../src/ask/types.js";
import type { GradedTrade } from "../../src/review/types.js";
import type { LlmClient, LlmRequest } from "../../src/vendor/llm.js";
import { graded, LEDGER_SOURCE } from "../support/records.js";

// server-only is a build-time marker that throws when it is loaded outside a React server.
// Replacing it lets the desk's engine module be driven here the way a page drives it. Both
// names are mocked because the package is installed under web/, so the desk resolves it to
// that file while a bare specifier from here would resolve somewhere else or nowhere.
vi.mock("../../web/node_modules/server-only/index.js", () => ({}));
vi.mock("server-only", () => ({}));

const { engineMode, runAsk } = await import("../../web/lib/engine-call.js");

// The import mode of the desk's engine call: the mode switch, and the ask path driven with
// a fake model against a bundle built here. It does not cover the spawn mode, which needs
// the engine folder and its tsx runner, and it does not cover the gate, whose every test
// reads the live Bitget market. What a real model writes is not covered either: the fake
// stands in for it so the honesty check can be driven both ways.

const NOW = Date.UTC(2026, 8, 8, 14, 0, 0);

function bundle(trades: GradedTrade[]): ReviewBundle {
  return {
    source: LEDGER_SOURCE,
    range: { fromTs: NOW - 7 * 24 * 60 * 60 * 1000, toTs: NOW },
    graded: trades,
    patterns: [],
    checklist: [],
    equityCurve: [],
  };
}

function fakeClient(reply: string): LlmClient & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  return {
    calls,
    model: "fake",
    async complete(req: LlmRequest) {
      calls.push(req);
      return { text: reply, promptTokens: 0, completionTokens: 0, latencyMs: 0, model: "fake" };
    },
  };
}

const MU = graded(
  { id: "mu", symbol: "RMUUSDT", category: "SPOT", grossPnl: -12.5, feesUsdt: 1.25 },
  {},
  { total: 41, letter: "D", evidence: ["entry: price was 2.10 percent from the last regular close"] },
);

const REVIEW = bundle([MU]);

const SAVED = process.env["VIDIYAL_ENGINE_MODE"];

beforeEach(() => {
  process.env["VIDIYAL_ENGINE_MODE"] = "import";
});

afterEach(() => {
  if (SAVED === undefined) delete process.env["VIDIYAL_ENGINE_MODE"];
  else process.env["VIDIYAL_ENGINE_MODE"] = SAVED;
});

describe("engineMode", () => {
  it("takes the mode it is given over the folder it can see", () => {
    expect(engineMode()).toBe("import");
    process.env["VIDIYAL_ENGINE_MODE"] = "spawn";
    expect(engineMode()).toBe("spawn");
  });
});

describe("runAsk in import mode", () => {
  it("answers in the shape the spawned engine answers in", async () => {
    const client = fakeClient("RMUUSDT lost 12.50 USDT and graded D [mu].");
    const result = await runAsk({ bundle: REVIEW, question: "why did this account lose on rMU?" }, client);

    expect(Object.keys(result).sort()).toEqual(["answer", "model", "notes"]);
    expect(result.model).toBe("fake");
    expect(result.answer.question).toBe("why did this account lose on rMU?");
    expect(result.answer.evidence.length).toBeGreaterThan(0);
    expect(client.calls).toHaveLength(1);
  });

  it("keeps the line the answerer writes when it throws a draft away", async () => {
    const client = fakeClient("RMUUSDT lost 99.99 USDT on a trade nobody recorded [mu].");
    const result = await runAsk({ bundle: REVIEW, question: "why did this account lose on rMU?" }, client);

    expect(result.answer.uncitedNumbers).toContain("99.99");
    expect(result.notes.some((line) => line.includes("thrown away"))).toBe(true);
    expect(result.answer.narrative).not.toContain("99.99");
  });

  it("asks no model and says so when it is handed none", async () => {
    const result = await runAsk({ bundle: REVIEW, question: "what went wrong?" }, null);

    expect(result.model).toBeNull();
    expect(result.notes).toEqual([]);
    expect(result.answer.narrative.length).toBeGreaterThan(0);
  });
});
