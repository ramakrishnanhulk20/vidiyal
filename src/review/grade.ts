import { nyseClock } from "../vendor/bitget/hours.js";
import type { RoundTrip, Scores, TradeContext } from "./types.js";

export interface GradeOptions {
  rulebookCaps: { perSymbolPct: number; maxBookFraction: number } | null;
  medianSizeUsdt: number | null;
  winnersMedianHoldMs: number | null;
  reasoningScore: number | null;
}

/** Weights from docs/rubric.md. They sum to 100, which is what makes total a percent. */
const WEIGHTS = { entry: 25, sizing: 20, exit: 25, cost: 15, reasoning: 15 } as const;

/** Letter cutoffs from docs/rubric.md. */
const LETTERS: Array<{ at: number; letter: Scores["letter"] }> = [
  { at: 85, letter: "A" },
  { at: 70, letter: "B" },
  { at: 55, letter: "C" },
  { at: 40, letter: "D" },
];

const DIVERGENCE_FULL_PCT = 0.5;
const DIVERGENCE_ZERO_PCT = 2;
const SPREAD_ZERO_RATIO = 3;
const MEDIAN_SIZE_ZERO_RATIO = 3;
const COST_FULL_SHARE = 0.1;
const COST_ZERO_SHARE = 0.5;
const DEFAULT_BOOK_FRACTION = 0.25;
const EVENT_NEAR_MINUTES = 60;

/** Bitget guidance, quoted in the Kaaval rulebook: prices re-anchor around the open. */
const REANCHOR_FROM_ET_MINUTE = 9 * 60 + 25;
const REANCHOR_TO_ET_MINUTE = 9 * 60 + 40;

/** A note is silence, not a mistake, so the rubric floors it at 2 rather than 0. */
const NO_NOTE_SCORE = 2;

/** With nothing to measure a component against, it neither helps nor hurts. */
const NEUTRAL = 2.5;

interface Part {
  score: number;
  evidence: string;
}

/**
 * The five scores for one round trip, from the trade and the market around it.
 *
 * Pure: no network, no model, no clock of its own, so two runs over the same record
 * give the same grades and a review can be recomputed and checked. Every component
 * carries the number that produced it, and a component with nothing to measure is
 * skipped rather than guessed, so a missing input can never quietly cost points.
 */
export function gradeTrade(trip: RoundTrip, context: TradeContext, opts: GradeOptions): Scores {
  const evidence: string[] = [];
  const entry = combine(entryParts(trip, context), evidence, "entry");
  const sizing = combine(sizingParts(trip, context, opts), evidence, "sizing");
  const exit = combine(exitParts(trip, context, opts), evidence, "exit");
  const cost = combine(costParts(trip), evidence, "cost");
  const reasoning = reasoningPart(trip, opts, evidence);

  const total = round2(
    (entry / 5) * WEIGHTS.entry +
      (sizing / 5) * WEIGHTS.sizing +
      (exit / 5) * WEIGHTS.exit +
      (cost / 5) * WEIGHTS.cost +
      (reasoning / 5) * WEIGHTS.reasoning,
  );

  return {
    entry,
    sizing,
    exit,
    cost,
    reasoning,
    total,
    letter: LETTERS.find((step) => total >= step.at)?.letter ?? "E",
    evidence,
  };
}

function entryParts(trip: RoundTrip, context: TradeContext): Part[] {
  const parts: Part[] = [];

  if (context.divergenceAtEntryPct !== null) {
    const gap = Math.abs(context.divergenceAtEntryPct);
    parts.push({
      score: slide(gap, DIVERGENCE_FULL_PCT, DIVERGENCE_ZERO_PCT),
      evidence: `entry: price was ${context.divergenceAtEntryPct.toFixed(2)} percent from the last regular close`,
    });
  }

  if (context.spreadAtEntryBps !== null && context.usualSpreadBps !== null && context.usualSpreadBps > 0) {
    const ratio = context.spreadAtEntryBps / context.usualSpreadBps;
    parts.push({
      score: slide(ratio, 1, SPREAD_ZERO_RATIO),
      evidence: `entry: spread was ${context.spreadAtEntryBps.toFixed(1)} bps against a usual ${context.usualSpreadBps.toFixed(1)} bps, ${ratio.toFixed(2)} times`,
    });
  }

  const etMinute = etMinuteOfDay(trip.entryTs);
  const reanchoring =
    context.sessionAtEntry !== "weekend" &&
    context.sessionAtEntry !== "holiday" &&
    etMinute >= REANCHOR_FROM_ET_MINUTE &&
    etMinute <= REANCHOR_TO_ET_MINUTE;
  parts.push({
    score: reanchoring ? 0 : 5,
    evidence: reanchoring
      ? `entry: ${clockText(trip.entryTs)} falls inside the 09:25 to 09:40 ET re-anchoring window`
      : `entry: ${clockText(trip.entryTs)} is outside the 09:25 to 09:40 ET re-anchoring window`,
  });

  if (context.nextEventMinutes !== null && context.nextEventMinutes <= EVENT_NEAR_MINUTES) {
    const named = trip.rationale !== null && trip.rationale.trim() !== "";
    parts.push({
      score: named ? 5 : 0,
      evidence: `entry: a scheduled event was ${context.nextEventMinutes} minutes away and the rationale ${named ? "was written" : "said nothing"}`,
    });
  }

  return parts;
}

function sizingParts(trip: RoundTrip, context: TradeContext, opts: GradeOptions): Part[] {
  const parts: Part[] = [];
  const notional = trip.qty * trip.entryPrice;

  if (opts.rulebookCaps && trip.equityAtEntry !== null && trip.equityAtEntry > 0) {
    const share = notional / trip.equityAtEntry;
    const cap = opts.rulebookCaps.perSymbolPct / 100;
    parts.push({
      score: slide(share / cap, 1, 2),
      evidence: `sizing: ${notional.toFixed(2)} USDT is ${(share * 100).toFixed(2)} percent of ${trip.equityAtEntry.toFixed(2)} USDT equity against a ${opts.rulebookCaps.perSymbolPct} percent cap`,
    });
  } else if (opts.medianSizeUsdt !== null && opts.medianSizeUsdt > 0) {
    const ratio = notional / opts.medianSizeUsdt;
    parts.push({
      score: slide(ratio, 1, MEDIAN_SIZE_ZERO_RATIO),
      evidence: `sizing: ${notional.toFixed(2)} USDT is ${ratio.toFixed(2)} times the ${opts.medianSizeUsdt.toFixed(2)} USDT median size over the period`,
    });
  }

  if (context.bookShareAtEntry !== null) {
    const cap = opts.rulebookCaps?.maxBookFraction ?? DEFAULT_BOOK_FRACTION;
    parts.push({
      score: slide(context.bookShareAtEntry / cap, 1, 2),
      evidence: `sizing: the order was ${(context.bookShareAtEntry * 100).toFixed(1)} percent of the visible book against a ${(cap * 100).toFixed(0)} percent cap`,
    });
  }

  return parts;
}

function exitParts(trip: RoundTrip, context: TradeContext, opts: GradeOptions): Part[] {
  const parts: Part[] = [];

  if (context.stop.existed && context.stop.honoured !== null) {
    parts.push({
      score: context.stop.honoured ? 5 : 0,
      evidence: `exit: the stop at ${context.stop.price === null ? "the recorded level" : context.stop.price.toFixed(2)} was ${context.stop.honoured ? "honoured" : "crossed and the position stayed open"}`,
    });
  }

  if (trip.exitTs !== null && trip.grossPnl !== null && trip.grossPnl < 0 && opts.winnersMedianHoldMs !== null && opts.winnersMedianHoldMs > 0) {
    const held = trip.exitTs - trip.entryTs;
    const ratio = held / opts.winnersMedianHoldMs;
    parts.push({
      score: slide(ratio, 1, 2),
      evidence: `exit: the loser was held ${minutes(held)} minutes against a winners median of ${minutes(opts.winnersMedianHoldMs)} minutes, ${ratio.toFixed(2)} times`,
    });
  }

  const addedUnderWater = trip.fills.filter(
    (f) =>
      f.ts > trip.entryTs &&
      ((trip.side === "long" && f.side === "buy" && f.price < trip.entryPrice) ||
        (trip.side === "short" && f.side === "sell" && f.price > trip.entryPrice)),
  );
  if (addedUnderWater.length > 0) {
    parts.push({
      score: 0,
      evidence: `exit: ${addedUnderWater.length} fill added to the position while it was under water`,
    });
  }

  if (context.sessionAtEntry === "weekend" && context.divergenceAtEntryPct !== null && Math.abs(context.divergenceAtEntryPct) > 1) {
    const closedBeforeOpen = trip.exitTs !== null && trip.exitTs <= trip.entryTs + context.msToNextOpenAtEntry;
    parts.push({
      score: closedBeforeOpen ? 5 : 0,
      evidence: `exit: a weekend entry ${context.divergenceAtEntryPct.toFixed(2)} percent from the close ${closedBeforeOpen ? "was closed before the open" : "was carried into the open"}`,
    });
  }

  return parts;
}

function costParts(trip: RoundTrip): Part[] {
  const costs = trip.feesUsdt + trip.slippageUsdt + Math.abs(trip.fundingUsdt);

  if (trip.grossPnl === null) {
    return [
      {
        score: NEUTRAL,
        evidence: `cost: ${costs.toFixed(4)} USDT of fees, slippage and funding so far, and the trip is still open so there is no gross to measure it against`,
      },
    ];
  }

  const gross = Math.abs(trip.grossPnl);
  if (gross <= costs) {
    return [
      {
        score: 0,
        evidence: `cost: ${costs.toFixed(4)} USDT of friction against a gross of ${gross.toFixed(4)} USDT, so friction was the whole trade`,
      },
    ];
  }

  const share = costs / gross;
  return [
    {
      score: slide(share, COST_FULL_SHARE, COST_ZERO_SHARE),
      evidence: `cost: ${costs.toFixed(4)} USDT of friction is ${(share * 100).toFixed(1)} percent of the ${gross.toFixed(4)} USDT gross`,
    },
  ];
}

function reasoningPart(trip: RoundTrip, opts: GradeOptions, evidence: string[]): number {
  if (opts.reasoningScore !== null) {
    const score = clamp(round2(opts.reasoningScore));
    evidence.push(`reasoning: the judge scored the stated thesis ${score} out of 5`);
    return score;
  }
  if (trip.rationale === null || trip.rationale.trim() === "") {
    evidence.push("reasoning: no note was left, which the rubric scores 2 out of 5, never 0");
    return NO_NOTE_SCORE;
  }
  evidence.push("reasoning: a rationale exists but no judge was supplied, so it holds the no-note score of 2");
  return NO_NOTE_SCORE;
}

function combine(parts: Part[], evidence: string[], name: string): number {
  if (parts.length === 0) {
    evidence.push(`${name}: nothing in the record measures this, so it scores a neutral ${NEUTRAL}`);
    return NEUTRAL;
  }
  for (const part of parts) evidence.push(part.evidence);
  return round2(parts.reduce((sum, part) => sum + part.score, 0) / parts.length);
}

/**
 * Five at or below the full-marks level, zero at or above the zero level, straight
 * line between. Every threshold in the rubric has this shape.
 */
function slide(value: number, full: number, zero: number): number {
  if (value <= full) return 5;
  if (value >= zero) return 0;
  return round2((5 * (zero - value)) / (zero - full));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(5, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function minutes(ms: number): string {
  return (ms / 60_000).toFixed(1);
}

function etMinuteOfDay(ts: number): number {
  const [, time] = nyseClock(new Date(ts)).nowEt.split(" ");
  const [hour, minute] = (time ?? "00:00:00").split(":");
  return Number(hour) * 60 + Number(minute);
}

function clockText(ts: number): string {
  const [, time] = nyseClock(new Date(ts)).nowEt.split(" ");
  return `${(time ?? "").slice(0, 5)} ET`;
}
