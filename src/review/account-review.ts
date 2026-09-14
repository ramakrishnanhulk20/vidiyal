import type { ReviewBundle } from "../ask/types.js";
import { itemsFromPatterns } from "../checklist/items.js";
import { bitgetAccountReader, clipToHistory, MAX_HISTORY_MS } from "../ingest/account.js";
import { createBitget, type BitgetContext } from "../vendor/bitget/client.js";
import {
  checkConnection,
  contextFor,
  type BitgetCredentials,
  type ConnectionCheck,
} from "../vendor/tenant/credentials.js";
import { buildContext, type NewsProvider } from "./context.js";
import { gradeTrade } from "./grade.js";
import { NoJudgeError, type RationaleJudge } from "./judge.js";
import { detectPatterns, type MarkPoint } from "./patterns.js";
import { attachEquity, pairRoundTrips } from "./trades.js";
import type { FillRecord, GradedTrade, RoundTrip } from "./types.js";

export interface AccountReviewInput {
  creds: BitgetCredentials;
  accountId: string;
  range: { fromTs: number; toTs: number };
  cacheDir: string;
  judge: RationaleJudge;
  news: NewsProvider;
  log: (line: string) => void;
  /**
   * The trader's own Bitget surface. Left out, it is built by contextFor, which is the
   * only read-only-by-construction way to make one. It exists so a caller that already
   * built one does not build a second, and so a test or the fixture run of
   * scripts/review-account.ts can put a stand-in Bitget behind the real account reader.
   */
  surface?: BitgetContext;
  /**
   * The public market surface the trade context is rebuilt from: candles and funding, no
   * credentials. It is a separate surface from the one above because the trader's key is
   * only ever used for reads of the trader's own account.
   */
  market?: BitgetContext;
}

export interface AccountReviewResult {
  bundle: ReviewBundle;
  check: ConnectionCheck;
  fills: number;
  skipped: string[];
  generatedAt: number;
  readOnly: true;
}

/**
 * Raised when a review cannot start. reason is the same plain sentence the connection
 * check writes for a trader, and retryable says whether trying again in a minute could
 * help. It never carries a credential, because this message is shown and logged.
 */
export class AccountReviewError extends Error {
  constructor(
    public readonly reason: string,
    public readonly retryable: boolean,
  ) {
    super(reason);
    this.name = "AccountReviewError";
  }
}

/**
 * One trader's own Bitget account, reviewed by the same pipeline the Kaaval demo runs.
 *
 * Read-only from end to end: the trader's key builds a surface through contextFor, which
 * has no way to turn the SDK's read-only flag off, and the only verbs used on it are
 * order fills, account_overview and funds_records. The market half of the review runs on
 * a separate public surface that carries no credential at all.
 *
 * The connection is checked before anything is read, so a wrong key comes back as one
 * sentence a trader can act on rather than as a failure part way through a review. The
 * range is clipped to the 90 days Bitget serves and the clip is written to the log.
 *
 * Bitget publishes no historical order book, so the spread and the depth at the moment of
 * each trade stay null and the rubric skips those components rather than guessing them.
 * There is no rulebook behind a person's trades either, so sizing is graded against the
 * trader's own median fill instead of against a cap.
 */
export async function reviewAccount(input: AccountReviewInput): Promise<AccountReviewResult> {
  const log = input.log;
  const surface = input.surface ?? contextFor(input.creds);

  const check = await checkConnection(input.creds, surface);
  if (!check.ok) {
    throw new AccountReviewError(check.reason, check.retryable);
  }
  log(
    `account ${input.accountId}: Bitget answered, equity ${check.equityUsdt.toFixed(2)} USDT, ${check.positions} open ${check.positions === 1 ? "position" : "positions"}`,
  );
  if (check.uid !== null && check.uid !== input.accountId) {
    log(`the key belongs to Bitget user ${check.uid}, filed here under ${input.accountId}`);
  }

  const clipped = clipToHistory(input.range);
  const range = clipped.range;
  if (clipped.clipped) {
    log(
      `Bitget serves the last ${MAX_HISTORY_MS / (24 * 60 * 60 * 1000)} days of fills, so the review starts at ${iso(range.fromTs)} instead of ${iso(input.range.fromTs)}`,
    );
  }
  if (range.fromTs >= range.toTs) {
    throw new AccountReviewError(
      "that range is entirely outside the 90 days of history Bitget serves, so there is nothing to read",
      false,
    );
  }
  log(`news cache: ${input.cacheDir}`);

  const reader = bitgetAccountReader(surface, input.accountId, { log });
  const fills = await reader.fills(range);
  const equityCurve = await reader.equityCurve(range);
  log(
    `read ${fills.length} fills and ${equityCurve.length} equity points from ${iso(range.fromTs)} to ${iso(range.toTs)}`,
  );

  const { trips, skipped } = pairRoundTrips(fills);
  const withEquity = attachEquity(trips, equityCurve);
  log(`paired into ${withEquity.length} round trips, ${skipped.length} fills skipped`);

  const market = input.market ?? createBitget();
  const medianSizeUsdt = median(fills.map((fill) => fill.notionalUsdt));
  const winnersMedianHoldMs = medianWinnerHold(withEquity);

  const graded: GradedTrade[] = [];
  for (const trip of withEquity) {
    // No recorded books: an account read cannot know the book a past fill hit, so the
    // spread and the book share stay null. No rulebook either, so no stop is implied.
    const built = await buildContext(market, trip, { news: input.news, rulebookStops: false });
    const priced = built.trip;

    let reasoningScore: number | null = null;
    try {
      reasoningScore = (await input.judge.score(priced, built.context)).score;
    } catch (error) {
      if (!(error instanceof NoJudgeError)) throw error;
    }

    const scores = gradeTrade(priced, built.context, {
      rulebookCaps: null,
      medianSizeUsdt,
      winnersMedianHoldMs,
      reasoningScore,
    });
    graded.push({ trade: priced, context: built.context, scores });
    log(`  ${priced.id}  ${priced.side} ${priced.symbol}  grade ${scores.letter} ${scores.total.toFixed(1)}`);
  }

  const patterns = detectPatterns(graded, equityCurve, markPoints(graded));
  const checklist = itemsFromPatterns(patterns);

  const bundle: ReviewBundle = {
    source: { kind: "account", accountId: input.accountId },
    range,
    graded,
    patterns,
    checklist,
    equityCurve,
  };

  return {
    bundle,
    check,
    fills: fills.length,
    skipped,
    generatedAt: Date.now(),
    readOnly: true,
  };
}

function iso(ts: number): string {
  return new Date(ts).toISOString();
}

/**
 * Every price this account is known to have traded at. A Bitget account keeps no tick by
 * tick record the way a Kaaval ledger does, so the fills are the only observed prices,
 * and each one is a price that was actually paid at a known moment.
 */
function markPoints(graded: GradedTrade[]): MarkPoint[] {
  return allFills(graded)
    .map((fill) => ({ ts: fill.ts, symbol: fill.symbol, price: fill.price }))
    .sort((a, b) => a.ts - b.ts);
}

/** A fill that closed one trip and opened the next is in both, and counts once. */
function allFills(graded: GradedTrade[]): FillRecord[] {
  const byId = new Map<string, FillRecord>();
  for (const g of graded) {
    for (const fill of g.trade.fills) byId.set(fill.id, fill);
  }
  return [...byId.values()];
}

function median(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** The hold the winners needed, which is what a cut-short winner is measured against. */
function medianWinnerHold(trips: RoundTrip[]): number | null {
  return median(
    trips
      .filter((trip) => trip.exitTs !== null && trip.grossPnl !== null && trip.grossPnl > 0)
      .map((trip) => trip.exitTs! - trip.entryTs),
  );
}
