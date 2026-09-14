import { describe, expect, it } from "vitest";
import { gradeTrade, type GradeOptions } from "../../src/review/grade.js";
import { NoJudgeError, SilentJudge } from "../../src/review/judge.js";
import { context, fill, trip } from "../support/records.js";

// The rubric rows at their threshold edges, the weights and the letters. It does not
// cover where the inputs come from (context does that) and it does not judge whether a
// threshold is the right one: the thresholds are the rubric, and the rubric is a choice.

const NO_OPTIONS: GradeOptions = {
  rulebookCaps: null,
  medianSizeUsdt: null,
  winnersMedianHoldMs: null,
  reasoningScore: null,
};

/** A moment outside the re-anchoring window and outside a weekend: a Tuesday noon ET. */
const WEEKDAY_NOON_UTC = Date.UTC(2026, 8, 8, 16, 0, 0);

/** 09:30 ET on that same Tuesday, inside the 09:25 to 09:40 re-anchoring window. */
const REANCHOR_UTC = Date.UTC(2026, 8, 8, 13, 30, 0);

function entryOnly(divergence: number | null, over: Partial<Parameters<typeof context>[0]> = {}) {
  return context({ divergenceAtEntryPct: divergence, ...over });
}

describe("entry context", () => {
  it("scores 5 at half a percent of divergence and 0 at two percent", () => {
    const trade = trip({ entryTs: WEEKDAY_NOON_UTC });
    const tight = gradeTrade(trade, entryOnly(0.5), NO_OPTIONS);
    const wide = gradeTrade(trade, entryOnly(2), NO_OPTIONS);

    expect(tight.entry).toBe(5);
    expect(wide.entry).toBe(2.5);
    expect(tight.evidence.some((line) => line.includes("0.50 percent from the last regular close"))).toBe(true);
  });

  it("scores the spread against the usual spread for this instrument", () => {
    const trade = trip({ entryTs: WEEKDAY_NOON_UTC });
    const usual = gradeTrade(trade, entryOnly(0, { spreadAtEntryBps: 10, usualSpreadBps: 10 }), NO_OPTIONS);
    const triple = gradeTrade(trade, entryOnly(0, { spreadAtEntryBps: 30, usualSpreadBps: 10 }), NO_OPTIONS);

    expect(usual.entry).toBe(5);
    expect(triple.entry).toBeCloseTo(10 / 3, 2);
  });

  it("zeroes the re-anchoring component for an entry between 09:25 and 09:40 ET", () => {
    const inside = gradeTrade(trip({ entryTs: REANCHOR_UTC }), entryOnly(0), NO_OPTIONS);
    const outside = gradeTrade(trip({ entryTs: WEEKDAY_NOON_UTC }), entryOnly(0), NO_OPTIONS);

    expect(inside.entry).toBe(2.5);
    expect(outside.entry).toBe(5);
    expect(inside.evidence.some((line) => line.includes("re-anchoring window"))).toBe(true);
  });

  it("penalises an entry minutes before an event that the rationale never names", () => {
    const silent = gradeTrade(
      trip({ entryTs: WEEKDAY_NOON_UTC, rationale: null }),
      entryOnly(0, { nextEventMinutes: 20 }),
      NO_OPTIONS,
    );
    const explained = gradeTrade(
      trip({ entryTs: WEEKDAY_NOON_UTC, rationale: "buying into the earnings print" }),
      entryOnly(0, { nextEventMinutes: 20 }),
      NO_OPTIONS,
    );

    expect(silent.entry).toBeCloseTo(10 / 3, 2);
    expect(explained.entry).toBe(5);
  });
});

describe("sizing", () => {
  it("scores 5 at the rulebook cap and 0 at twice the cap", () => {
    const opts: GradeOptions = { ...NO_OPTIONS, rulebookCaps: { perSymbolPct: 10, maxBookFraction: 0.25 } };
    const atCap = trip({ entryTs: WEEKDAY_NOON_UTC, qty: 10, entryPrice: 100, equityAtEntry: 10_000 });
    const double = trip({ entryTs: WEEKDAY_NOON_UTC, qty: 20, entryPrice: 100, equityAtEntry: 10_000 });

    expect(gradeTrade(atCap, context(), opts).sizing).toBe(5);
    expect(gradeTrade(double, context(), opts).sizing).toBe(0);
  });

  it("holds a person to their own median size, with three times the median at 0", () => {
    const opts: GradeOptions = { ...NO_OPTIONS, medianSizeUsdt: 500 };
    const median = trip({ entryTs: WEEKDAY_NOON_UTC, qty: 5, entryPrice: 100, equityAtEntry: null });
    const triple = trip({ entryTs: WEEKDAY_NOON_UTC, qty: 15, entryPrice: 100, equityAtEntry: null });

    expect(gradeTrade(median, context(), opts).sizing).toBe(5);
    expect(gradeTrade(triple, context(), opts).sizing).toBe(0);
  });

  it("scores 0 when the order would take twice the allowed share of the book", () => {
    const trade = trip({ entryTs: WEEKDAY_NOON_UTC, equityAtEntry: null });

    expect(gradeTrade(trade, context({ bookShareAtEntry: 0.25 }), NO_OPTIONS).sizing).toBe(5);
    expect(gradeTrade(trade, context({ bookShareAtEntry: 0.5 }), NO_OPTIONS).sizing).toBe(0);
  });

  it("stays neutral when nothing in the record sizes the trade", () => {
    const trade = trip({ entryTs: WEEKDAY_NOON_UTC, equityAtEntry: null });

    expect(gradeTrade(trade, context(), NO_OPTIONS).sizing).toBe(2.5);
  });
});

describe("exit discipline", () => {
  it("scores a stop that held at 5 and one that was crossed at 0", () => {
    const trade = trip({ entryTs: WEEKDAY_NOON_UTC });
    const held = context({ stop: { existed: true, price: 98, honoured: true } });
    const broken = context({ stop: { existed: true, price: 98, honoured: false } });

    expect(gradeTrade(trade, held, NO_OPTIONS).exit).toBe(5);
    expect(gradeTrade(trade, broken, NO_OPTIONS).exit).toBe(0);
  });

  it("scores a loser held twice the winners median hold at 0", () => {
    const opts: GradeOptions = { ...NO_OPTIONS, winnersMedianHoldMs: 60 * 60_000 };
    const entryTs = WEEKDAY_NOON_UTC;
    const quick = trip({ entryTs, exitTs: entryTs + 60 * 60_000, grossPnl: -10 });
    const slow = trip({ entryTs, exitTs: entryTs + 120 * 60_000, grossPnl: -10 });

    expect(gradeTrade(quick, context(), opts).exit).toBe(5);
    expect(gradeTrade(slow, context(), opts).exit).toBe(0);
  });

  it("scores 0 when the position was added to while under water", () => {
    const entryTs = WEEKDAY_NOON_UTC;
    const entry = fill({ side: "buy", qty: 1, price: 100, ts: entryTs });
    const added = fill({ side: "buy", qty: 1, price: 90, ts: entryTs + 60_000 });
    const trade = trip({ entryTs, entryPrice: 100, fills: [entry, added] });

    expect(gradeTrade(trade, context(), NO_OPTIONS).exit).toBe(0);
  });

  it("scores a wide weekend entry on whether it was closed before the open", () => {
    const entryTs = Date.UTC(2026, 8, 5, 12, 0, 0);
    const weekend = context({ sessionAtEntry: "weekend", divergenceAtEntryPct: 1.5, msToNextOpenAtEntry: 2 * 24 * 60 * 60 * 1000 });
    const closed = trip({ entryTs, exitTs: entryTs + 60 * 60_000 });
    const carried = trip({ entryTs, exitTs: entryTs + 5 * 24 * 60 * 60 * 1000 });

    expect(gradeTrade(closed, weekend, NO_OPTIONS).exit).toBe(5);
    expect(gradeTrade(carried, weekend, NO_OPTIONS).exit).toBe(0);
  });
});

describe("cost drag", () => {
  it("scores a tenth of gross at 5 and half of gross at 0", () => {
    const cheap = trip({ entryTs: WEEKDAY_NOON_UTC, grossPnl: 100, feesUsdt: 10 });
    const heavy = trip({ entryTs: WEEKDAY_NOON_UTC, grossPnl: 100, feesUsdt: 50 });

    expect(gradeTrade(cheap, context(), NO_OPTIONS).cost).toBe(5);
    expect(gradeTrade(heavy, context(), NO_OPTIONS).cost).toBe(0);
  });

  it("scores 0 when friction was larger than the gross", () => {
    const trade = trip({ entryTs: WEEKDAY_NOON_UTC, grossPnl: 5, feesUsdt: 4, slippageUsdt: 2 });

    expect(gradeTrade(trade, context(), NO_OPTIONS).cost).toBe(0);
  });

  it("stays neutral on an open trip, where there is no gross yet", () => {
    const trade = trip({ entryTs: WEEKDAY_NOON_UTC, exitTs: null, exitPrice: null, grossPnl: null, feesUsdt: 1 });

    expect(gradeTrade(trade, context(), NO_OPTIONS).cost).toBe(2.5);
    expect(gradeTrade(trade, context(), NO_OPTIONS).evidence.some((l) => l.includes("still open"))).toBe(true);
  });
});

describe("reasoning, weights and letters", () => {
  it("scores a trade with no note 2, never 0", () => {
    const trade = trip({ entryTs: WEEKDAY_NOON_UTC, rationale: null });

    expect(gradeTrade(trade, context(), NO_OPTIONS).reasoning).toBe(2);
  });

  it("takes the judge score when one was supplied", () => {
    const trade = trip({ entryTs: WEEKDAY_NOON_UTC, rationale: "hedged into the weekend" });

    expect(gradeTrade(trade, context(), { ...NO_OPTIONS, reasoningScore: 4 }).reasoning).toBe(4);
  });

  it("weights the five scores 25, 20, 25, 15 and 15", () => {
    const perfect = trip({ entryTs: WEEKDAY_NOON_UTC, grossPnl: 100, feesUsdt: 1, qty: 1, entryPrice: 100, equityAtEntry: 10_000 });
    const scores = gradeTrade(
      perfect,
      context({ divergenceAtEntryPct: 0, stop: { existed: true, price: 98, honoured: true } }),
      { rulebookCaps: { perSymbolPct: 10, maxBookFraction: 0.25 }, medianSizeUsdt: null, winnersMedianHoldMs: null, reasoningScore: 5 },
    );

    const expected =
      (scores.entry / 5) * 25 +
      (scores.sizing / 5) * 20 +
      (scores.exit / 5) * 25 +
      (scores.cost / 5) * 15 +
      (scores.reasoning / 5) * 15;
    expect(scores.total).toBeCloseTo(expected, 2);
    expect(scores.letter).toBe("A");
  });

  it("hands out the letter at each cutoff in the rubric", () => {
    const caps = { perSymbolPct: 10, maxBookFraction: 0.25 };
    const atCap = { qty: 10, entryPrice: 100, equityAtEntry: 10_000 };
    const clean = context({ divergenceAtEntryPct: 0, stop: { existed: true, price: 98, honoured: true } });

    // entry 5, sizing 5, exit 5, cost 5, reasoning 0 lands on exactly 85, the A cutoff.
    const a = gradeTrade(
      trip({ entryTs: WEEKDAY_NOON_UTC, grossPnl: 100, feesUsdt: 10, ...atCap }),
      clean,
      { rulebookCaps: caps, medianSizeUsdt: null, winnersMedianHoldMs: null, reasoningScore: 0 },
    );
    expect(a.total).toBeCloseTo(85, 6);
    expect(a.letter).toBe("A");

    // The same trade with friction above half of gross drops cost to 0 and lands on 70.
    const b = gradeTrade(
      trip({ entryTs: WEEKDAY_NOON_UTC, grossPnl: 100, feesUsdt: 60, ...atCap }),
      clean,
      { rulebookCaps: caps, medianSizeUsdt: null, winnersMedianHoldMs: null, reasoningScore: 0 },
    );
    expect(b.total).toBeCloseTo(70, 6);
    expect(b.letter).toBe("B");

    // A loser held 1.6 times the winners median scores exit 2, which lands on 55.
    const c = gradeTrade(
      trip({
        entryTs: WEEKDAY_NOON_UTC,
        exitTs: WEEKDAY_NOON_UTC + 96 * 60_000,
        grossPnl: -100,
        feesUsdt: 60,
        ...atCap,
      }),
      context({ divergenceAtEntryPct: 0 }),
      { rulebookCaps: caps, medianSizeUsdt: null, winnersMedianHoldMs: 60 * 60_000, reasoningScore: 0 },
    );
    expect(c.total).toBeCloseTo(55, 6);
    expect(c.letter).toBe("C");

    // A size 1.25 times the cap scores sizing 3.75, with exit and cost at 0: exactly 40.
    const d = gradeTrade(
      trip({
        entryTs: WEEKDAY_NOON_UTC,
        exitTs: WEEKDAY_NOON_UTC + 240 * 60_000,
        grossPnl: -100,
        feesUsdt: 60,
        qty: 12.5,
        entryPrice: 100,
        equityAtEntry: 10_000,
      }),
      context({ divergenceAtEntryPct: 0 }),
      { rulebookCaps: caps, medianSizeUsdt: null, winnersMedianHoldMs: 60 * 60_000, reasoningScore: 0 },
    );
    expect(d.total).toBeCloseTo(40, 6);
    expect(d.letter).toBe("D");

    const e = gradeTrade(
      trip({ entryTs: REANCHOR_UTC, grossPnl: 100, feesUsdt: 60, qty: 20, entryPrice: 100, equityAtEntry: 10_000 }),
      context({ divergenceAtEntryPct: 5, stop: { existed: true, price: 98, honoured: false } }),
      { rulebookCaps: caps, medianSizeUsdt: null, winnersMedianHoldMs: null, reasoningScore: 0 },
    );
    expect(e.total).toBe(0);
    expect(e.letter).toBe("E");
  });
});

describe("SilentJudge", () => {
  it("scores a trade with no note 2 and says why", async () => {
    const result = await new SilentJudge().score(trip({ rationale: null }), context());

    expect(result).toEqual({ score: 2, reason: "no note" });
  });

  it("refuses to score words a model never read", async () => {
    await expect(new SilentJudge().score(trip({ rationale: "long into the gap" }), context())).rejects.toBeInstanceOf(
      NoJudgeError,
    );
  });
});
