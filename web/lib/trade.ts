import type { GradedTrade, Scores, TradeContext } from "../../src/review/types.js";
import { num, orMissing, usdt, utcClock } from "./format";

export interface ScoreRow {
  key: string;
  label: string;
  weight: number;
  value: number;
  lines: string[];
}

/** The five scores in the order docs/rubric.md lists them, with the weights it sets. */
const PARTS: Array<{ key: keyof Scores & string; label: string; weight: number }> = [
  { key: "entry", label: "entry context", weight: 25 },
  { key: "sizing", label: "sizing", weight: 20 },
  { key: "exit", label: "exit discipline", weight: 25 },
  { key: "cost", label: "cost drag", weight: 15 },
  { key: "reasoning", label: "reasoning", weight: 15 },
];

/**
 * The five scores with the evidence lines that produced each one.
 *
 * A grade with no line under it is a bug rather than a design, so a score that the
 * rubric left unexplained says so in place of the line instead of showing the number
 * on its own.
 */
export function scoreRows(scores: Scores): ScoreRow[] {
  return PARTS.map((part) => {
    const lines = scores.evidence
      .filter((line) => line.startsWith(`${part.key}: `))
      .map((line) => line.slice(part.key.length + 2));
    return {
      key: part.key,
      label: part.label,
      weight: part.weight,
      value: scores[part.key] as number,
      lines: lines.length > 0 ? lines : ["the record carried nothing this part of the rubric could read"],
    };
  });
}

export interface FillRow {
  id: string;
  time: string;
  side: string;
  price: string;
  qty: string;
  fee: string;
  slippage: string;
  bookHash: string;
  bookHashFull: string;
}

export function fillRows(graded: GradedTrade): FillRow[] {
  return graded.trade.fills.map((fill) => ({
    id: fill.id,
    time: utcClock(fill.ts),
    side: fill.side,
    price: num(fill.price, 4),
    qty: num(fill.qty, 4),
    fee: num(fill.feeUsdt, 4),
    slippage: orMissing(fill.slippageBps, (v) => `${num(v, 2)} bps`, "not recorded"),
    bookHash: fill.bookHash === null ? "no book" : fill.bookHash.slice(0, 10),
    bookHashFull: fill.bookHash ?? "Bitget publishes no book for a past fill, so this record has none",
  }));
}

export interface ContextRow {
  label: string;
  value: string;
}

export function contextRows(context: TradeContext): ContextRow[] {
  const spread = orMissing(
    context.spreadAtEntryBps,
    (v) =>
      context.usualSpreadBps === null
        ? `${num(v, 2)} bps`
        : `${num(v, 2)} bps against a usual ${num(context.usualSpreadBps, 2)} bps`,
    "the record kept no book, so the spread is not knowable",
  );

  return [
    {
      label: "divergence at entry",
      value: orMissing(
        context.divergenceAtEntryPct,
        (v) => `${num(v, 2)} percent from the last regular close`,
        "no anchor candle in reach, so there is no gap to measure",
      ),
    },
    {
      label: "divergence at exit",
      value: orMissing(
        context.divergenceAtExitPct,
        (v) => `${num(v, 2)} percent from the last regular close`,
        "the position is still open, so there is no exit to measure",
      ),
    },
    { label: "session at entry", value: context.sessionAtEntry },
    {
      label: "next regular open",
      value: `${num(context.msToNextOpenAtEntry / 3_600_000, 1)} hours after the entry`,
    },
    { label: "spread at entry", value: spread },
    {
      label: "share of the visible book",
      value: orMissing(
        context.bookShareAtEntry,
        (v) => `${num(v * 100, 2)} percent of the book this order hit`,
        "the record kept no book, so the depth is not knowable",
      ),
    },
    {
      label: "scheduled event",
      value:
        context.nextEventMinutes === null
          ? "the feed knew of nothing scheduled after this entry"
          : `${context.nextEventMinutes} minutes after the entry`,
    },
    { label: "stop", value: stopLine(context) },
  ];
}

function stopLine(context: TradeContext): string {
  const { existed, price, honoured } = context.stop;
  if (!existed) return "none in the record";
  const at = price === null ? "at the recorded level" : `at ${num(price, 4)}`;
  if (honoured === null) return `${at}, never tested by the tape`;
  return honoured ? `${at}, honoured` : `${at}, crossed while the position stayed open`;
}

export interface CostRow {
  label: string;
  value: string;
}

export function costRows(graded: GradedTrade): CostRow[] {
  const { trade } = graded;
  const friction = trade.feesUsdt + trade.slippageUsdt + Math.abs(trade.fundingUsdt);
  return [
    { label: "gross", value: trade.grossPnl === null ? "still open, nothing realised" : usdt(trade.grossPnl) },
    { label: "fees", value: usdt(trade.feesUsdt) },
    { label: "slippage", value: usdt(trade.slippageUsdt) },
    { label: "funding", value: trade.category === "SPOT" ? "none on spot" : usdt(trade.fundingUsdt) },
    { label: "friction", value: usdt(friction) },
  ];
}

/** Round trip ids carry a colon and an arrow, so every link has to encode them. */
export function tradeHref(id: string): string {
  return `/trades/${encodeURIComponent(id)}`;
}
