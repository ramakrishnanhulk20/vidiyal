import type {
  Category,
  FillRecord,
  GradedTrade,
  RoundTrip,
  Scores,
  Source,
  TradeContext,
} from "../../src/review/types.js";

export const LEDGER_SOURCE: Source = { kind: "ledger", dir: "test-ledger", brain: "claude" };

let counter = 0;

/**
 * A fill with the fields a test cares about and sane values for the rest. Ids are
 * unique per call so trips built from two fills never share an id by accident.
 */
export function fill(over: Partial<FillRecord> & { side: "buy" | "sell"; qty: number; price: number }): FillRecord {
  counter += 1;
  const qty = over.qty;
  const price = over.price;
  return {
    id: over.id ?? `f${counter}`,
    source: over.source ?? LEDGER_SOURCE,
    ts: over.ts ?? 1_700_000_000_000 + counter * 60_000,
    category: over.category ?? "USDT-FUTURES",
    symbol: over.symbol ?? "TSLAUSDT",
    side: over.side,
    qty,
    price,
    notionalUsdt: over.notionalUsdt ?? qty * price,
    feeUsdt: over.feeUsdt ?? 0,
    slippageBps: over.slippageBps ?? null,
    bookHash: over.bookHash ?? null,
    decisionId: over.decisionId ?? null,
    rationale: over.rationale ?? null,
    note: over.note ?? null,
  };
}

export function trip(over: Partial<RoundTrip> = {}): RoundTrip {
  counter += 1;
  const entryTs = over.entryTs ?? 1_700_000_000_000;
  return {
    id: over.id ?? `t${counter}`,
    source: over.source ?? LEDGER_SOURCE,
    category: over.category ?? "USDT-FUTURES",
    symbol: over.symbol ?? "TSLAUSDT",
    side: over.side ?? "long",
    entryTs,
    exitTs: over.exitTs === undefined ? entryTs + 3_600_000 : over.exitTs,
    entryPrice: over.entryPrice ?? 100,
    exitPrice: over.exitPrice === undefined ? 101 : over.exitPrice,
    qty: over.qty ?? 1,
    grossPnl: over.grossPnl === undefined ? 1 : over.grossPnl,
    feesUsdt: over.feesUsdt ?? 0,
    fundingUsdt: over.fundingUsdt ?? 0,
    slippageUsdt: over.slippageUsdt ?? 0,
    fills: over.fills ?? [],
    rationale: over.rationale ?? null,
    equityAtEntry: over.equityAtEntry === undefined ? 10_000 : over.equityAtEntry,
  };
}

export function context(over: Partial<TradeContext> = {}): TradeContext {
  return {
    divergenceAtEntryPct: over.divergenceAtEntryPct === undefined ? 0 : over.divergenceAtEntryPct,
    divergenceAtExitPct: over.divergenceAtExitPct === undefined ? 0 : over.divergenceAtExitPct,
    spreadAtEntryBps: over.spreadAtEntryBps === undefined ? null : over.spreadAtEntryBps,
    sessionAtEntry: over.sessionAtEntry ?? "regular",
    msToNextOpenAtEntry: over.msToNextOpenAtEntry ?? 24 * 60 * 60 * 1000,
    nextEventMinutes: over.nextEventMinutes === undefined ? null : over.nextEventMinutes,
    bookShareAtEntry: over.bookShareAtEntry === undefined ? null : over.bookShareAtEntry,
    usualSpreadBps: over.usualSpreadBps === undefined ? null : over.usualSpreadBps,
    stop: over.stop ?? { existed: false, price: null, honoured: null },
  };
}

export function scores(over: Partial<Scores> = {}): Scores {
  return {
    entry: over.entry ?? 3,
    sizing: over.sizing ?? 3,
    exit: over.exit ?? 3,
    cost: over.cost ?? 3,
    reasoning: over.reasoning ?? 2,
    total: over.total ?? 58,
    letter: over.letter ?? "C",
    evidence: over.evidence ?? [],
  };
}

export function graded(
  tripOver: Partial<RoundTrip> = {},
  contextOver: Partial<TradeContext> = {},
  scoresOver: Partial<Scores> = {},
): GradedTrade {
  return {
    trade: trip(tripOver),
    context: context(contextOver),
    scores: scores(scoresOver),
  };
}

export const CATEGORIES: Category[] = ["SPOT", "USDT-FUTURES"];
