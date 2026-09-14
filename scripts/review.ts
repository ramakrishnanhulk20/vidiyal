/**
 * Grade a Kaaval brain's trades from the signed ledger and write a review bundle.
 *
 * Which ledger: --ledger wins, then KAAVAL_LEDGER_DIR, then the live Kaaval ledger at
 * ../kaaval/data/state/ledger, and only when that folder does not exist does it fall
 * back to ../kaaval/data/state/ledger-demo. scripts/proof-review.ts picks the same one
 * the same way, so the proof and the shelf are never reading two different records.
 */
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReviewBundle } from "../src/ask/types.js";
import { itemsFromPatterns } from "../src/checklist/items.js";
import { readLedgerBooks, readLedgerFills, repoRelative } from "../src/ingest/ledger.js";
import { readEntries } from "../src/vendor/ledger/ledger.js";
import { buildContext } from "../src/review/context.js";
import { gradeTrade } from "../src/review/grade.js";
import { ModelJudge, NoJudgeError, SilentJudge, type RationaleJudge } from "../src/review/judge.js";
import { newsProvider } from "../src/review/news.js";
import * as patternDetectors from "../src/review/patterns.js";
import { detectPatterns, type MarkPoint } from "../src/review/patterns.js";
import { attachEquity, pairRoundTrips } from "../src/review/trades.js";
import type { FillRecord, GradedTrade, RoundTrip } from "../src/review/types.js";
import { createBitget } from "../src/vendor/bitget/client.js";
import { AnthropicClient, type LlmClient } from "../src/vendor/llm.js";

/**
 * The ledger read when nothing names one, shared with the proof script.
 *
 * Kaaval sits next to this repo, so a checkout with both needs no configuration. The live
 * ledger wins and the demo one is only the fallback: a machine that has never run the
 * engine still has a record to grade, and a machine that has run it must never quietly
 * grade the demo instead of the real one.
 */
export function defaultLedgerDir(): string {
  const live = resolve(process.cwd(), "../kaaval/data/state/ledger");
  return existsSync(live) ? live : resolve(process.cwd(), "../kaaval/data/state/ledger-demo");
}

const DEFAULT_PUBLIC_KEY_PATH = resolve(process.cwd(), "../kaaval/data/secrets/ledger-key.pub.hex");

/** The exposure and depth caps every Kaaval brain trades under, from its rulebook. */
const RULEBOOK_CAPS = { perSymbolPct: 10, maxBookFraction: 0.25 };

/** The news feed writes here, so a rerun costs no calls to SEC, GDELT or Finnhub. */
const NEWS_CACHE_DIR = resolve(process.cwd(), "data/state/news-cache");

const REVIEWS_DIR = resolve(process.cwd(), "data/state/reviews");

/**
 * A review bundle on disk, with the two facts about the record that are not part of the
 * bundle itself: whether the ledger chain and signature verified, and the public key the
 * check ran against. A screen that shows a grade has to be able to show both.
 */
interface ReviewFile {
  generatedAt: number;
  publicKeyHex: string;
  /** Where the public half was read from, or null when it came from the environment. */
  publicKeyPath: string | null;
  verification: {
    verified: boolean;
    reason: string | null;
    fills: number;
    decisions: number;
    marks: number;
  };
  bundle: ReviewBundle;
  tradeNotes: Record<string, TradeNote>;
  detectorsRun: string[];
}

/**
 * The two things the review reads about a trade that the graded bundle has no field for:
 * the headlines and scheduled events the feed found around the entry, and the sentence
 * the reasoning judge gave for its score. Both are kept per round trip id so a screen can
 * show the words behind a number instead of the number alone.
 */
interface TradeNote {
  eventsNearEntry: Array<{ ts: number; title: string }>;
  judgeReason: string | null;
}

/** Flags that carry no value. Anything else must be followed by one. */
const SWITCHES = new Set(["all", "help"]);

const USAGE = [
  "Grade one Kaaval brain's trades, or every brain in the ledger.",
  "",
  "  npm run review -- [flags]",
  "  npx tsx scripts/review.ts [flags]",
  "",
  "  --all                 review every brain the ledger holds and write a manifest",
  "  --brain <name>        which brain to read, default KAAVAL_BRAIN or claude",
  "  --ledger <dir>        the ledger directory, default KAAVAL_LEDGER_DIR, then the live",
  "                        ../kaaval/data/state/ledger, then ledger-demo if that is absent",
  "  --pubkey <file>       file holding the 64 hex characters of the public half",
  "  --source <kind>       kaaval, the only record this script reads",
  "  --from <iso date>     ignore fills before this moment",
  "  --to <iso date>       ignore fills after this moment",
  "  --out <name>          bundle name under data/state/reviews, default kaaval-<brain>",
  "  --help                print this and stop",
  "",
  "Bundles are written to data/state/reviews. With --all a manifest.json lands beside them.",
].join("\n");

interface Args {
  source: string;
  brain: string;
  ledger: string;
  pubkey: string | null;
  from: number | null;
  to: number | null;
  out: string;
  all: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();
  const switches = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined || !token.startsWith("--")) continue;
    const name = token.slice(2);
    if (SWITCHES.has(name)) {
      switches.add(name);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`${token} needs a value`);
    }
    flags.set(name, next);
    i += 1;
  }
  const brain = flags.get("brain") ?? process.env["KAAVAL_BRAIN"] ?? "claude";
  return {
    source: flags.get("source") ?? "kaaval",
    brain,
    ledger: flags.get("ledger") ?? process.env["KAAVAL_LEDGER_DIR"] ?? defaultLedgerDir(),
    pubkey: flags.get("pubkey") ?? null,
    from: readTime(flags.get("from"), "--from"),
    to: readTime(flags.get("to"), "--to"),
    out: flags.get("out") ?? `kaaval-${brain}`,
    all: switches.has("all"),
    help: switches.has("help"),
  };
}

function readTime(value: string | undefined, flag: string): number | null {
  if (value === undefined) return null;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) throw new Error(`${flag} is not an ISO date: ${value}`);
  return ts;
}

/** The key and where it was read from, since a desk that shows a grade has to say both. */
function readPublicKey(path: string | null): { hex: string; file: string | null } {
  const fromEnv = process.env["KAAVAL_LEDGER_PUBLIC_KEY_HEX"];
  if (path === null && fromEnv) return { hex: fromEnv.trim(), file: null };
  const file =
    path ??
    process.env["KAAVAL_LEDGER_PUBLIC_KEY_FILE"] ??
    process.env["KAAVAL_LEDGER_PUBLIC_KEY_PATH"] ??
    DEFAULT_PUBLIC_KEY_PATH;
  if (!existsSync(file)) {
    throw new Error(`no ledger public key: pass --pubkey <hex file> or put the hex at ${file}`);
  }
  return { hex: readFileSync(file, "utf8").trim(), file: repoRelative(file) };
}

/** The model client, or null when no key is set, which is a normal state and not an error. */
function modelClient(): LlmClient | null {
  return process.env["ANTHROPIC_API_KEY"] ? new AnthropicClient() : null;
}

/**
 * The name of every detector the review ran, fired or not.
 *
 * Taken from the module's own exports rather than written out here, so a desk that says
 * "these nine looked and found nothing" cannot quietly fall behind the detectors that
 * exist. Each detector is exported under the camel case of the pattern id it reports.
 */
function detectorNames(): string[] {
  return Object.entries(patternDetectors)
    .filter(([name, value]) => typeof value === "function" && name !== "detectPatterns")
    .map(([name]) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`))
    .sort();
}

function medianWinnerHold(trips: RoundTrip[]): number | null {
  const holds = trips
    .filter((trip) => trip.exitTs !== null && trip.grossPnl !== null && trip.grossPnl > 0)
    .map((trip) => trip.exitTs! - trip.entryTs)
    .sort((a, b) => a - b);
  if (holds.length === 0) return null;
  const middle = Math.floor(holds.length / 2);
  return holds.length % 2 === 1 ? holds[middle]! : (holds[middle - 1]! + holds[middle]!) / 2;
}

function allFills(graded: GradedTrade[]): FillRecord[] {
  const byId = new Map<string, FillRecord>();
  for (const g of graded) {
    for (const fill of g.trade.fills) byId.set(fill.id, fill);
  }
  return [...byId.values()];
}

/**
 * Every price the record observed: the marks Kaaval wrote at each tick, plus the fills
 * themselves, because a fill is a price that was actually paid at a known moment.
 */
function markPoints(
  priceMarks: Array<{ ts: number; symbol: string; price: number }>,
  graded: GradedTrade[],
): MarkPoint[] {
  const fromFills = allFills(graded).map((fill) => ({
    ts: fill.ts,
    symbol: fill.symbol,
    price: fill.price,
  }));
  return [...priceMarks, ...fromFills].sort((a, b) => a.ts - b.ts);
}

/** One brain of one ledger, graded and written to one bundle. */
interface ReviewJob {
  ledger: string;
  brain: string;
  publicKeyHex: string;
  publicKeyPath: string | null;
  from: number | null;
  to: number | null;
  out: string;
}

/** One line of the shelf: enough to name a bundle and say how fresh it is, nothing more. */
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

/**
 * Every brain that decided something in this ledger.
 *
 * Read from the decision entries rather than from a list kept here, because a ledger
 * written by an engine with a brain we have never heard of still has to be reviewable.
 * The engine's own account writes the config, snapshot and halt entries, so it is not a
 * brain and is left out.
 */
export function brainsInLedger(dir: string): string[] {
  const brains = new Set<string>();
  for (const entry of readEntries(dir)) {
    if (entry.kind === "decision" && entry.account !== "kaaval") brains.add(entry.account);
  }
  return [...brains].sort();
}

async function reviewOne(job: ReviewJob, log: (line: string) => void): Promise<ReviewFile | null> {
  const args = job;
  const publicKeyHex = job.publicKeyHex;
  const read = readLedgerFills(args.ledger, publicKeyHex, args.brain);
  log(`ledger: ${args.ledger}`);
  log(`brain:  ${args.brain}`);
  log(`key:    ${publicKeyHex.slice(0, 16)}... (public half only)`);
  if (!read.verified) {
    log(`ledger refused: ${read.reason}`);
    return null;
  }
  log(
    `ledger verified: ${read.fills.length} fills, ${read.decisions.size} decisions, ${read.marks.length} equity marks`,
  );

  const inRange = read.fills.filter(
    (fill) =>
      (args.from === null || fill.ts >= args.from) && (args.to === null || fill.ts <= args.to),
  );
  const { trips, skipped } = pairRoundTrips(inRange);
  const withEquity = attachEquity(trips, read.marks);
  log(`paired into ${withEquity.length} round trips, ${skipped.length} fills skipped`);

  const ctx = createBitget();
  const books = readLedgerBooks(args.ledger);
  const llm = modelClient();
  const judge: RationaleJudge = llm ? new ModelJudge(llm) : new SilentJudge();
  log(`judge: ${llm ? llm.model : "none, so a written note is left ungraded"}`);
  const news = newsProvider(NEWS_CACHE_DIR, (line) => log(`  ${line}`));
  const winnersMedianHoldMs = medianWinnerHold(withEquity);

  const graded: GradedTrade[] = [];
  const tradeNotes: Record<string, TradeNote> = {};
  for (const trip of withEquity) {
    const built = await buildContext(ctx, trip, { news, rulebookStops: true, books });
    const priced = built.trip;
    let reasoningScore: number | null = null;
    let judgeReason: string | null = null;
    try {
      const judged = await judge.score(priced, built.context);
      reasoningScore = judged.score;
      judgeReason = judged.reason;
    } catch (error) {
      if (!(error instanceof NoJudgeError)) throw error;
      judgeReason = "no judge was plugged in, so the note this trade carries was left ungraded";
    }
    // The provider holds every gather for the life of the process, so asking a second
    // time for the window this trade already pulled costs no call to any news host.
    tradeNotes[priced.id] = {
      eventsNearEntry: await news.eventsNear(priced.entryTs, priced.symbol),
      judgeReason,
    };
    const scores = gradeTrade(priced, built.context, {
      rulebookCaps: RULEBOOK_CAPS,
      medianSizeUsdt: null,
      winnersMedianHoldMs,
      reasoningScore,
    });
    graded.push({ trade: priced, context: built.context, scores });
    log(
      `  ${priced.id}  ${priced.side} ${priced.symbol}  grade ${scores.letter} ${scores.total.toFixed(1)}`,
    );
  }

  const patterns = detectPatterns(graded, read.marks, markPoints(read.priceMarks, graded));
  const checklist = itemsFromPatterns(patterns);

  const entryTimes = withEquity.map((trip) => trip.entryTs);
  const exitTimes = withEquity.map((trip) => trip.exitTs ?? trip.entryTs);
  const bundle: ReviewBundle = {
    source: { kind: "ledger", dir: repoRelative(args.ledger), brain: args.brain },
    range: {
      fromTs: args.from ?? (entryTimes.length > 0 ? Math.min(...entryTimes) : 0),
      toTs: args.to ?? (exitTimes.length > 0 ? Math.max(...exitTimes) : 0),
    },
    graded,
    patterns,
    checklist,
    equityCurve: read.marks,
  };

  const file: ReviewFile = {
    generatedAt: Date.now(),
    publicKeyHex,
    publicKeyPath: job.publicKeyPath,
    verification: {
      verified: read.verified,
      reason: read.reason,
      fills: read.fills.length,
      decisions: read.decisions.size,
      marks: read.marks.length,
    },
    bundle,
    tradeNotes,
    detectorsRun: detectorNames(),
  };

  const path = resolve(REVIEWS_DIR, `${args.out}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  const headlines = Object.values(tradeNotes).reduce((sum, note) => sum + note.eventsNearEntry.length, 0);
  log(
    `wrote ${path}: ${graded.length} graded trades, ${patterns.length} patterns, ${checklist.length} checklist items, ${read.marks.length} equity points, ${headlines} headlines and events near an entry, ${file.detectorsRun.length} detectors run`,
  );
  return file;
}

/**
 * Every brain in one ledger, graded, with a manifest listing what was written.
 *
 * The manifest is what a reader of the published record sees first, so it is written
 * last and only from bundles that actually landed: a name in it with no file behind it
 * would be a shelf promising a review nobody can open. A brain whose entries refuse to
 * verify is left out of the manifest and named in the log.
 */
export async function reviewAll(opts: {
  ledger: string;
  pubkey?: string | null;
  from?: number | null;
  to?: number | null;
  log?: (line: string) => void;
}): Promise<ReviewManifest> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const key = readPublicKey(opts.pubkey ?? null);
  const brains = brainsInLedger(opts.ledger);
  if (brains.length === 0) {
    throw new Error(`no brain decided anything in ${opts.ledger}, so there is nothing to review`);
  }
  log(`brains in the ledger: ${brains.join(", ")}`);

  const reviews: ReviewManifestEntry[] = [];
  for (const brain of brains) {
    const name = `kaaval-${brain}`;
    const file = await reviewOne(
      {
        ledger: opts.ledger,
        brain,
        publicKeyHex: key.hex,
        publicKeyPath: key.file,
        from: opts.from ?? null,
        to: opts.to ?? null,
        out: name,
      },
      log,
    );
    if (file === null) continue;
    reviews.push({
      name,
      source: file.bundle.source,
      range: file.bundle.range,
      graded: file.bundle.graded.length,
      generatedAt: file.generatedAt,
    });
  }

  const manifest: ReviewManifest = { generatedAt: Date.now(), reviews };
  const path = resolve(REVIEWS_DIR, "manifest.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  log(`wrote ${path}: ${reviews.map((review) => `${review.name} (${review.graded})`).join(", ")}`);
  return manifest;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (args.source !== "kaaval") {
    throw new Error(
      `--source ${args.source} is not readable yet: this script reviews a Kaaval ledger, and an account review needs read-only Bitget keys`,
    );
  }

  if (args.all) {
    await reviewAll({ ledger: args.ledger, pubkey: args.pubkey, from: args.from, to: args.to });
    return;
  }

  const key = readPublicKey(args.pubkey);
  const file = await reviewOne(
    {
      ledger: args.ledger,
      brain: args.brain,
      publicKeyHex: key.hex,
      publicKeyPath: key.file,
      from: args.from,
      to: args.to,
      out: args.out,
    },
    (line) => console.log(line),
  );
  if (file === null) process.exitCode = 1;
}

// The review loop imports reviewAll from here, so loading this module must not start a run.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
