import { basename, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Fill, OrderBook, SimOrder } from "../vendor/sim/types.js";
import {
  readEntries,
  verifyLedger,
  type LedgerEntry,
  type SnapshotPayload,
} from "../vendor/ledger/ledger.js";
import type { FillRecord, Source } from "../review/types.js";

/**
 * Every path a record stores about where it came from is written relative to this repo,
 * with forward slashes.
 *
 * A published record is read on machines that never had the drive it was written on, so
 * an absolute path there is useless to the reader and a needless reveal of the writer's
 * folder layout. Reading still uses the absolute path the caller passed; only the value
 * stamped into the record changes. A path on another drive has no relative form, so the
 * directory name alone is kept.
 */
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..");

export function repoRelative(path: string): string {
  const rel = relative(REPO_ROOT, resolve(path)).split(sep).join("/");
  return rel === "" || /^[A-Za-z]:/.test(rel) ? basename(path) : rel;
}

export interface LedgerRead {
  fills: FillRecord[];
  decisions: Map<string, { rationale: string; ts: number }>;
  marks: Array<{ ts: number; equity: number }>;
  /** The prices each mark entry saw, one row per symbol, for detectors that need a mark. */
  priceMarks: Array<{ ts: number; symbol: string; price: number }>;
  verified: boolean;
  reason: string | null;
}

interface DecisionPayload {
  brain?: string;
  ts?: number;
  summary?: string;
  targets?: Array<{ symbol?: string; rationale?: string }>;
}

/**
 * Every trade Vidiyal reads from a Kaaval ledger, with the chain checked first.
 *
 * A ledger that fails verifyLedger comes back with no fills and the reason the check
 * failed, so a tampered or truncated record can never reach the trade table. Only
 * entries written for this brain are read, because one directory can hold several.
 * A fill's timestamp is the fill's own, not the moment the line was appended: the
 * appended time can trail the market by minutes and every grade is about the market.
 */
export function readLedgerFills(dir: string, publicKeyHex: string, brain: string): LedgerRead {
  const check = verifyLedger(dir, publicKeyHex);
  if (!check.ok) {
    return {
      fills: [],
      decisions: new Map(),
      marks: [],
      priceMarks: [],
      verified: false,
      reason: check.reason ?? "the ledger did not verify",
    };
  }

  const entries = readEntries(dir);
  const decisions = new Map<string, { rationale: string; ts: number }>();
  const raw: Array<{ id: string; ts: number; payload: DecisionPayload }> = [];
  const marks: Array<{ ts: number; equity: number }> = [];
  const priceMarks: Array<{ ts: number; symbol: string; price: number }> = [];
  const fills: FillRecord[] = [];
  const source: Source = { kind: "ledger", dir: repoRelative(dir), brain };

  for (const entry of entries) {
    if (entry.account !== brain) continue;

    if (entry.kind === "decision") {
      const payload = (entry.payload ?? {}) as DecisionPayload;
      const id = `decision-${entry.seq}`;
      const ts = typeof payload.ts === "number" ? payload.ts : entry.ts;
      decisions.set(id, { rationale: payload.summary ?? "", ts });
      raw.push({ id, ts, payload });
      continue;
    }

    if (entry.kind === "mark") {
      const equity = readEquity(entry);
      if (equity !== null) marks.push({ ts: entry.ts, equity });
      priceMarks.push(...readPrices(entry));
      continue;
    }

    if (entry.kind !== "fill") continue;
    const { order, fill } = entry.payload as { order: SimOrder; fill: Fill };
    if (!order || !fill || fill.qty <= 0) continue;

    const decision = lastDecisionAtOrBefore(raw, fill.ts);
    fills.push({
      id: `${basename(dir)}:${entry.seq}`,
      source,
      ts: fill.ts,
      category: fill.category,
      symbol: fill.symbol,
      side: fill.side,
      qty: fill.qty,
      price: fill.avgPrice,
      notionalUsdt: fill.notionalUsdt,
      feeUsdt: fill.feeUsdt,
      slippageBps: fill.slippageBps,
      bookHash: fill.bookHash,
      decisionId: decision?.id ?? null,
      rationale: decision ? rationaleFor(decision.payload, fill.symbol) : null,
      note: `order source: ${order.source}`,
    });
  }

  marks.sort((a, b) => a.ts - b.ts);
  priceMarks.sort((a, b) => a.ts - b.ts);
  fills.sort((a, b) => a.ts - b.ts);
  return { fills, decisions, marks, priceMarks, verified: true, reason: null };
}

/**
 * The books the ledger recorded, keyed by their hash.
 *
 * A fill names the book it hit but does not carry it, so the spread and the depth at
 * the moment of a trade are only recoverable through this map. Bitget publishes no
 * historical order book, so without these snapshots those two numbers stay null.
 */
export function readLedgerBooks(dir: string): Map<string, OrderBook> {
  const books = new Map<string, OrderBook>();
  for (const entry of readEntries(dir)) {
    if (entry.kind !== "snapshot") continue;
    const snapshot = entry.payload as SnapshotPayload;
    if (snapshot?.bookHash && snapshot.book) {
      books.set(snapshot.bookHash, snapshot.book);
    }
  }
  return books;
}

function readEquity(entry: LedgerEntry): number | null {
  const payload = entry.payload as { equity?: unknown } | null;
  const equity = payload?.equity;
  return typeof equity === "number" && Number.isFinite(equity) ? equity : null;
}

/**
 * The prices one mark entry recorded. Kaaval keys them "CATEGORY:SYMBOL", and only the
 * symbol half is kept here because a mark is a price for an instrument and the two
 * categories of the same name never share a price file.
 */
function readPrices(entry: LedgerEntry): Array<{ ts: number; symbol: string; price: number }> {
  const payload = entry.payload as { marks?: Record<string, unknown> } | null;
  const out: Array<{ ts: number; symbol: string; price: number }> = [];
  for (const [key, price] of Object.entries(payload?.marks ?? {})) {
    if (typeof price !== "number" || !Number.isFinite(price)) continue;
    const symbol = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
    out.push({ ts: entry.ts, symbol, price });
  }
  return out;
}

function lastDecisionAtOrBefore(
  raw: Array<{ id: string; ts: number; payload: DecisionPayload }>,
  ts: number,
): { id: string; payload: DecisionPayload } | null {
  let found: { id: string; payload: DecisionPayload } | null = null;
  for (const decision of raw) {
    if (decision.ts <= ts) found = { id: decision.id, payload: decision.payload };
  }
  return found;
}

/** The brain's own words for this symbol, falling back to the summary of the tick. */
function rationaleFor(payload: DecisionPayload, symbol: string): string | null {
  const target = payload.targets?.find((t) => t.symbol === symbol);
  if (target?.rationale) return target.rationale;
  return payload.summary ?? null;
}
