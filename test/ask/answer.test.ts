import { describe, expect, it } from "vitest";
import { answerQuestion } from "../../src/ask/answer.js";
import type { ReviewBundle } from "../../src/ask/types.js";
import type { GradedTrade, PatternHit } from "../../src/review/types.js";
import type { LlmClient, LlmRequest } from "../../src/vendor/llm.js";
import { graded, LEDGER_SOURCE } from "../support/records.js";

// Retrieval, the evidence table, the deterministic paragraph and the honesty check,
// against a fake model. It does not cover what a real model writes, and it does not
// claim the keyword filter understands a question: it claims only that every trade in an
// answer can be traced to a word in the question or to being one of the worst five.

const NOW = Date.UTC(2026, 8, 8, 14, 0, 0);

function bundle(trades: GradedTrade[], patterns: PatternHit[] = []): ReviewBundle {
  return {
    source: LEDGER_SOURCE,
    range: { fromTs: NOW - 7 * 24 * 60 * 60 * 1000, toTs: NOW },
    graded: trades,
    patterns,
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

const TSLA = graded(
  { id: "tsla", symbol: "RTSLAUSDT", category: "SPOT", grossPnl: -12.5, feesUsdt: 1.25 },
  {},
  { total: 41, letter: "D", evidence: ["entry: price was 2.10 percent from the last regular close"] },
);

const NVDA = graded(
  { id: "nvda", symbol: "NVDAUSDT", grossPnl: 30 },
  {},
  { total: 88, letter: "A", evidence: ["entry: price was 0.10 percent from the last regular close"] },
);

describe("answerQuestion retrieval", () => {
  it("picks the trades whose instrument the question names", async () => {
    const answer = await answerQuestion(bundle([TSLA, NVDA]), "why did this account lose on rTSLA?", null);

    expect([...new Set(answer.evidence.map((row) => row.ref))]).toEqual(["tsla"]);
  });

  it("falls back to the worst five by score when the question names nothing", async () => {
    const many = [90, 20, 75, 35, 10, 60, 50].map((total, index) =>
      graded({ id: `t${index}` }, {}, { total }),
    );

    const answer = await answerQuestion(bundle(many), "what went wrong?", null);

    expect([...new Set(answer.evidence.map((row) => row.ref))]).toEqual(["t4", "t1", "t3", "t6", "t5"]);
  });

  it("picks the trades a named pattern fired on", async () => {
    const hit: PatternHit = {
      pattern: "fee-bleed",
      description: "Friction took more than a fifth of everything the period moved",
      trades: ["nvda"],
      evidence: ["nvda paid 4.0000 USDT of friction"],
    };

    const answer = await answerQuestion(bundle([TSLA, NVDA], [hit]), "tell me about the fee bleed", null);

    expect([...new Set(answer.evidence.map((row) => row.ref))]).toEqual(["nvda"]);
  });
});

describe("answerQuestion without a model", () => {
  it("writes the evidence paragraph, citing every trade it used", async () => {
    const answer = await answerQuestion(bundle([TSLA]), "why did this account lose on rTSLA?", null);

    expect(answer.narrative).toContain("[tsla]");
    expect(answer.narrative).toContain("D, 41.0 of 100");
    expect(answer.citedRefs).toEqual(["tsla"]);
    expect(answer.uncitedNumbers).toEqual([]);
  });

  it("cites nothing but refs the evidence table holds", async () => {
    const answer = await answerQuestion(bundle([TSLA, NVDA]), "how did both names do?", null);

    const refs = new Set(answer.evidence.map((row) => row.ref));
    expect(answer.citedRefs.length).toBeGreaterThan(0);
    for (const ref of answer.citedRefs) expect(refs.has(ref)).toBe(true);
  });

  it("says the record is empty rather than answering from nothing", async () => {
    const answer = await answerQuestion(bundle([]), "why did I lose?", null);

    expect(answer.evidence).toEqual([]);
    expect(answer.narrative).toContain("nothing to answer with");
  });
});

describe("answerQuestion with a model", () => {
  it("keeps an answer whose every number is in the evidence", async () => {
    const client = fakeClient("The trade graded D, 41.0 of 100 [tsla] and lost -12.5000 USDT gross [tsla].");

    const answer = await answerQuestion(bundle([TSLA]), "why did this account lose on rTSLA?", client);

    expect(answer.narrative).toContain("graded D, 41.0 of 100");
    expect(answer.uncitedNumbers).toEqual([]);
    expect(client.calls[0]!.system).toContain("copied character for character");
  });

  it("throws away an answer that invented a number and uses the evidence instead", async () => {
    const client = fakeClient("The account lost 250.75 USDT across these trades [tsla].");

    const answer = await answerQuestion(bundle([TSLA]), "why did this account lose on rTSLA?", client);

    expect(answer.uncitedNumbers).toEqual(["250.75"]);
    expect(answer.narrative).not.toContain("250.75");
    expect(answer.narrative).toContain("[tsla]");
  });

  it("throws away an answer that cited a trade the table does not hold", async () => {
    const client = fakeClient("The trade graded D, 41.0 of 100 [made-up-trade].");

    const answer = await answerQuestion(bundle([TSLA]), "why did this account lose on rTSLA?", client);

    expect(answer.citedRefs).toEqual(["tsla"]);
  });

  it("does not accuse a model of inventing a number it only spelled differently", async () => {
    const client = fakeClient("The trade graded D, 41 of 100 [tsla].");

    const answer = await answerQuestion(bundle([TSLA]), "why did this account lose on rTSLA?", client);

    expect(answer.uncitedNumbers).toEqual([]);
    expect(answer.narrative).toContain("41 of 100");
  });
});
