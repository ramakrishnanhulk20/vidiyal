import type { BitgetContext } from "../vendor/bitget/client.js";
import { nyseClock } from "../vendor/bitget/hours.js";
import { getCandles, getFundingHistory } from "../vendor/bitget/market.js";
import type { Candle, Category } from "../vendor/bitget/types.js";
import type { OrderBook } from "../vendor/sim/types.js";
import type { RoundTrip, TradeContext } from "./types.js";

export interface NewsProvider {
  eventsNear(ts: number, symbol: string): Promise<Array<{ ts: number; title: string }>>;
}

export interface ContextOptions {
  news: NewsProvider;
  rulebookStops: boolean;
  /**
   * The books a Kaaval ledger recorded, keyed by hash, from readLedgerBooks. Bitget
   * publishes no historical order book, so the spread and the depth at the moment of a
   * trade are only knowable when the record kept the book. Without this map both stay
   * null, which is what a Bitget account read gets.
   */
  books?: Map<string, OrderBook>;
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

/** Four hours back covers a thin rToken with gaps in its afternoon candles. */
const ANCHOR_LOOKBACK_MS = 4 * 60 * 60 * 1000;

/** The rulebook stop distances, from kaaval/docs/rulebook.md under Loss limits. */
const STOP_PCT: Record<Category, number> = { SPOT: 3, "USDT-FUTURES": 2 };

/** Kaaval ticks every 15 minutes, so one 15m candle is the one tick a stop may lag by. */
const ONE_TICK_MS = FIFTEEN_MINUTES_MS;

const BPS = 10_000;

/**
 * A feed that reports no events, so context can be built before a real calendar is
 * wired in. It never invents an event: a trade graded through this feed simply carries
 * no event evidence, and the review says so.
 */
export class NoNewsFeed implements NewsProvider {
  async eventsNear(): Promise<Array<{ ts: number; title: string }>> {
    return [];
  }
}

/**
 * The market around one round trip, rebuilt from Bitget and from the record.
 *
 * Divergence at a past moment is the price the trade actually got against the close of
 * the 15 minute candle that ended at the last regular US close before it, the same
 * anchor the live divergence uses, so a trade and a live quote are measured the same
 * way. Anything Bitget does not publish for the past, the spread and the depth, comes
 * from the recorded book or stays null. Nothing here is estimated.
 *
 * The trip comes back as well as the context because funding is a cost of the trade
 * rather than a fact about the market, and it can only be known after Bitget's funding
 * history has been read. The returned trip is a copy: the caller has to use it, and
 * nothing the caller already holds is mutated behind its back.
 */
export async function buildContext(
  ctx: BitgetContext,
  trip: RoundTrip,
  opts: ContextOptions,
): Promise<{ context: TradeContext; trip: RoundTrip }> {
  const clock = nyseClock(new Date(trip.entryTs));
  const [divergenceAtEntryPct, divergenceAtExitPct, events, fundingUsdt] = await Promise.all([
    pastDivergencePct(ctx, trip.category, trip.symbol, trip.entryPrice, trip.entryTs),
    trip.exitTs !== null && trip.exitPrice !== null
      ? pastDivergencePct(ctx, trip.category, trip.symbol, trip.exitPrice, trip.exitTs)
      : Promise.resolve(null),
    opts.news.eventsNear(trip.entryTs, trip.symbol),
    fundingOver(ctx, trip),
  ]);

  const next = events
    .filter((event) => event.ts >= trip.entryTs)
    .sort((a, b) => a.ts - b.ts)
    .at(0);

  const books = opts.books;
  const entryFill = trip.fills.find((f) => f.ts === trip.entryTs) ?? trip.fills[0];
  const entryBook = books && entryFill?.bookHash ? (books.get(entryFill.bookHash) ?? null) : null;

  const context: TradeContext = {
    divergenceAtEntryPct,
    divergenceAtExitPct,
    spreadAtEntryBps: entryBook ? spreadBps(entryBook) : null,
    sessionAtEntry: clock.isHoliday
      ? "holiday"
      : clock.isWeekend
        ? "weekend"
        : clock.regularSessionOpen
          ? "regular"
          : "after-hours",
    msToNextOpenAtEntry: clock.nextRegularOpen - trip.entryTs,
    nextEventMinutes: next ? Math.round((next.ts - trip.entryTs) / 60_000) : null,
    bookShareAtEntry: entryBook ? bookShare(entryBook, trip) : null,
    usualSpreadBps: books ? medianSpreadBps(books, trip.category, trip.symbol) : null,
    stop: await resolveStop(ctx, trip, opts.rulebookStops),
  };

  return { context, trip: { ...trip, fundingUsdt } };
}

/**
 * What funding did to this position while it was open, in USDT.
 *
 * Negative means the trader paid and positive means the trader was paid: a long pays
 * the funding rate when the rate is positive and a short collects it. Only the funding
 * instants strictly after the entry and at or before the exit are counted, because a
 * position opened after a stamp did not pay that one, and the notional is measured at
 * the entry price since the record carries no mark at each funding instant. A trip
 * still open is charged up to now.
 *
 * SPOT has no funding, so its recorded number is left alone. A refused or unreachable
 * funding history also leaves the recorded number alone rather than reporting a zero
 * this code cannot stand behind.
 */
async function fundingOver(ctx: BitgetContext, trip: RoundTrip): Promise<number> {
  if (trip.category !== "USDT-FUTURES") return trip.fundingUsdt;

  const until = trip.exitTs ?? Date.now();
  let history: Array<{ ts: number; rate: number }>;
  try {
    history = await getFundingHistory(ctx, trip.symbol, trip.entryTs);
  } catch {
    return trip.fundingUsdt;
  }

  const notional = trip.qty * trip.entryPrice;
  const direction = trip.side === "long" ? -1 : 1;
  return history
    .filter((entry) => entry.ts > trip.entryTs && entry.ts <= until)
    .reduce((sum, entry) => sum + direction * entry.rate * notional, 0);
}

/**
 * The price at a past moment against the last regular close before it. The live
 * divergence in vendor reads the ticker for the price; here the price is the one the
 * trade paid, which is a recorded number and needs no extra call.
 */
async function pastDivergencePct(
  ctx: BitgetContext,
  category: Category,
  symbol: string,
  priceThen: number,
  at: number,
): Promise<number | null> {
  const closeTs = nyseClock(new Date(at)).lastRegularClose;
  const candles = await getCandles(ctx, category, symbol, "15m", {
    since: closeTs - ANCHOR_LOOKBACK_MS,
    until: closeTs,
  });
  const exact = candles.find((c) => c.ts === closeTs - FIFTEEN_MINUTES_MS);
  const anchor = exact ?? candles.filter((c) => c.ts < closeTs).at(-1);
  if (!anchor || anchor.close <= 0) return null;
  return ((priceThen - anchor.close) / anchor.close) * 100;
}

function spreadBps(book: OrderBook): number | null {
  const bid = book.bids[0];
  const ask = book.asks[0];
  if (!bid || !ask) return null;
  const mid = (bid.price + ask.price) / 2;
  if (mid <= 0) return null;
  return ((ask.price - bid.price) / mid) * BPS;
}

/** How much of the visible size on the side it hit the entry would have taken. */
function bookShare(book: OrderBook, trip: RoundTrip): number | null {
  const levels = trip.side === "long" ? book.asks : book.bids;
  const visible = levels.reduce((sum, level) => sum + level.price * level.size, 0);
  if (visible <= 0) return null;
  return (trip.qty * trip.entryPrice) / visible;
}

function medianSpreadBps(
  books: Map<string, OrderBook>,
  category: Category,
  symbol: string,
): number | null {
  const spreads: number[] = [];
  for (const book of books.values()) {
    if (book.symbol !== symbol || book.category !== category) continue;
    const spread = spreadBps(book);
    if (spread !== null) spreads.push(spread);
  }
  if (spreads.length === 0) return null;
  spreads.sort((a, b) => a - b);
  const middle = Math.floor(spreads.length / 2);
  if (spreads.length % 2 === 1) return spreads[middle]!;
  return (spreads[middle - 1]! + spreads[middle]!) / 2;
}

/**
 * Whether a stop existed for this trip and whether it held.
 *
 * An agent under the Kaaval rulebook has a stop on every entry, so the price is the
 * rulebook distance from the entry and the tape decides whether it held. A person has a
 * stop only when the record shows one fired. Only candles that start after the entry
 * are read, so a low printed seconds before the entry can never be counted as a
 * crossing: a trip shorter than one candle comes back honoured null, not accused.
 */
async function resolveStop(
  ctx: BitgetContext,
  trip: RoundTrip,
  rulebookStops: boolean,
): Promise<TradeContext["stop"]> {
  if (!rulebookStops) {
    const fired = trip.fills.some((f) => f.note === "order source: stop");
    return { existed: fired, price: null, honoured: fired ? true : null };
  }

  const pct = STOP_PCT[trip.category];
  const price =
    trip.side === "long" ? trip.entryPrice * (1 - pct / 100) : trip.entryPrice * (1 + pct / 100);
  const until = trip.exitTs ?? Date.now();
  if (until <= trip.entryTs) return { existed: true, price, honoured: null };

  let candles: Candle[];
  try {
    candles = await getCandles(ctx, trip.category, trip.symbol, "15m", {
      since: trip.entryTs,
      until,
    });
  } catch {
    return { existed: true, price, honoured: null };
  }

  const inside = candles.filter((c) => c.ts >= trip.entryTs && c.ts + FIFTEEN_MINUTES_MS <= until);
  if (inside.length === 0) return { existed: true, price, honoured: null };

  const crossed = inside.find((c) => (trip.side === "long" ? c.low <= price : c.high >= price));
  if (!crossed) return { existed: true, price, honoured: true };

  const honoured = trip.exitTs !== null && trip.exitTs <= crossed.ts + FIFTEEN_MINUTES_MS + ONE_TICK_MS;
  return { existed: true, price, honoured };
}
