import { describe, expect, it } from "vitest";
import {
  addedWhileUnderWater,
  chasingTheGap,
  concentration,
  detectPatterns,
  feeBleed,
  holdingLosers,
  ignoredStops,
  overtrading,
  revengeTrading,
  weekendOverexposure,
} from "../../src/review/patterns.js";
import { fill, graded } from "../support/records.js";

// One firing table and one quiet table per detector. It does not cover how the trades
// or the context were built, and it does not claim the thresholds catch every version
// of a habit: a detector only ever reports what its own numbers show.

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

/** A Friday inside the NYSE calendar the vendored clock knows, 2026-09-11 16:00 UTC. */
const FRIDAY = Date.UTC(2026, 8, 11, 16, 0, 0);

describe("revenge trading", () => {
  it("fires on a bigger position in the same name minutes after a loss", () => {
    const loser = graded({ id: "loss", entryTs: 1_000, exitTs: 2_000, grossPnl: -50, qty: 1, entryPrice: 100 });
    const revenge = graded({ id: "revenge", entryTs: 2_000 + 10 * 60_000, exitTs: null, exitPrice: null, grossPnl: null, qty: 3, entryPrice: 100 });

    const hit = revengeTrading([loser, revenge])!;

    expect(hit.pattern).toBe("revenge-trading");
    expect(hit.trades.sort()).toEqual(["loss", "revenge"]);
    expect(hit.evidence[0]).toContain("10.0 minutes");
  });

  it("stays quiet when the re-entry is an hour later", () => {
    const loser = graded({ id: "loss", entryTs: 1_000, exitTs: 2_000, grossPnl: -50, qty: 1, entryPrice: 100 });
    const later = graded({ id: "later", entryTs: 2_000 + 90 * 60_000, qty: 3, entryPrice: 100 });

    expect(revengeTrading([loser, later])).toBeNull();
  });
});

describe("weekend overexposure", () => {
  it("fires when net exposure into the weekend is above 40 percent of equity", () => {
    const heavy = graded({ id: "heavy", entryTs: FRIDAY, exitTs: null, exitPrice: null, grossPnl: null, qty: 50, entryPrice: 100, equityAtEntry: 10_000 });

    const hit = weekendOverexposure([heavy], [{ ts: FRIDAY, equity: 10_000 }])!;

    expect(hit.pattern).toBe("weekend-overexposure");
    expect(hit.evidence[0]).toContain("50.0 percent");
  });

  it("stays quiet on a small position carried into the weekend", () => {
    const small = graded({ id: "small", entryTs: FRIDAY, exitTs: null, exitPrice: null, grossPnl: null, qty: 1, entryPrice: 100, equityAtEntry: 10_000 });

    expect(weekendOverexposure([small], [{ ts: FRIDAY, equity: 10_000 }])).toBeNull();
  });

  it("fires on an unhedged rToken above a tenth of equity and not on a hedged one", () => {
    const spot = graded({ id: "spot", category: "SPOT", symbol: "RTSLAUSDT", entryTs: FRIDAY, exitTs: null, exitPrice: null, grossPnl: null, qty: 15, entryPrice: 100, equityAtEntry: 10_000 });
    const hedge = graded({ id: "hedge", category: "USDT-FUTURES", symbol: "TSLAUSDT", side: "short", entryTs: FRIDAY, exitTs: null, exitPrice: null, grossPnl: null, qty: 15, entryPrice: 100, equityAtEntry: 10_000 });
    const curve = [{ ts: FRIDAY, equity: 10_000 }];

    expect(weekendOverexposure([spot], curve)!.evidence[0]).toContain("no perpetual hedge");
    expect(weekendOverexposure([spot, hedge], curve)).toBeNull();
  });
});

describe("chasing the gap", () => {
  it("fires on two entries above one percent of divergence", () => {
    const one = graded({ id: "one" }, { divergenceAtEntryPct: 1.4 });
    const two = graded({ id: "two" }, { divergenceAtEntryPct: -2.1 });

    expect(chasingTheGap([one, two])!.trades).toEqual(["one", "two"]);
  });

  it("stays quiet on a single wide entry", () => {
    expect(chasingTheGap([graded({ id: "one" }, { divergenceAtEntryPct: 1.4 })])).toBeNull();
  });
});

describe("overtrading", () => {
  const churn = () =>
    Array.from({ length: 20 }, (_, index) =>
      graded({
        id: `t${index}`,
        entryTs: 1_000 + index * HOUR,
        exitTs: 1_000 + index * HOUR + 60_000,
        qty: 30,
        entryPrice: 100,
        exitPrice: 100.1,
        grossPnl: 3,
        feesUsdt: 3,
        equityAtEntry: 10_000,
      }),
    );

  it("fires when a week turns over five times equity and friction eats a third of gross", () => {
    const hit = overtrading(churn(), [{ ts: 0, equity: 10_000 }])!;

    expect(hit.pattern).toBe("overtrading");
    expect(hit.evidence[0]).toContain("times");
  });

  it("stays quiet when the same turnover is cheap", () => {
    const cheap = churn().map((g) => ({ ...g, trade: { ...g.trade, feesUsdt: 0.1 } }));

    expect(overtrading(cheap, [{ ts: 0, equity: 10_000 }])).toBeNull();
  });
});

describe("holding losers", () => {
  it("fires when the median loser is held more than twice the median winner", () => {
    const winner = graded({ id: "win", entryTs: 0, exitTs: HOUR, grossPnl: 10 });
    const loser = graded({ id: "lose", entryTs: 0, exitTs: 5 * HOUR, grossPnl: -10 });

    expect(holdingLosers([winner, loser])!.trades).toEqual(["lose"]);
  });

  it("stays quiet when losers are cut faster than winners are run", () => {
    const winner = graded({ id: "win", entryTs: 0, exitTs: 5 * HOUR, grossPnl: 10 });
    const loser = graded({ id: "lose", entryTs: 0, exitTs: HOUR, grossPnl: -10 });

    expect(holdingLosers([winner, loser])).toBeNull();
  });
});

describe("concentration", () => {
  it("fires when one name holds more than half of exposure for over a day", () => {
    const big = graded({ id: "big", symbol: "TSLAUSDT", entryTs: 0, exitTs: 3 * DAY, qty: 90, entryPrice: 100 });
    const small = graded({ id: "small", symbol: "NVDAUSDT", entryTs: 0, exitTs: 3 * DAY, qty: 1, entryPrice: 100 });

    const hit = concentration([big, small])!;

    expect(hit.evidence[0]).toContain("TSLAUSDT");
    expect(hit.evidence[0]).toContain("days");
  });

  it("stays quiet on a book split evenly between two names", () => {
    const one = graded({ id: "one", symbol: "TSLAUSDT", entryTs: 0, exitTs: 3 * DAY, qty: 10, entryPrice: 100 });
    const two = graded({ id: "two", symbol: "NVDAUSDT", entryTs: 0, exitTs: 3 * DAY, qty: 10, entryPrice: 100 });

    expect(concentration([one, two])).toBeNull();
  });
});

describe("fee bleed", () => {
  it("fires when friction is more than a fifth of gross", () => {
    const trade = graded({ id: "one", grossPnl: 100, feesUsdt: 21, slippageUsdt: 5 });

    expect(feeBleed([trade])!.evidence[0]).toContain("26.0 percent");
  });

  it("stays quiet when friction is a tenth of gross", () => {
    expect(feeBleed([graded({ id: "one", grossPnl: 100, feesUsdt: 10 })])).toBeNull();
  });
});

describe("ignored stops", () => {
  it("fires on a stop the price went through while the position stayed open", () => {
    const broken = graded({ id: "one" }, { stop: { existed: true, price: 98, honoured: false } });

    expect(ignoredStops([broken])!.trades).toEqual(["one"]);
  });

  it("stays quiet when the stop held", () => {
    const held = graded({ id: "one" }, { stop: { existed: true, price: 98, honoured: true } });

    expect(ignoredStops([held])).toBeNull();
  });
});

describe("added while under water", () => {
  it("fires on a buy that grew a long whose mark had fallen below its average entry", () => {
    const first = fill({ id: "one", side: "buy", qty: 1, price: 100, ts: 1_000 });
    const add = fill({ id: "two", side: "buy", qty: 1, price: 90, ts: 2_000 });

    const hit = addedWhileUnderWater([first, add], [{ ts: 2_000, symbol: "TSLAUSDT", price: 90 }])!;

    expect(hit.pattern).toBe("added-while-under-water");
    expect(hit.trades).toEqual(["two"]);
    expect(hit.evidence[0]).toContain("averaging 100.0000");
  });

  it("measures the third add against the average of the first two, not the first price", () => {
    const fills = [
      fill({ id: "one", side: "buy", qty: 1, price: 100, ts: 1_000 }),
      fill({ id: "two", side: "buy", qty: 1, price: 80, ts: 2_000 }),
      fill({ id: "three", side: "buy", qty: 1, price: 85, ts: 3_000 }),
    ];
    const marks = fills.map((f) => ({ ts: f.ts, symbol: f.symbol, price: f.price }));

    const hit = addedWhileUnderWater(fills, marks)!;

    expect(hit.trades).toEqual(["two", "three"]);
    expect(hit.evidence[1]).toContain("averaging 90.0000");
  });

  it("fires on a short that was added to while the price ran up", () => {
    const first = fill({ id: "one", side: "sell", qty: 1, price: 100, ts: 1_000 });
    const add = fill({ id: "two", side: "sell", qty: 1, price: 110, ts: 2_000 });

    const hit = addedWhileUnderWater([first, add], [{ ts: 2_000, symbol: "TSLAUSDT", price: 110 }])!;

    expect(hit.trades).toEqual(["two"]);
  });

  it("stays quiet when the add was made into a winner", () => {
    const first = fill({ id: "one", side: "buy", qty: 1, price: 100, ts: 1_000 });
    const add = fill({ id: "two", side: "buy", qty: 1, price: 110, ts: 2_000 });

    expect(addedWhileUnderWater([first, add], [{ ts: 2_000, symbol: "TSLAUSDT", price: 110 }])).toBeNull();
  });

  it("stays quiet when the fill cut the position instead of growing it", () => {
    const first = fill({ id: "one", side: "buy", qty: 2, price: 100, ts: 1_000 });
    const cut = fill({ id: "two", side: "sell", qty: 1, price: 90, ts: 2_000 });

    expect(addedWhileUnderWater([first, cut], [{ ts: 2_000, symbol: "TSLAUSDT", price: 90 }])).toBeNull();
  });

  it("claims nothing when the record kept no mark for that symbol", () => {
    const first = fill({ id: "one", side: "buy", qty: 1, price: 100, ts: 1_000 });
    const add = fill({ id: "two", side: "buy", qty: 1, price: 90, ts: 2_000 });

    expect(addedWhileUnderWater([first, add], [{ ts: 2_000, symbol: "NVDAUSDT", price: 90 }])).toBeNull();
  });

  it("starts a fresh average after a sell flipped the position short", () => {
    const fills = [
      fill({ id: "one", side: "buy", qty: 1, price: 100, ts: 1_000 }),
      fill({ id: "two", side: "sell", qty: 2, price: 90, ts: 2_000 }),
      fill({ id: "three", side: "sell", qty: 1, price: 95, ts: 3_000 }),
    ];
    const marks = fills.map((f) => ({ ts: f.ts, symbol: f.symbol, price: f.price }));

    const hit = addedWhileUnderWater(fills, marks)!;

    expect(hit.trades).toEqual(["three"]);
    expect(hit.evidence[0]).toContain("averaging 90.0000");
  });
});

describe("detectPatterns", () => {
  it("returns only the detectors that fired", () => {
    const broken = graded({ id: "one", grossPnl: 100, feesUsdt: 1 }, { stop: { existed: true, price: 98, honoured: false } });

    const hits = detectPatterns([broken], [{ ts: 0, equity: 10_000 }]);

    expect(hits.map((h) => h.pattern)).toEqual(["ignored-stops"]);
  });

  it("returns nothing for an empty table", () => {
    expect(detectPatterns([], [])).toEqual([]);
  });

  it("reports the under-water add against the trips that hold the fill", () => {
    const first = fill({ id: "one", side: "buy", qty: 1, price: 100, ts: 1_000 });
    const add = fill({ id: "two", side: "buy", qty: 1, price: 90, ts: 2_000 });
    const table = [graded({ id: "trip-one", fills: [first, add], grossPnl: -5 })];

    const hits = detectPatterns(table, [], [{ ts: 2_000, symbol: "TSLAUSDT", price: 90 }]);

    const hit = hits.find((h) => h.pattern === "added-while-under-water")!;
    expect(hit.trades).toEqual(["trip-one"]);
  });
});
