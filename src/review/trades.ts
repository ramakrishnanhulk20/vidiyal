import type { FillRecord, RoundTrip } from "./types.js";

interface Lot {
  side: "long" | "short";
  fill: FillRecord;
  qtyOpen: number;
}

/** Quantities are floating point, so a lot this small is treated as closed. */
const QTY_EPSILON = 1e-12;

/**
 * Fills paired into round trips, oldest first, first in and first out.
 *
 * One entry can be closed by several exits and one exit can close several entries, so
 * an entry lot is split at the quantity that was actually closed: each closed piece is
 * its own round trip with its own realised result, and whatever is left stays open with
 * exitTs and grossPnl null. Fees and slippage follow the split by quantity share, so
 * the costs of every trip sum back to the costs of the fills they came from.
 *
 * On SPOT a sell with no earlier buy in this record cannot be paired: the buy happened
 * before the window or on another account. Those are skipped and named, never guessed
 * at with an invented entry price. On futures the same sell opens a short, and a sell
 * larger than the open long closes it and flips in one go.
 */
export function pairRoundTrips(fills: FillRecord[]): { trips: RoundTrip[]; skipped: string[] } {
  const byMarket = new Map<string, FillRecord[]>();
  for (const fill of [...fills].sort((a, b) => a.ts - b.ts)) {
    const key = `${fill.category}:${fill.symbol}`;
    const list = byMarket.get(key);
    if (list) list.push(fill);
    else byMarket.set(key, [fill]);
  }

  const trips: RoundTrip[] = [];
  const skipped: string[] = [];

  for (const [, market] of byMarket) {
    const lots: Lot[] = [];

    for (const fill of market) {
      let remaining = fill.qty;
      const opening: Lot["side"] = fill.side === "buy" ? "long" : "short";

      while (remaining > QTY_EPSILON) {
        const front = lots[0];
        const reduces = front !== undefined && front.side !== opening;

        if (reduces) {
          const closed = Math.min(remaining, front.qtyOpen);
          trips.push(closedTrip(front, fill, closed));
          front.qtyOpen -= closed;
          remaining -= closed;
          if (front.qtyOpen <= QTY_EPSILON) lots.shift();
          continue;
        }

        if (fill.category === "SPOT" && opening === "short") {
          skipped.push(
            `${fill.id}: sell of ${remaining} ${fill.symbol} on SPOT has no earlier buy in this record`,
          );
          break;
        }

        lots.push({ side: opening, fill, qtyOpen: remaining });
        remaining = 0;
      }
    }

    for (const lot of lots) {
      if (lot.qtyOpen > QTY_EPSILON) trips.push(openTrip(lot));
    }
  }

  trips.sort((a, b) => a.entryTs - b.entryTs || (a.exitTs ?? Infinity) - (b.exitTs ?? Infinity));
  return { trips, skipped };
}

/**
 * The equity the record showed when each trip was opened, taken from the newest mark at
 * or before the entry. A trip opened before the first mark keeps a null equity rather
 * than borrowing a later one, because sizing graded against the wrong equity is worse
 * than sizing left ungraded.
 */
export function attachEquity(
  trips: RoundTrip[],
  marks: Array<{ ts: number; equity: number }>,
): RoundTrip[] {
  const sorted = [...marks].sort((a, b) => a.ts - b.ts);
  return trips.map((trip) => {
    let equity: number | null = null;
    for (const mark of sorted) {
      if (mark.ts <= trip.entryTs) equity = mark.equity;
    }
    return { ...trip, equityAtEntry: equity };
  });
}

function closedTrip(lot: Lot, exit: FillRecord, qty: number): RoundTrip {
  const entry = lot.fill;
  const grossPnl =
    lot.side === "long" ? (exit.price - entry.price) * qty : (entry.price - exit.price) * qty;

  return {
    id: `${entry.id}>${exit.id}`,
    source: entry.source,
    category: entry.category,
    symbol: entry.symbol,
    side: lot.side,
    entryTs: entry.ts,
    exitTs: exit.ts,
    entryPrice: entry.price,
    exitPrice: exit.price,
    qty,
    grossPnl,
    feesUsdt: feeShare(entry, qty) + feeShare(exit, qty),
    fundingUsdt: 0,
    slippageUsdt: slippageShare(entry, qty) + slippageShare(exit, qty),
    fills: [entry, exit],
    rationale: entry.rationale,
    equityAtEntry: null,
  };
}

function openTrip(lot: Lot): RoundTrip {
  const entry = lot.fill;
  return {
    id: `${entry.id}>open`,
    source: entry.source,
    category: entry.category,
    symbol: entry.symbol,
    side: lot.side,
    entryTs: entry.ts,
    exitTs: null,
    entryPrice: entry.price,
    exitPrice: null,
    qty: lot.qtyOpen,
    grossPnl: null,
    feesUsdt: feeShare(entry, lot.qtyOpen),
    fundingUsdt: 0,
    slippageUsdt: slippageShare(entry, lot.qtyOpen),
    fills: [entry],
    rationale: entry.rationale,
    equityAtEntry: null,
  };
}

function feeShare(fill: FillRecord, qty: number): number {
  return fill.qty > 0 ? (fill.feeUsdt * qty) / fill.qty : 0;
}

/** Slippage is recorded in basis points of the fill, so it becomes USDT at that price. */
function slippageShare(fill: FillRecord, qty: number): number {
  if (fill.slippageBps === null) return 0;
  return (fill.slippageBps / 10_000) * fill.price * qty;
}
