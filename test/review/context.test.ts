import { describe, expect, it } from "vitest";
import { buildContext, NoNewsFeed, type NewsProvider } from "../../src/review/context.js";
import { parseCandle } from "../../src/vendor/bitget/market.js";
import { bookHash } from "../../src/vendor/sim/book.js";
import type { OrderBook } from "../../src/vendor/sim/types.js";
import { fakeBitget, fixtureData } from "../support/fake-bitget.js";
import { fill, trip } from "../support/records.js";

// Context building against recorded Bitget candles, a recorded book and a recorded
// funding history. It does not cover the live network (the proof script does that) or a
// real news feed, and it does not check that the recorded fixtures still match what
// Bitget serves now.

const RAW_CANDLES = fixtureData<unknown[]>("candles-tsla-15m.json");
const RAW_BOOK = fixtureData<{ asks: Array<[number, number]>; bids: Array<[number, number]> }>(
  "orderbook-tsla.json",
);

/** The 15 minute candle that ended at the last regular close in the fixture window. */
const ANCHOR = parseCandle(RAW_CANDLES.at(-1));

const RAW_FUNDING = fixtureData<{ resultList: Array<Record<string, string>> }>(
  "funding-btcusdt.json",
);

const DEMO_ENTRY_TS = 1_788_878_648_858;
const DEMO_ENTRY_PRICE = 364.2011428999999;

/** Three stamps from the recorded BTCUSDT history: 0.0001, 0.000077 and 0.000052. */
const FUNDING_ENTRY_TS = 1_789_027_200_000;
const FUNDING_EXIT_TS = 1_789_113_600_000;
const FUNDING_RATE_SUM = 0.0001 + 0.000077 + 0.000052;

/** A Saturday inside the fixture window, so the weekend branch is a real timestamp. */
const WEEKEND_TS = Date.UTC(2026, 8, 5, 12, 0, 0);

function candleBitget() {
  return fakeBitget({ candlesHistory: () => RAW_CANDLES, fundingRateHistory: () => RAW_FUNDING });
}

function recordedBook(): { book: OrderBook; hash: string } {
  const book: OrderBook = {
    symbol: "TSLAUSDT",
    category: "USDT-FUTURES",
    ts: 1_788_878_648_853,
    asks: RAW_BOOK.asks.map(([price, size]) => ({ price, size })),
    bids: RAW_BOOK.bids.map(([price, size]) => ({ price, size })),
  };
  return { book, hash: bookHash(book) };
}

function newsAt(offsetMinutes: number): NewsProvider {
  return {
    async eventsNear(ts: number) {
      return [{ ts: ts + offsetMinutes * 60_000, title: "TSLA earnings after the close" }];
    },
  };
}

describe("buildContext", () => {
  it("measures divergence at entry against the candle that ended at the last regular close", async () => {
    const ctx = candleBitget();
    const entry = fill({ side: "buy", qty: 1.5, price: DEMO_ENTRY_PRICE, ts: DEMO_ENTRY_TS });

    const { context } = await buildContext(
      ctx,
      trip({ entryTs: DEMO_ENTRY_TS, entryPrice: DEMO_ENTRY_PRICE, exitTs: null, exitPrice: null, grossPnl: null, fills: [entry] }),
      { news: new NoNewsFeed(), rulebookStops: false },
    );

    const expected = ((DEMO_ENTRY_PRICE - ANCHOR.close) / ANCHOR.close) * 100;
    expect(context.divergenceAtEntryPct).toBeCloseTo(expected, 10);
    expect(context.divergenceAtExitPct).toBeNull();
    expect(context.nextEventMinutes).toBeNull();
  });

  it("reads the session and the wait for the next open from the clock", async () => {
    const { context } = await buildContext(
      candleBitget(),
      trip({ entryTs: WEEKEND_TS, exitTs: null, exitPrice: null, grossPnl: null, fills: [] }),
      { news: new NoNewsFeed(), rulebookStops: false },
    );

    expect(context.sessionAtEntry).toBe("weekend");
    expect(context.msToNextOpenAtEntry).toBeGreaterThan(0);
  });

  it("reports the minutes to the next event the feed knows about", async () => {
    const { context } = await buildContext(
      candleBitget(),
      trip({ entryTs: DEMO_ENTRY_TS, exitTs: null, exitPrice: null, grossPnl: null, fills: [] }),
      { news: newsAt(45), rulebookStops: false },
    );

    expect(context.nextEventMinutes).toBe(45);
  });

  it("takes the spread and the depth share from the book the fill named", async () => {
    const { book, hash } = recordedBook();
    const entry = fill({ side: "buy", qty: 1.5, price: DEMO_ENTRY_PRICE, ts: DEMO_ENTRY_TS, bookHash: hash });

    const { context } = await buildContext(
      candleBitget(),
      trip({
        entryTs: DEMO_ENTRY_TS,
        entryPrice: DEMO_ENTRY_PRICE,
        qty: 1.5,
        exitTs: null,
        exitPrice: null,
        grossPnl: null,
        fills: [entry],
      }),
      { news: new NoNewsFeed(), rulebookStops: false, books: new Map([[hash, book]]) },
    );

    const bestBid = book.bids[0]!.price;
    const bestAsk = book.asks[0]!.price;
    const mid = (bestBid + bestAsk) / 2;
    expect(context.spreadAtEntryBps).toBeCloseTo(((bestAsk - bestBid) / mid) * 10_000, 10);
    expect(context.usualSpreadBps).toBeCloseTo(context.spreadAtEntryBps!, 10);
    const visibleAsks = book.asks.reduce((sum, level) => sum + level.price * level.size, 0);
    expect(context.bookShareAtEntry).toBeCloseTo((1.5 * DEMO_ENTRY_PRICE) / visibleAsks, 10);
  });

  it("leaves the spread and the depth null when no book was recorded", async () => {
    const { context } = await buildContext(
      candleBitget(),
      trip({ entryTs: DEMO_ENTRY_TS, exitTs: null, exitPrice: null, grossPnl: null, fills: [] }),
      { news: new NoNewsFeed(), rulebookStops: false },
    );

    expect(context.spreadAtEntryBps).toBeNull();
    expect(context.usualSpreadBps).toBeNull();
    expect(context.bookShareAtEntry).toBeNull();
  });

  it("holds a rulebook stop that the tape never reached", async () => {
    const entryTs = 1_788_465_600_000;
    const { context } = await buildContext(
      candleBitget(),
      trip({ entryTs, entryPrice: 355, side: "long", exitTs: null, exitPrice: null, grossPnl: null, fills: [] }),
      { news: new NoNewsFeed(), rulebookStops: true },
    );

    expect(context.stop.existed).toBe(true);
    expect(context.stop.price).toBeCloseTo(355 * 0.98, 10);
    expect(context.stop.honoured).toBe(true);
  });

  it("marks a rulebook stop broken when the tape crossed it and the trip stayed open", async () => {
    const entryTs = 1_788_465_600_000;
    const { context } = await buildContext(
      candleBitget(),
      trip({ entryTs, entryPrice: 380, side: "long", exitTs: null, exitPrice: null, grossPnl: null, fills: [] }),
      { news: new NoNewsFeed(), rulebookStops: true },
    );

    expect(context.stop.price).toBeCloseTo(380 * 0.98, 10);
    expect(context.stop.honoured).toBe(false);
  });

  it("charges a perpetual long the funding it paid over the hold window", async () => {
    const { trip: priced } = await buildContext(
      candleBitget(),
      trip({
        symbol: "BTCUSDT",
        side: "long",
        qty: 2,
        entryPrice: 100,
        entryTs: FUNDING_ENTRY_TS,
        exitTs: FUNDING_EXIT_TS,
        exitPrice: 101,
      }),
      { news: new NoNewsFeed(), rulebookStops: false },
    );

    expect(priced.fundingUsdt).toBeCloseTo(-FUNDING_RATE_SUM * 200, 10);
  });

  it("pays a perpetual short the same funding the long was charged", async () => {
    const { trip: priced } = await buildContext(
      candleBitget(),
      trip({
        symbol: "BTCUSDT",
        side: "short",
        qty: 2,
        entryPrice: 100,
        entryTs: FUNDING_ENTRY_TS,
        exitTs: FUNDING_EXIT_TS,
        exitPrice: 99,
      }),
      { news: new NoNewsFeed(), rulebookStops: false },
    );

    expect(priced.fundingUsdt).toBeCloseTo(FUNDING_RATE_SUM * 200, 10);
  });

  it("never asks Bitget for funding on a SPOT trip, because spot has none", async () => {
    const ctx = candleBitget();

    const { trip: priced } = await buildContext(
      ctx,
      trip({ category: "SPOT", symbol: "RTSLAUSDT", entryTs: FUNDING_ENTRY_TS, exitTs: FUNDING_EXIT_TS }),
      { news: new NoNewsFeed(), rulebookStops: false },
    );

    expect(priced.fundingUsdt).toBe(0);
    expect(ctx.calls.some((call) => call.args["action"] === "fundingRateHistory")).toBe(false);
  });

  it("reads a stop from the record when the trader is not under the rulebook", async () => {
    const entry = fill({ side: "buy", qty: 1, price: 100, ts: DEMO_ENTRY_TS });
    const exit = fill({ side: "sell", qty: 1, price: 97, ts: DEMO_ENTRY_TS + 60_000, note: "order source: stop" });

    const { context } = await buildContext(
      candleBitget(),
      trip({ entryTs: DEMO_ENTRY_TS, exitTs: DEMO_ENTRY_TS + 60_000, fills: [entry, exit] }),
      { news: new NoNewsFeed(), rulebookStops: false },
    );

    expect(context.stop).toEqual({ existed: true, price: null, honoured: true });
  });
});
