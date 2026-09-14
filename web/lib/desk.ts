import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { GradedTrade } from "../../src/review/types.js";
import type { ReviewBundle } from "../../src/ask/types.js";
import type { Letter } from "./grades";
import { fetchReview } from "./desk-http";

/**
 * The two things the review knows about a trade that the graded bundle has no field for:
 * the headlines and scheduled events around the entry, and the sentence the reasoning
 * judge gave. The review script writes them beside the bundle, keyed by round trip id.
 */
export interface TradeNote {
  eventsNearEntry: Array<{ ts: number; title: string }>;
  judgeReason: string | null;
}

/**
 * The one way a screen reads a review. Every number on the desk comes through here, so
 * the day the bundles move into Postgres nothing above this file changes.
 */
export interface ReviewRecord {
  generatedAt: number;
  publicKeyHex: string;
  /** Where the public half was read from, absent in a bundle written before it was kept. */
  publicKeyPath?: string | null;
  verification: {
    verified: boolean;
    reason: string | null;
    fills: number;
    decisions: number;
    marks: number;
  };
  bundle: ReviewBundle;
  /** Absent in a bundle written before the review script kept these, so never assumed. */
  tradeNotes?: Record<string, TradeNote>;
  /** Every detector the review ran, fired or not, named by the review script. */
  detectorsRun?: string[];
}

/** One graded round trip, flattened to the few facts a spine draws. */
export interface Spine {
  id: string;
  ticker: string;
  quote: string;
  side: "long" | "short";
  letter: Letter;
  total: number;
  entryLabel: string;
  exitLabel: string;
  open: boolean;
}

export interface Desk {
  spines: Spine[];
  sourceLine: string;
  rangeLine: string;
  countLine: string;
  verificationLine: string;
  live: boolean;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Dates are written in UTC by hand so the server and the browser never disagree. */
function dayLabel(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]}`;
}

function fullLabel(ts: number): string {
  return `${dayLabel(ts)} ${new Date(ts).getUTCFullYear()}`;
}

/**
 * One line of a published record's manifest: enough to name a bundle and say how fresh
 * it is. Written by scripts/review.ts --all, read by whoever is serving the record.
 */
export interface ReviewManifestEntry {
  name: string;
  source: ReviewBundle["source"];
  range: { fromTs: number; toTs: number };
  graded: number;
  generatedAt: number;
}

export interface ReviewManifest {
  generatedAt: number;
  reviews: ReviewManifestEntry[];
}

export function reviewName(): string {
  return process.env.VIDIYAL_REVIEW ?? "kaaval-claude";
}

export function dataDir(): string {
  return process.env.VIDIYAL_DATA_DIR ?? resolve(process.cwd(), "../data/state");
}

/**
 * Where a published record is served from, without its trailing slash, or null when the
 * desk reads the bundles off its own disk.
 *
 * Set on Vercel, where there is no engine folder and no state directory: the review loop
 * on the machine that watches the ledger publishes the same JSON to a public URL, and
 * this is the desk reading it. Everything above loadReview is identical either way.
 */
export function recordUrl(): string | null {
  const raw = process.env.VIDIYAL_RECORD_URL;
  if (raw === undefined || raw.trim() === "") return null;
  return raw.trim().replace(/\/+$/, "");
}

/**
 * The engine folder: the review script, the .env the engine reads its keys from, and the
 * node_modules the Bitget SDK lives in. The desk runs from web/ inside it.
 */
export function engineRoot(): string {
  return process.env.VIDIYAL_ENGINE_DIR ?? resolve(process.cwd(), "..");
}

/**
 * The review bundle the engine last wrote. A missing file is an error and never an empty
 * screen: a desk that quietly shows nothing is indistinguishable from a trader who did
 * nothing, and those are not the same thing.
 */
export async function loadReview(name = reviewName()): Promise<ReviewRecord> {
  const base = recordUrl();
  if (base !== null) return await fetchReview(base, name);

  const path = join(dataDir(), "reviews", `${name}.json`);
  try {
    return JSON.parse(await readFile(path, "utf8")) as ReviewRecord;
  } catch (cause) {
    throw new Error(
      `no review at ${path}. Run: npm run review -- --source kaaval --brain claude --out ${name}`,
      { cause },
    );
  }
}

/** One graded trip as the shelf and the small spines elsewhere draw it. */
export function toSpine(graded: GradedTrade): Spine {
  const { trade, scores } = graded;
  const open = trade.exitTs === null;
  return {
    id: trade.id,
    ticker: trade.symbol.replace(/USDT$/, ""),
    quote: trade.symbol.endsWith("USDT") ? "USDT" : "",
    side: trade.side,
    letter: scores.letter,
    total: scores.total,
    entryLabel: dayLabel(trade.entryTs),
    exitLabel: open ? "OPEN" : dayLabel(trade.exitTs as number),
    open,
  };
}

/** The graded trip behind one round trip id, or null when this review never held it. */
export function gradedById(record: ReviewRecord, id: string): GradedTrade | null {
  return record.bundle.graded.find((graded) => graded.trade.id === id) ?? null;
}

export function noteFor(record: ReviewRecord, id: string): TradeNote | null {
  return record.tradeNotes?.[id] ?? null;
}

export function toDesk(record: ReviewRecord): Desk {
  const { bundle } = record;
  const spines = [...bundle.graded]
    .sort((a, b) => b.trade.entryTs - a.trade.entryTs)
    .map(toSpine);

  return {
    spines,
    sourceLine: sourceLine(record),
    rangeLine: rangeLine(bundle.range),
    countLine: `${spines.length} ${spines.length === 1 ? "round trip" : "round trips"}`,
    verificationLine: verificationLine(record),
    live: record.verification.verified,
  };
}

function rangeLine(range: { fromTs: number; toTs: number }): string {
  if (range.fromTs === 0) return "no dated trades in this record";
  const from = fullLabel(range.fromTs);
  const to = fullLabel(range.toTs);
  return from === to ? from : `${from} to ${to}`;
}

function sourceLine(record: ReviewRecord): string {
  const { source } = record.bundle;
  return source.kind === "ledger"
    ? `simulated record, Kaaval brain ${source.brain}`
    : `read-only, Bitget account ${source.accountId}`;
}

function verificationLine(record: ReviewRecord): string {
  const { verified, reason, fills } = record.verification;
  // An account review has no ledger and no signing key: its fills came straight from Bitget
  // through a read-only key, and that is the honest thing to say instead of a blank key.
  if (record.bundle.source.kind === "account") {
    return `${fills} fills read from Bitget through a read-only key, nothing signed by us`;
  }
  if (!verified) return `ledger refused: ${reason ?? "the chain did not verify"}`;
  const key = record.publicKeyHex.slice(0, 12);
  return `ledger verified, ${fills} fills signed under key ${key}`;
}
