import { describe, expect, it } from "vitest";
import { checkIdea } from "../../src/checklist/gate.js";
import { itemsFromPatterns } from "../../src/checklist/items.js";
import type { ChecklistItem, Idea, PatternHit } from "../../src/review/types.js";
import { fakeBitget, fixtureData } from "../support/fake-bitget.js";
import { trip } from "../support/records.js";

// The checklist gate against recorded Bitget responses. It does not cover the live
// market (the LIVE=1 test and the proof script do that), and it never sends an order:
// the only write verb touched anywhere is the SDK dry run, which returns a request.

const CANDLES = fixtureData<unknown[]>("candles-tsla-15m.json");
const BOOK = fixtureData("orderbook-tsla.json");
const TICKER = fixtureData<Array<Record<string, string>>>("ticker-tsla.json");
const INSTRUMENT = fixtureData("inst-tslausdt.json");

/** The moment the demo ledger was written, so the recorded fixtures line up with it. */
const NOW = new Date(1_788_878_648_858);

/** 16:30 ET on the Friday the candles were recorded: the bell has rung, so the gap is real. */
const AFTER_THE_CLOSE = new Date(Date.UTC(2026, 8, 4, 20, 30, 0));

const IDEA: Idea = {
  category: "USDT-FUTURES",
  symbol: "TSLAUSDT",
  side: "buy",
  notionalUsdt: 300,
  note: null,
};

function market(tickerRows: unknown = TICKER) {
  return fakeBitget({
    tickers: () => tickerRows,
    orderbook: () => BOOK,
    candlesHistory: () => CANDLES,
    instruments: () => INSTRUMENT,
    fundingRate: () => [{ symbol: "TSLAUSDT", fundingRate: "0.0001", nextUpdate: "0", fundingRateInterval: "8" }],
  });
}

function item(test: string, pattern = "chasing-the-gap"): ChecklistItem {
  return { id: `check-${pattern}`, pattern, text: `test ${test}`, test };
}

const CALM = { recentTrips: [], equity: 10_000, netExposureUsdt: 0, now: NOW };

describe("itemsFromPatterns", () => {
  it("turns each pattern into one item with a test the gate can run", () => {
    const hits: PatternHit[] = [
      { pattern: "chasing-the-gap", description: "", trades: [], evidence: [] },
      { pattern: "fee-bleed", description: "", trades: [], evidence: [] },
    ];

    expect(itemsFromPatterns(hits).map((i) => i.test)).toEqual(["divergence-under-1pct", "cost-under-20-bps"]);
  });

  it("keeps a pattern it has no test for and marks it for a human", () => {
    const hits: PatternHit[] = [{ pattern: "something-new", description: "a new habit", trades: [], evidence: [] }];

    const items = itemsFromPatterns(hits);
    expect(items[0]!.test).toBe("by-hand");
    expect(items[0]!.text).toContain("a new habit");
  });
});

describe("checkIdea", () => {
  it("stands the divergence item down while the regular session is open", async () => {
    const check = await checkIdea(market(), IDEA, [item("divergence-under-1pct")], CALM);

    expect(check.results[0]!.pass).toBe(true);
    expect(check.results[0]!.observed).toBe("regular session open, divergence not applicable");
  });

  it("fails the divergence item when the price has walked away from the last close", async () => {
    const check = await checkIdea(market(), IDEA, [item("divergence-under-1pct")], { ...CALM, now: AFTER_THE_CLOSE });

    expect(check.pass).toBe(false);
    expect(check.results[0]!.observed).toContain("percent from the");
    expect(check.dryRun).toBeNull();
    expect(check.dryRunNote).toContain("1 of 1 checklist items failed");
  });

  it("passes the divergence item when the price sits on the anchor", async () => {
    // A quote built to sit on the recorded anchor close, so the pass branch is exercised
    // against the same real candle the fail branch uses.
    const onAnchor = [{ ...TICKER[0], lastPr: "354.30", bidPr: "354.28", askPr: "354.32" }];

    const check = await checkIdea(market(onAnchor), IDEA, [item("divergence-under-1pct")], {
      ...CALM,
      now: AFTER_THE_CLOSE,
    });

    expect(check.results[0]!.pass).toBe(true);
    expect(check.pass).toBe(true);
  });

  it("blocks a re-entry within half an hour of a loss in the same name", async () => {
    const state = {
      ...CALM,
      recentTrips: [
        trip({ id: "loss", symbol: "TSLAUSDT", exitTs: NOW.getTime() - 10 * 60_000, grossPnl: -25 }),
      ],
    };

    const check = await checkIdea(market(), IDEA, [item("no-reentry-after-loss", "revenge-trading")], state);

    expect(check.results[0]!.pass).toBe(false);
    expect(check.results[0]!.observed).toContain("10.0 minutes ago");
  });

  it("measures net exposure into a weekend against equity", async () => {
    const saturday = new Date(Date.UTC(2026, 8, 5, 12, 0, 0));
    const heavy = { recentTrips: [], equity: 10_000, netExposureUsdt: 4_000, now: saturday };

    const check = await checkIdea(market(), IDEA, [item("weekend-exposure-under-40", "weekend-overexposure")], heavy);

    expect(check.results[0]!.pass).toBe(false);
    expect(check.results[0]!.observed).toContain("43.0 percent");
  });

  it("passes the weekend item on a weekday, when the market opens within a day", async () => {
    const check = await checkIdea(
      market(),
      IDEA,
      [item("weekend-exposure-under-40", "weekend-overexposure")],
      { recentTrips: [], equity: 10_000, netExposureUsdt: 9_000, now: new Date(Date.UTC(2026, 8, 8, 12, 0, 0)) },
    );

    expect(check.results[0]!.pass).toBe(true);
    expect(check.results[0]!.observed).toContain("not a weekend carry");
  });

  it("counts the week of turnover including the order being asked about", async () => {
    const state = {
      ...CALM,
      recentTrips: [
        trip({ id: "a", entryTs: NOW.getTime() - 3 * 60 * 60_000, exitTs: NOW.getTime(), qty: 300, entryPrice: 100, exitPrice: 100 }),
      ],
    };

    const check = await checkIdea(market(), IDEA, [item("weekly-turnover-under-5x", "overtrading")], state);

    expect(check.results[0]!.pass).toBe(false);
    expect(check.results[0]!.observed).toContain("6.03 times");
  });

  it("blocks an add to a name that is a day old and under water", async () => {
    const state = {
      ...CALM,
      recentTrips: [
        trip({ id: "stale", symbol: "TSLAUSDT", entryTs: NOW.getTime() - 3 * 24 * 60 * 60_000, exitTs: null, exitPrice: null, grossPnl: null, entryPrice: 400 }),
      ],
    };

    const check = await checkIdea(market(), IDEA, [item("no-stale-loser-open", "holding-losers")], state);

    expect(check.results[0]!.pass).toBe(false);
    expect(check.results[0]!.observed).toContain("3.0 days");
  });

  it("blocks an order that would put more than half of exposure in one name", async () => {
    const state = {
      ...CALM,
      recentTrips: [
        trip({ id: "here", symbol: "TSLAUSDT", exitTs: null, exitPrice: null, grossPnl: null, qty: 5, entryPrice: 100 }),
      ],
    };

    const check = await checkIdea(market(), IDEA, [item("symbol-under-half-exposure", "concentration")], state);

    expect(check.results[0]!.pass).toBe(false);
    expect(check.results[0]!.observed).toContain("100.0 percent");
  });

  it("prices the round trip in basis points from the live book and fee rate", async () => {
    const check = await checkIdea(market(), IDEA, [item("cost-under-20-bps", "fee-bleed")], CALM);

    expect(check.results[0]!.observed).toMatch(/bps to get in and hold a day/);
    expect(check.results[0]!.pass).toBe(true);
  });

  it("blocks the order when an open position is already past its stop", async () => {
    const state = {
      ...CALM,
      recentTrips: [
        trip({ id: "past", symbol: "TSLAUSDT", exitTs: null, exitPrice: null, grossPnl: null, entryPrice: 400 }),
      ],
    };

    const check = await checkIdea(market(), IDEA, [item("stop-not-already-crossed", "ignored-stops")], state);

    expect(check.results[0]!.pass).toBe(false);
    expect(check.results[0]!.observed).toContain("already through its 2 percent stop");
  });

  it("fails closed on an item with no automatic test", async () => {
    const check = await checkIdea(market(), IDEA, [item("by-hand", "something-new")], CALM);

    expect(check.results[0]!.pass).toBe(false);
    expect(check.results[0]!.observed).toContain("needs a human");
  });

  it("builds the Agent Hub dry run when every item passes", async () => {
    const check = await checkIdea(market(), IDEA, [], CALM);

    expect(check.pass).toBe(true);
    expect(check.dryRun).not.toBeNull();
    const request = JSON.stringify(check.dryRun);
    expect(request).toContain("TSLAUSDT");
    expect(request).toContain("place-order");
    expect(check.dryRunNote).toContain("without sending it");
  });

  it("refuses an idea with no size", async () => {
    await expect(checkIdea(market(), { ...IDEA, notionalUsdt: 0 }, [], CALM)).rejects.toBeInstanceOf(RangeError);
  });
});
