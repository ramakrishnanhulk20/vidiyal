import { nyseClock } from "../vendor/bitget/hours.js";
import type { FillRecord, GradedTrade, PatternHit, RoundTrip } from "./types.js";

export type EquityCurve = Array<{ ts: number; equity: number }>;

/** A price the record observed for a symbol at a moment: a ledger mark or a fill. */
export type MarkPoint = { ts: number; symbol: string; price: number };

/** Every threshold below is the one written in docs/rubric.md under Patterns. */
const REVENGE_WINDOW_MS = 30 * 60_000;
const WEEKEND_NET_SHARE = 0.4;
const WEEKEND_RTOKEN_SHARE = 0.1;
const GAP_PCT = 1;
const GAP_MIN_TRADES = 2;
const TURNOVER_MULTIPLE = 5;
const OVERTRADING_COST_SHARE = 0.3;
const LOSER_HOLD_MULTIPLE = 2;
const CONCENTRATION_SHARE = 0.5;
const CONCENTRATION_MS = 24 * 60 * 60 * 1000;
const FEE_BLEED_SHARE = 0.2;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Quantities are floating point, the same epsilon review/trades pairs lots with. */
const QTY_EPSILON = 1e-12;

/**
 * Every detector in the rubric, run over one trade table.
 *
 * Pure and evidence first: a detector returns the trips that prove it and the numbers
 * that fired it, so a card on the desk is never a claim on its own. A detector with
 * too little to work on returns nothing rather than a maybe.
 */
export function detectPatterns(
  graded: GradedTrade[],
  equityCurve: EquityCurve,
  marks: MarkPoint[] = [],
): PatternHit[] {
  return [
    revengeTrading(graded),
    weekendOverexposure(graded, equityCurve),
    chasingTheGap(graded),
    overtrading(graded, equityCurve),
    holdingLosers(graded),
    concentration(graded),
    feeBleed(graded),
    ignoredStops(graded),
    onTrips(graded, addedWhileUnderWater(allFills(graded), marks)),
  ].filter((hit): hit is PatternHit => hit !== null);
}

/**
 * Every fill in the table, once. A fill that closed one trip and opened the next appears
 * in both, and counting it twice would let the position walk it builds drift.
 */
function allFills(graded: GradedTrade[]): FillRecord[] {
  const byId = new Map<string, FillRecord>();
  for (const g of graded) {
    for (const fill of g.trade.fills) byId.set(fill.id, fill);
  }
  return [...byId.values()];
}

/**
 * The under-water detector proves itself with fills, because that is the only level
 * where an add is visible, so its proof is carried back to the trips that hold them for
 * a desk that lists trades.
 */
function onTrips(graded: GradedTrade[], hit: PatternHit | null): PatternHit | null {
  if (!hit) return null;
  const fillIds = new Set(hit.trades);
  const trades = graded
    .filter((g) => g.trade.fills.some((fill) => fillIds.has(fill.id)))
    .map((g) => g.trade.id);
  return { ...hit, trades: trades.length > 0 ? trades : hit.trades };
}

/** A new entry in the same instrument within half an hour of a loss, and bigger. */
export function revengeTrading(graded: GradedTrade[]): PatternHit | null {
  const trades = new Set<string>();
  const evidence: string[] = [];

  for (const loser of graded) {
    const loss = loser.trade;
    if (loss.exitTs === null || loss.grossPnl === null || loss.grossPnl >= 0) continue;

    for (const next of graded) {
      const entry = next.trade;
      if (entry.id === loss.id) continue;
      if (entry.symbol !== loss.symbol || entry.category !== loss.category) continue;
      const gap = entry.entryTs - loss.exitTs;
      if (gap < 0 || gap > REVENGE_WINDOW_MS) continue;
      if (notional(entry) <= notional(loss)) continue;

      trades.add(loss.id).add(entry.id);
      evidence.push(
        `${entry.id} opened ${(gap / 60_000).toFixed(1)} minutes after ${loss.id} lost ${Math.abs(loss.grossPnl).toFixed(2)} USDT, at ${notional(entry).toFixed(2)} USDT against ${notional(loss).toFixed(2)} USDT`,
      );
    }
  }

  if (trades.size === 0) return null;
  return {
    pattern: "revenge-trading",
    description: "A loss was followed within 30 minutes by a larger position in the same instrument",
    trades: [...trades],
    evidence,
  };
}

/**
 * Exposure carried into a weekend, when the US market is shut for two days and Bitget
 * itself says weekend rToken prices are reference quotes that re-anchor at the open.
 */
export function weekendOverexposure(graded: GradedTrade[], equityCurve: EquityCurve): PatternHit | null {
  const trades = new Set<string>();
  const evidence: string[] = [];

  for (const moment of weekendMoments(graded)) {
    const open = graded.filter((g) => isOpenAt(g.trade, moment));
    if (open.length === 0) continue;
    const equity = equityAt(equityCurve, moment) ?? open[0]?.trade.equityAtEntry ?? null;
    if (equity === null || equity <= 0) continue;

    const net = Math.abs(
      open.reduce((sum, g) => sum + (g.trade.side === "long" ? notional(g.trade) : -notional(g.trade)), 0),
    );
    if (net > WEEKEND_NET_SHARE * equity) {
      for (const g of open) trades.add(g.trade.id);
      evidence.push(
        `into the weekend of ${new Date(moment).toISOString().slice(0, 10)}, net exposure was ${net.toFixed(2)} USDT against ${equity.toFixed(2)} USDT of equity, ${((net / equity) * 100).toFixed(1)} percent`,
      );
    }

    for (const g of open) {
      const position = g.trade;
      if (position.category !== "SPOT" || !looksLikeRToken(position.symbol)) continue;
      if (notional(position) <= WEEKEND_RTOKEN_SHARE * equity) continue;
      const hedged = open.some(
        (other) =>
          other.trade.category === "USDT-FUTURES" &&
          underlying(other.trade.symbol, other.trade.category) === underlying(position.symbol, position.category),
      );
      if (hedged) continue;
      trades.add(position.id);
      evidence.push(
        `${position.id} carried ${notional(position).toFixed(2)} USDT of ${position.symbol}, ${((notional(position) / equity) * 100).toFixed(1)} percent of equity, into the weekend with no perpetual hedge open`,
      );
    }
  }

  if (trades.size === 0) return null;
  return {
    pattern: "weekend-overexposure",
    description: "Exposure was carried into a weekend above the level the rulebook allows",
    trades: [...trades],
    evidence,
  };
}

/** Entering while the round-the-clock price had already walked away from the close. */
export function chasingTheGap(graded: GradedTrade[]): PatternHit | null {
  const chased = graded.filter(
    (g) => g.context.divergenceAtEntryPct !== null && Math.abs(g.context.divergenceAtEntryPct) > GAP_PCT,
  );
  if (chased.length < GAP_MIN_TRADES) return null;

  return {
    pattern: "chasing-the-gap",
    description: "More than one entry was made while the price was more than one percent from the last regular close",
    trades: chased.map((g) => g.trade.id),
    evidence: chased.map(
      (g) => `${g.trade.id} entered at ${g.context.divergenceAtEntryPct!.toFixed(2)} percent from the last regular close`,
    ),
  };
}

/** Turnover far above equity in one week, with friction eating the result. */
export function overtrading(graded: GradedTrade[], equityCurve: EquityCurve): PatternHit | null {
  if (graded.length === 0) return null;
  const first = Math.min(...graded.map((g) => g.trade.entryTs));
  const trades = new Set<string>();
  const evidence: string[] = [];

  for (let start = first; start <= Math.max(...graded.map((g) => g.trade.entryTs)); start += WEEK_MS) {
    const week = graded.filter((g) => g.trade.entryTs >= start && g.trade.entryTs < start + WEEK_MS);
    if (week.length === 0) continue;
    const equity = equityAt(equityCurve, start) ?? week[0]?.trade.equityAtEntry ?? null;
    if (equity === null || equity <= 0) continue;

    const turnover = week.reduce((sum, g) => sum + turnoverOf(g.trade), 0);
    const gross = week.reduce((sum, g) => sum + Math.abs(g.trade.grossPnl ?? 0), 0);
    const costs = week.reduce((sum, g) => sum + costsOf(g.trade), 0);
    if (turnover <= TURNOVER_MULTIPLE * equity) continue;
    if (gross <= 0 || costs <= OVERTRADING_COST_SHARE * gross) continue;

    for (const g of week) trades.add(g.trade.id);
    evidence.push(
      `week of ${new Date(start).toISOString().slice(0, 10)}: ${turnover.toFixed(2)} USDT traded on ${equity.toFixed(2)} USDT of equity, ${(turnover / equity).toFixed(1)} times, with ${costs.toFixed(2)} USDT of friction against ${gross.toFixed(2)} USDT gross`,
    );
  }

  if (trades.size === 0) return null;
  return {
    pattern: "overtrading",
    description: "A week of turnover above five times equity where friction ate more than a third of the gross",
    trades: [...trades],
    evidence,
  };
}

/** Losers held far longer than winners, the oldest habit in the book. */
export function holdingLosers(graded: GradedTrade[]): PatternHit | null {
  const closed = graded.filter((g) => g.trade.exitTs !== null && g.trade.grossPnl !== null);
  const losers = closed.filter((g) => g.trade.grossPnl! < 0);
  const winners = closed.filter((g) => g.trade.grossPnl! > 0);
  if (losers.length === 0 || winners.length === 0) return null;

  const loserHold = median(losers.map((g) => g.trade.exitTs! - g.trade.entryTs));
  const winnerHold = median(winners.map((g) => g.trade.exitTs! - g.trade.entryTs));
  if (winnerHold <= 0 || loserHold <= LOSER_HOLD_MULTIPLE * winnerHold) return null;

  return {
    pattern: "holding-losers",
    description: "Losing trades were held more than twice as long as winning ones",
    trades: losers.map((g) => g.trade.id),
    evidence: [
      `median hold was ${(loserHold / 60_000).toFixed(1)} minutes on ${losers.length} losers against ${(winnerHold / 60_000).toFixed(1)} minutes on ${winners.length} winners, ${(loserHold / winnerHold).toFixed(1)} times`,
    ],
  };
}

/**
 * One instrument above half of open exposure for more than a day. The walk ends at the
 * last recorded entry or exit: a position still open past the end of the record is not
 * counted, because nothing in the record says it was still there.
 */
export function concentration(graded: GradedTrade[]): PatternHit | null {
  const moments = [
    ...new Set(graded.flatMap((g) => (g.trade.exitTs === null ? [g.trade.entryTs] : [g.trade.entryTs, g.trade.exitTs]))),
  ].sort((a, b) => a - b);
  if (moments.length < 2) return null;

  const runs = new Map<string, number>();
  const worst = new Map<string, { ms: number; share: number }>();

  for (let index = 0; index < moments.length - 1; index += 1) {
    const from = moments[index]!;
    const span = moments[index + 1]! - from;
    const open = graded.filter((g) => isOpenAt(g.trade, from));
    const total = open.reduce((sum, g) => sum + notional(g.trade), 0);
    const bySymbol = new Map<string, number>();
    for (const g of open) {
      bySymbol.set(g.trade.symbol, (bySymbol.get(g.trade.symbol) ?? 0) + notional(g.trade));
    }

    for (const symbol of new Set([...runs.keys(), ...bySymbol.keys()])) {
      const share = total > 0 ? (bySymbol.get(symbol) ?? 0) / total : 0;
      if (share > CONCENTRATION_SHARE) {
        const run = (runs.get(symbol) ?? 0) + span;
        runs.set(symbol, run);
        const seen = worst.get(symbol);
        if (!seen || run > seen.ms) worst.set(symbol, { ms: run, share });
      } else {
        runs.set(symbol, 0);
      }
    }
  }

  const heavy = [...worst.entries()].filter(([, seen]) => seen.ms > CONCENTRATION_MS);
  if (heavy.length === 0) return null;

  const symbols = new Set(heavy.map(([symbol]) => symbol));
  return {
    pattern: "concentration",
    description: "One instrument held more than half of open exposure for more than a day",
    trades: graded.filter((g) => symbols.has(g.trade.symbol)).map((g) => g.trade.id),
    evidence: heavy.map(
      ([symbol, seen]) =>
        `${symbol} held ${(seen.share * 100).toFixed(1)} percent of open exposure for ${(seen.ms / DAY_MS).toFixed(1)} days`,
    ),
  };
}

/** Fees, slippage and funding as a share of everything the period actually made. */
export function feeBleed(graded: GradedTrade[]): PatternHit | null {
  if (graded.length === 0) return null;
  const costs = graded.reduce((sum, g) => sum + costsOf(g.trade), 0);
  const gross = graded.reduce((sum, g) => sum + Math.abs(g.trade.grossPnl ?? 0), 0);
  if (costs <= 0) return null;
  if (gross > 0 && costs <= FEE_BLEED_SHARE * gross) return null;

  return {
    pattern: "fee-bleed",
    description: "Friction took more than a fifth of everything the period moved",
    trades: graded.map((g) => g.trade.id),
    evidence: [
      gross > 0
        ? `${costs.toFixed(4)} USDT of fees, slippage and funding against ${gross.toFixed(4)} USDT of gross, ${((costs / gross) * 100).toFixed(1)} percent`
        : `${costs.toFixed(4)} USDT of fees, slippage and funding with no closed gross to set against it`,
    ],
  };
}

/** A stop that the tape crossed while the position stayed open. */
export function ignoredStops(graded: GradedTrade[]): PatternHit | null {
  const broken = graded.filter((g) => g.context.stop.existed && g.context.stop.honoured === false);
  if (broken.length === 0) return null;

  return {
    pattern: "ignored-stops",
    description: "A position crossed its stop price and stayed open past the next tick",
    trades: broken.map((g) => g.trade.id),
    evidence: broken.map(
      (g) =>
        `${g.trade.id} had a stop at ${g.context.stop.price === null ? "the recorded level" : g.context.stop.price.toFixed(2)} and the price went through it`,
    ),
  };
}

/**
 * Money added to a position that was already losing.
 *
 * This walks the fills, not the trips, because a trip is one entry paired with one exit
 * and an add is a second entry into a position that is still open: inside a single trip
 * it can never be seen. The walk keeps a running size and average entry per market, the
 * way the exchange does, so the third add is measured against the average of the first
 * two and not against the first price.
 *
 * The mark is the newest price the record observed for that symbol at or before the
 * fill. Callers usually pass the fills themselves alongside the ledger's marks, which
 * means an add at a price worse than the average counts even when no separate mark was
 * written that minute. With no mark at all, nothing is claimed.
 */
export function addedWhileUnderWater(fills: FillRecord[], marks: MarkPoint[]): PatternHit | null {
  const sortedMarks = [...marks].sort((a, b) => a.ts - b.ts);
  const positions = new Map<string, { side: "long" | "short"; qty: number; avgEntry: number }>();
  const trades: string[] = [];
  const evidence: string[] = [];

  for (const fill of [...fills].sort((a, b) => a.ts - b.ts)) {
    const key = `${fill.category}:${fill.symbol}`;
    const side = fill.side === "buy" ? "long" : "short";
    const open = positions.get(key);

    if (!open || open.qty <= QTY_EPSILON) {
      positions.set(key, { side, qty: fill.qty, avgEntry: fill.price });
      continue;
    }

    if (open.side !== side) {
      const left = open.qty - fill.qty;
      if (left > QTY_EPSILON) positions.set(key, { ...open, qty: left });
      else if (-left > QTY_EPSILON) positions.set(key, { side, qty: -left, avgEntry: fill.price });
      else positions.delete(key);
      continue;
    }

    const mark = markAt(sortedMarks, fill.symbol, fill.ts);
    if (mark !== null && (open.side === "long" ? mark < open.avgEntry : mark > open.avgEntry)) {
      trades.push(fill.id);
      evidence.push(
        `${fill.id} added ${fill.qty} ${fill.symbol} at ${fill.price} to a ${open.side} of ${open.qty} averaging ${open.avgEntry.toFixed(4)}, with the mark at ${mark}`,
      );
    }

    positions.set(key, {
      side: open.side,
      qty: open.qty + fill.qty,
      avgEntry: (open.avgEntry * open.qty + fill.price * fill.qty) / (open.qty + fill.qty),
    });
  }

  if (trades.length === 0) return null;
  return {
    pattern: "added-while-under-water",
    description: "A losing position was made bigger instead of being cut",
    trades,
    evidence,
  };
}

/** The newest price the record observed for this symbol at or before ts. */
function markAt(sorted: MarkPoint[], symbol: string, ts: number): number | null {
  let found: number | null = null;
  for (const mark of sorted) {
    if (mark.ts > ts) break;
    if (mark.symbol === symbol) found = mark.price;
  }
  return found;
}

function notional(trip: RoundTrip): number {
  return trip.qty * trip.entryPrice;
}

function turnoverOf(trip: RoundTrip): number {
  return notional(trip) + (trip.exitPrice === null ? 0 : trip.qty * trip.exitPrice);
}

function costsOf(trip: RoundTrip): number {
  return trip.feesUsdt + trip.slippageUsdt + Math.abs(trip.fundingUsdt);
}

function isOpenAt(trip: RoundTrip, ts: number): boolean {
  return trip.entryTs <= ts && (trip.exitTs === null || trip.exitTs > ts);
}

function equityAt(curve: EquityCurve, ts: number): number | null {
  let found: number | null = null;
  for (const point of [...curve].sort((a, b) => a.ts - b.ts)) {
    if (point.ts <= ts) found = point.equity;
  }
  return found;
}

/** One moment inside every weekend the record spans, taken from the NYSE calendar. */
function weekendMoments(graded: GradedTrade[]): number[] {
  if (graded.length === 0) return [];
  const from = Math.min(...graded.map((g) => g.trade.entryTs));
  const to = Math.max(...graded.map((g) => g.trade.exitTs ?? g.trade.entryTs));
  const moments: number[] = [];
  let lastWeekend = -Infinity;

  for (let day = from; day <= to + DAY_MS; day += DAY_MS) {
    if (!nyseClock(new Date(day)).isWeekend) continue;
    if (day - lastWeekend < 3 * DAY_MS) continue;
    moments.push(day);
    lastWeekend = day;
  }
  return moments;
}

/** Bitget names a tokenized stock rTSLA and its perpetual TSLAUSDT. */
function looksLikeRToken(symbol: string): boolean {
  return /^R[A-Z]{2,6}USDT$/.test(symbol);
}

function underlying(symbol: string, category: string): string {
  const base = symbol.replace(/USDT$/, "");
  return category === "SPOT" && base.startsWith("R") ? base.slice(1) : base;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}
