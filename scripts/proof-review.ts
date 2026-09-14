/**
 * The prove-it run: read one Kaaval ledger, grade it, fire every detector, hold an idea
 * against the checklist and answer a question, printing what a reader can check.
 *
 * Which ledger: KAAVAL_LEDGER_DIR wins, then the live Kaaval ledger at
 * ../kaaval/data/state/ledger, and only when that folder does not exist does it fall
 * back to ../kaaval/data/state/ledger-demo. scripts/review.ts picks the same one the
 * same way, so the proof and the shelf are never reading two different records.
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { answerQuestion } from "../src/ask/answer.js";
import type { ReviewBundle } from "../src/ask/types.js";
import { checkIdea } from "../src/checklist/gate.js";
import { itemsFromPatterns } from "../src/checklist/items.js";
import { bitgetAccountReader } from "../src/ingest/account.js";
import { readLedgerBooks, readLedgerFills } from "../src/ingest/ledger.js";
import { buildContext } from "../src/review/context.js";
import { gradeTrade } from "../src/review/grade.js";
import { ModelJudge, NoJudgeError, SilentJudge, type RationaleJudge } from "../src/review/judge.js";
import { newsProvider } from "../src/review/news.js";
import { addedWhileUnderWater, detectPatterns, type MarkPoint } from "../src/review/patterns.js";
import { attachEquity, pairRoundTrips } from "../src/review/trades.js";
import type { ChecklistItem, FillRecord, GradedTrade, Idea, RoundTrip } from "../src/review/types.js";
import { createBitget } from "../src/vendor/bitget/client.js";
import { defaultLedgerDir } from "./review.js";
import { AnthropicClient, type LlmClient } from "../src/vendor/llm.js";

const DEFAULT_PUBLIC_KEY_PATH = resolve(process.cwd(), "../kaaval/data/secrets/ledger-key.pub.hex");

/** The exposure and depth caps every Kaaval brain trades under, from its rulebook. */
const RULEBOOK_CAPS = { perSymbolPct: 10, maxBookFraction: 0.25 };

const IDEA: Idea = {
  category: "SPOT",
  symbol: "RTSLAUSDT",
  side: "buy",
  notionalUsdt: 300,
  note: null,
};

const DETECTORS = [
  "revenge-trading",
  "weekend-overexposure",
  "chasing-the-gap",
  "overtrading",
  "holding-losers",
  "concentration",
  "fee-bleed",
  "ignored-stops",
  "added-while-under-water",
];

/** The news feed writes here, so a rerun costs no calls to SEC, GDELT or Finnhub. */
const NEWS_CACHE_DIR = resolve(process.cwd(), "data/state/news-cache");

/**
 * The divergence item is run even when no pattern earned it, because it is the one item
 * whose answer depends on whether the US market is open at the moment of the run and the
 * proof is meant to show that.
 */
const DIVERGENCE_ITEM: ChecklistItem = {
  id: "check-chasing-the-gap",
  pattern: "chasing-the-gap",
  text: "No entries while the price is more than 1 percent from the last regular close",
  test: "divergence-under-1pct",
};

const QUESTION = "why did this account lose on rTSLA?";

/** Three is enough to show what the desk knew without burying the grade. */
const NEWS_TITLES_SHOWN = 3;

async function main(): Promise<void> {
  const dir = process.env["KAAVAL_LEDGER_DIR"] ?? defaultLedgerDir();
  const brain = process.env["KAAVAL_BRAIN"] ?? "claude";
  const publicKeyHex = readPublicKey();

  console.log("Vidiyal review proof");
  console.log(`ledger: ${dir}`);
  console.log(`brain:  ${brain}`);
  console.log(`key:    ${publicKeyHex.slice(0, 16)}... (public half only)`);
  console.log("");

  const read = readLedgerFills(dir, publicKeyHex, brain);
  if (!read.verified) {
    console.log(`ledger refused: ${read.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `ledger verified: ${read.fills.length} fills, ${read.decisions.size} decisions, ${read.marks.length} equity marks`,
  );

  const { trips, skipped } = pairRoundTrips(read.fills);
  const withEquity = attachEquity(trips, read.marks);
  console.log(`paired into ${withEquity.length} round trips, ${skipped.length} fills skipped`);
  for (const note of skipped) console.log(`  skipped: ${note}`);
  console.log("");

  const ctx = createBitget();
  const books = readLedgerBooks(dir);
  const llm = modelClient();
  const judge: RationaleJudge = llm ? new ModelJudge(llm) : new SilentJudge();
  const news = newsProvider(NEWS_CACHE_DIR, (line) => console.log(`  ${line}`));
  const winnersMedianHoldMs = medianWinnerHold(withEquity);
  const graded: GradedTrade[] = [];
  let perpTrips = 0;

  console.log(`reasoning judge: ${llm ? `${llm.model} through the Anthropic SDK` : "none, so a written note is left ungraded"}`);
  console.log("news: SEC EDGAR and GDELT always, Finnhub company news and calendars when FINNHUB_API_KEY is set");
  console.log("");
  console.log("Graded trades");
  for (const trip of withEquity) {
    const built = await buildContext(ctx, trip, { news, rulebookStops: true, books });
    const context = built.context;
    const priced = built.trip;

    let reasoningScore: number | null = null;
    let judgeLine = "";
    try {
      const verdict = await judge.score(priced, context);
      reasoningScore = verdict.score;
      judgeLine = `judge: ${verdict.score} of 5, ${verdict.reason}`;
    } catch (error) {
      if (!(error instanceof NoJudgeError)) throw error;
      judgeLine = "judge: rationale left ungraded, no reasoning judge is plugged in";
    }

    const scores = gradeTrade(priced, context, {
      rulebookCaps: RULEBOOK_CAPS,
      medianSizeUsdt: null,
      winnersMedianHoldMs,
      reasoningScore,
    });
    graded.push({ trade: priced, context, scores });

    console.log("");
    console.log(
      `  ${priced.id}  ${priced.side} ${priced.qty} ${priced.symbol} at ${priced.entryPrice.toFixed(4)}` +
        (priced.exitPrice === null ? ", still open" : ` out at ${priced.exitPrice.toFixed(4)}`),
    );
    console.log(
      `    gross ${priced.grossPnl === null ? "not realised yet" : `${priced.grossPnl.toFixed(4)} USDT`}, fees ${priced.feesUsdt.toFixed(4)}, slippage ${priced.slippageUsdt.toFixed(4)} USDT`,
    );
    if (priced.category === "USDT-FUTURES") {
      perpTrips += 1;
      console.log(
        `    funding ${priced.fundingUsdt.toFixed(4)} USDT over the hold window, from Bitget's own funding history${priced.fundingUsdt < 0 ? " (paid)" : priced.fundingUsdt > 0 ? " (received)" : ""}`,
      );
    }
    const near = await news.eventsNear(priced.entryTs, priced.symbol);
    console.log(
      `    news near the entry: ${near.length === 0 ? "nothing the feed published between 6 hours before and 1 hour after it" : `${near.length} items, nearest first`}`,
    );
    for (const item of nearest(near, priced.entryTs)) {
      console.log(`      ${new Date(item.ts).toISOString()}  ${item.title}`);
    }
    console.log(`    ${judgeLine}`);
    console.log(
      `    grade ${scores.letter} ${scores.total.toFixed(1)} of 100  entry ${scores.entry} sizing ${scores.sizing} exit ${scores.exit} cost ${scores.cost} reasoning ${scores.reasoning}`,
    );
    for (const line of scores.evidence) console.log(`      ${line}`);
  }
  console.log("");
  if (perpTrips === 0) {
    console.log("funding: no perp trips in this record, so nothing paid or received funding");
    console.log("");
  }

  const marks = markPoints(read.priceMarks, graded);
  const patterns = detectPatterns(graded, read.marks, marks);
  const underWater = addedWhileUnderWater(allFills(graded), marks);
  console.log(
    `added-while-under-water: ${underWater === null ? `did not fire over ${allFills(graded).length} fills against ${marks.length} marks` : underWater.evidence.join("; ")}`,
  );
  console.log("");
  console.log("Patterns");
  if (patterns.length === 0) {
    console.log(`  none fired, ${DETECTORS.length} detectors checked: ${DETECTORS.join(", ")}`);
  }
  for (const hit of patterns) {
    console.log(`  ${hit.pattern}: ${hit.description}`);
    for (const line of hit.evidence) console.log(`    ${line}`);
    console.log(`    trades: ${hit.trades.join(", ")}`);
  }
  console.log("");

  const checklist = itemsFromPatterns(patterns);
  console.log("Checklist");
  if (checklist.length === 0) {
    console.log("  empty, because no pattern fired on this record");
  }
  for (const item of checklist) console.log(`  ${item.id}: ${item.text} (${item.test})`);

  const items = checklist.some((item) => item.test === DIVERGENCE_ITEM.test)
    ? checklist
    : [...checklist, DIVERGENCE_ITEM];
  if (items !== checklist) {
    console.log(`  ${DIVERGENCE_ITEM.id}: added by this proof so the divergence test can be seen (${DIVERGENCE_ITEM.test})`);
  }
  console.log("");

  const equity = read.marks.at(-1)?.equity ?? null;
  if (equity === null) {
    console.log("idea check skipped: the ledger carries no equity mark to size against");
  } else {
    console.log(`Idea: ${IDEA.side} ${IDEA.symbol} ${IDEA.notionalUsdt} USDT`);
    const check = await checkIdea(ctx, IDEA, items, {
      recentTrips: graded.map((g) => g.trade),
      equity,
      netExposureUsdt: netExposure(withEquity),
    });
    for (const result of check.results) {
      console.log(`  ${result.pass ? "pass" : "FAIL"}  ${result.item.text}`);
      console.log(`        ${result.observed}`);
    }
    console.log(`  verdict: ${check.pass ? "passes the checklist" : "blocked by the checklist"}`);
    console.log(`  ${check.dryRunNote}`);
    if (check.dryRun !== null) {
      console.log(`  ${JSON.stringify(check.dryRun)}`);
    } else {
      console.log(
        "  the Agent Hub preview is only built when every item passes, which is the point of the gate",
      );
    }
  }
  console.log("");

  const bundle: ReviewBundle = {
    source: { kind: "ledger", dir, brain },
    range: {
      fromTs: Math.min(...withEquity.map((t) => t.entryTs)),
      toTs: Math.max(...withEquity.map((t) => t.exitTs ?? t.entryTs)),
    },
    graded,
    patterns,
    checklist,
    equityCurve: read.marks,
  };
  console.log(
    `review bundle: ${bundle.graded.length} graded trades, ${bundle.patterns.length} patterns, ${bundle.checklist.length} checklist items, ${bundle.equityCurve.length} equity points`,
  );
  console.log("");

  const answer = await answerQuestion(bundle, QUESTION, llm);
  console.log(`Question: ${answer.question}`);
  console.log(`  answered by: ${llm ? `${llm.model}, checked against the evidence below` : "the evidence table itself, with no model in the loop"}`);
  console.log("");
  console.log(`  ${answer.narrative}`);
  console.log("");
  console.log("  Evidence, one row per fact the answer was allowed to use");
  for (const row of answer.evidence) {
    console.log(`    ${row.ref} | ${row.fact} | ${row.value}`);
  }
  console.log(`  cited refs: ${answer.citedRefs.join(", ") || "none"}`);
  console.log(
    `  numbers with no evidence behind them: ${answer.uncitedNumbers.length === 0 ? "none, every number in the answer came from a trade" : answer.uncitedNumbers.join(", ")}`,
  );
  console.log("");

  await accountReview();
}

async function accountReview(): Promise<void> {
  if (!process.env["BITGET_API_KEY"]) {
    console.log("account review skipped: no BITGET_API_KEY");
    return;
  }
  const accountId = process.env["BITGET_ACCOUNT_ID"] ?? "bitget-account";
  const reader = bitgetAccountReader(createBitget({ modules: "all" }), accountId);
  const toTs = Date.now();
  const fromTs = toTs - 7 * 24 * 60 * 60 * 1000;
  // A wrong or expired key is the common case for a stranger running this, and it must
  // end the step with a sentence, not a stack trace, because the ledger review above it
  // has already proved what this command is for.
  let fills;
  try {
    fills = await reader.fills({ fromTs, toTs });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    console.log(`account review skipped: Bitget refused the key (${text.slice(0, 160)})`);
    return;
  }
  const { trips, skipped } = pairRoundTrips(fills);
  console.log(
    `account review: ${fills.length} fills over 7 days paired into ${trips.length} round trips, ${skipped.length} skipped`,
  );
}

function readPublicKey(): string {
  const fromEnv = process.env["KAAVAL_LEDGER_PUBLIC_KEY_HEX"];
  if (fromEnv) return fromEnv.trim();
  const path = process.env["KAAVAL_LEDGER_PUBLIC_KEY_PATH"] ?? DEFAULT_PUBLIC_KEY_PATH;
  if (!existsSync(path)) {
    throw new Error(
      `no ledger public key: set KAAVAL_LEDGER_PUBLIC_KEY_HEX or put the hex at ${path}`,
    );
  }
  return readFileSync(path, "utf8").trim();
}

/** The model client, or null when no key is set, which is a normal state and not an error. */
function modelClient(): LlmClient | null {
  return process.env["ANTHROPIC_API_KEY"] ? new AnthropicClient() : null;
}

/**
 * Every price the record observed: the marks Kaaval wrote at each tick, plus the fills
 * themselves, because a fill is a price that was actually paid at a known moment and a
 * record with sparse marks would otherwise leave an add unjudged.
 */
function markPoints(
  priceMarks: Array<{ ts: number; symbol: string; price: number }>,
  graded: GradedTrade[],
): MarkPoint[] {
  const fromFills = allFills(graded).map((fill) => ({ ts: fill.ts, symbol: fill.symbol, price: fill.price }));
  return [...priceMarks, ...fromFills].sort((a, b) => a.ts - b.ts);
}

function allFills(graded: GradedTrade[]): FillRecord[] {
  const byId = new Map<string, FillRecord>();
  for (const g of graded) {
    for (const fill of g.trade.fills) byId.set(fill.id, fill);
  }
  return [...byId.values()];
}

/** The events closest in time to the entry, whichever side of it they fell. */
function nearest(
  events: Array<{ ts: number; title: string }>,
  entryTs: number,
): Array<{ ts: number; title: string }> {
  return [...events]
    .sort((a, b) => Math.abs(a.ts - entryTs) - Math.abs(b.ts - entryTs))
    .slice(0, NEWS_TITLES_SHOWN)
    .sort((a, b) => a.ts - b.ts);
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

function netExposure(trips: RoundTrip[]): number {
  return trips
    .filter((trip) => trip.exitTs === null)
    .reduce(
      (sum, trip) => sum + (trip.side === "long" ? 1 : -1) * trip.qty * trip.entryPrice,
      0,
    );
}

await main();
