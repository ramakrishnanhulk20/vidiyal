import type { Category } from "../vendor/bitget/types.js";

export type { Category };

/**
 * Where a record came from. A Kaaval ledger is named by its directory and the brain
 * whose entries we read; a person's account is named by the account id the key belongs
 * to. Every fill carries its source so a mixed table can always say which record a
 * number came from.
 */
export type Source =
  | { kind: "ledger"; dir: string; brain: string }
  | { kind: "account"; accountId: string };

/**
 * One execution, from a ledger or from Bitget. Nothing here is derived: every field is
 * either in the record or absent. slippageBps and bookHash exist only for ledger fills,
 * because Bitget does not publish the book a past fill hit.
 */
export interface FillRecord {
  id: string;
  source: Source;
  ts: number;
  category: Category;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  notionalUsdt: number;
  feeUsdt: number;
  slippageBps: number | null;
  bookHash: string | null;
  decisionId: string | null;
  rationale: string | null;
  note: string | null;
}

/**
 * One position from open to close. exitTs and exitPrice are null while it is still
 * open, and grossPnl is null with them, because an unrealised number is not a result.
 */
export interface RoundTrip {
  id: string;
  source: Source;
  category: Category;
  symbol: string;
  side: "long" | "short";
  entryTs: number;
  exitTs: number | null;
  entryPrice: number;
  exitPrice: number | null;
  qty: number;
  grossPnl: number | null;
  feesUsdt: number;
  fundingUsdt: number;
  slippageUsdt: number;
  fills: FillRecord[];
  rationale: string | null;
  equityAtEntry: number | null;
}

/** The market around one trade, rebuilt from Bitget and from the record, never guessed. */
export interface TradeContext {
  divergenceAtEntryPct: number | null;
  divergenceAtExitPct: number | null;
  spreadAtEntryBps: number | null;
  sessionAtEntry: "regular" | "after-hours" | "weekend" | "holiday";
  msToNextOpenAtEntry: number;
  nextEventMinutes: number | null;
  bookShareAtEntry: number | null;
  usualSpreadBps: number | null;
  stop: { existed: boolean; price: number | null; honoured: boolean | null };
}

export interface Scores {
  entry: number;
  sizing: number;
  exit: number;
  cost: number;
  reasoning: number;
  total: number;
  letter: "A" | "B" | "C" | "D" | "E";
  evidence: string[];
}

export interface GradedTrade {
  trade: RoundTrip;
  context: TradeContext;
  scores: Scores;
}

/**
 * A detector's finding. trades holds the round trip ids that prove it. A detector that
 * works on fills rather than trips names the fills instead when it is called on its own;
 * detectPatterns carries those back to the trips that hold them before anything reads it.
 */
export interface PatternHit {
  pattern: string;
  description: string;
  trades: string[];
  evidence: string[];
}

export interface ChecklistItem {
  id: string;
  pattern: string;
  text: string;
  test: string;
}

export interface Idea {
  category: Category;
  symbol: string;
  side: "buy" | "sell";
  notionalUsdt: number;
  note: string | null;
}

export interface IdeaCheck {
  idea: Idea;
  results: Array<{ item: ChecklistItem; pass: boolean; observed: string }>;
  pass: boolean;
  dryRun: Record<string, unknown> | null;
  dryRunNote: string;
}
