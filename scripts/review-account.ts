/**
 * Review one trader's own Bitget account and write the bundle the desk reads.
 *
 * With BITGET_API_KEY, BITGET_SECRET_KEY and BITGET_PASSPHRASE set it reads that account
 * for the last 30 days, read-only, through the same engine the web app will call. With any
 * of the three missing it runs the identical path against the fixture account in
 * test/fixtures/account, so the shape can be seen on a machine that has no key.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReviewBundle } from "../src/ask/types.js";
import { AccountReviewError, reviewAccount, type AccountReviewInput } from "../src/review/account-review.js";
import { NoNewsFeed } from "../src/review/context.js";
import { ModelJudge, SilentJudge, type RationaleJudge } from "../src/review/judge.js";
import { newsProvider } from "../src/review/news.js";
import * as patternDetectors from "../src/review/patterns.js";
import { createBitget } from "../src/vendor/bitget/client.js";
import type { BitgetCredentials } from "../src/vendor/tenant/credentials.js";
import { deskModel } from "../src/review/model.js";
import type { LlmClient } from "../src/vendor/llm.js";
import { fakeBitget, fixtureData } from "../test/support/fake-bitget.js";
import { fakeAccount } from "../test/tenant/fake-account.js";

const REVIEWS_DIR = resolve(process.cwd(), "data/state/reviews");

/** The news feed writes here, so a rerun costs no calls to SEC, GDELT or Finnhub. */
const NEWS_CACHE_DIR = resolve(process.cwd(), "data/state/news-cache");

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** The window the fixture fills and the recorded candles in test/fixtures both sit in. */
const FIXTURE_RANGE = { fromTs: 1_788_400_000_000, toTs: 1_788_600_000_000 };

/**
 * A review bundle on disk, in the shape scripts/review.ts writes and web/lib/desk.ts
 * reads. An account review has no ledger behind it, so the public key is empty and the
 * verification says what was actually checked: the fills came from Bitget itself, under a
 * key that can only read.
 */
interface ReviewFile {
  generatedAt: number;
  source: ReviewBundle["source"];
  publicKeyHex: string;
  publicKeyPath: string | null;
  verification: {
    verified: boolean;
    reason: string | null;
    fills: number;
    decisions: number;
    marks: number;
  };
  bundle: ReviewBundle;
  detectorsRun: string[];
}

function credentialsFromEnv(): BitgetCredentials | null {
  const apiKey = (process.env["BITGET_API_KEY"] ?? "").trim();
  const secretKey = (process.env["BITGET_SECRET_KEY"] ?? "").trim();
  const passphrase = (process.env["BITGET_PASSPHRASE"] ?? "").trim();
  if (apiKey === "" || secretKey === "" || passphrase === "") return null;
  return { apiKey, secretKey, passphrase };
}

/** The model client, or null when no key is set, which is a normal state and not an error. */
function modelClient(): LlmClient | null {
  return deskModel();
}

/**
 * The name of every detector the review ran, fired or not, taken from the module's own
 * exports so a desk that says "these nine looked and found nothing" cannot fall behind.
 */
function detectorNames(): string[] {
  return Object.entries(patternDetectors)
    .filter(([name, value]) => typeof value === "function" && name !== "detectPatterns")
    .map(([name]) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`))
    .sort();
}

async function main(): Promise<void> {
  const log = (line: string) => console.log(line);
  const creds = credentialsFromEnv();
  const llm = modelClient();
  const judge: RationaleJudge = llm ? new ModelJudge(llm) : new SilentJudge();
  const now = Date.now();

  console.log("Vidiyal account review");
  console.log(`judge: ${llm ? llm.model : "none, so a written note is left ungraded"}`);

  let input: AccountReviewInput;
  let outName: string;

  if (creds === null) {
    console.log("no account key set; running against the fixture account");
    input = {
      creds: { apiKey: "fixture-api-key", secretKey: "fixture-secret-key", passphrase: "fixture-passphrase" },
      accountId: "fixture-account",
      range: FIXTURE_RANGE,
      cacheDir: NEWS_CACHE_DIR,
      judge,
      news: new NoNewsFeed(),
      log,
      surface: fakeAccount(),
      market: fakeBitget({
        candlesHistory: () => fixtureData<unknown[]>("candles-tsla-15m.json"),
        fundingRateHistory: () => fixtureData("funding-btcusdt.json"),
      }),
    };
    // Named for what it is, never account-<uid>: a bundle built from fixtures must not be
    // able to sit on the shelf looking like somebody's real month.
    outName = "account-fixture";
  } else {
    const accountId = (process.env["BITGET_ACCOUNT_ID"] ?? "").trim() || "bitget-account";
    console.log(`account: ${accountId}, read-only, last 30 days`);
    input = {
      creds,
      accountId,
      range: { fromTs: now - THIRTY_DAYS_MS, toTs: now },
      cacheDir: NEWS_CACHE_DIR,
      judge,
      news: newsProvider(NEWS_CACHE_DIR, (line) => log(`  ${line}`)),
      log,
      market: createBitget(),
    };
    outName = `account-${accountId}`;
  }

  let result;
  try {
    result = await reviewAccount(input);
  } catch (error) {
    if (!(error instanceof AccountReviewError)) throw error;
    console.log(`Bitget refused: ${error.reason}`);
    console.log(error.retryable ? "trying again in a minute could help" : "trying again will not help until the key changes");
    process.exitCode = 1;
    return;
  }

  const { bundle, check } = result;
  if (check.ok && check.uid !== null && creds !== null) {
    outName = `account-${check.uid}`;
  }

  console.log("");
  console.log("Graded trades");
  if (bundle.graded.length === 0) {
    console.log("  none: this account has no closed or open round trip in the window");
  }
  for (const { trade, scores } of bundle.graded) {
    console.log(
      `  ${trade.side} ${trade.qty} ${trade.symbol} at ${trade.entryPrice.toFixed(4)}` +
        (trade.exitPrice === null ? ", still open" : ` out at ${trade.exitPrice.toFixed(4)}`) +
        `  grade ${scores.letter} ${scores.total.toFixed(1)} of 100`,
    );
    console.log(
      `    gross ${trade.grossPnl === null ? "not realised yet" : `${trade.grossPnl.toFixed(4)} USDT`}, fees ${trade.feesUsdt.toFixed(4)}, funding ${trade.fundingUsdt.toFixed(4)} USDT`,
    );
    console.log(
      `    entry ${scores.entry} sizing ${scores.sizing} exit ${scores.exit} cost ${scores.cost} reasoning ${scores.reasoning}`,
    );
    for (const line of scores.evidence) console.log(`      ${line}`);
  }

  console.log("");
  console.log("Patterns");
  if (bundle.patterns.length === 0) {
    console.log(`  none fired, ${detectorNames().length} detectors checked`);
  }
  for (const hit of bundle.patterns) {
    console.log(`  ${hit.pattern}: ${hit.description}`);
    for (const line of hit.evidence) console.log(`    ${line}`);
    console.log(`    trades: ${hit.trades.join(", ")}`);
  }

  console.log("");
  console.log("Checklist");
  if (bundle.checklist.length === 0) {
    console.log("  empty, because no pattern fired on this record");
  }
  for (const item of bundle.checklist) console.log(`  ${item.id}: ${item.text} (${item.test})`);

  const file: ReviewFile = {
    generatedAt: result.generatedAt,
    source: bundle.source,
    // No ledger signs a person's Bitget account, so there is no key to name here.
    publicKeyHex: "",
    publicKeyPath: null,
    verification: {
      verified: true,
      reason: "read-only account, fills read from Bitget",
      fills: result.fills,
      decisions: 0,
      marks: bundle.equityCurve.length,
    },
    bundle,
    detectorsRun: detectorNames(),
  };

  const path = resolve(REVIEWS_DIR, `${outName}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log("");
  console.log(
    `wrote ${path}: ${bundle.graded.length} graded trades, ${bundle.patterns.length} patterns, ${bundle.checklist.length} checklist items, ${bundle.equityCurve.length} equity points, ${result.fills} fills read`,
  );
  console.log(`verification: ${file.verification.reason}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
