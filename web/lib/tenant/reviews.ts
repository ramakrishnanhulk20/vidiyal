import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { ReviewBundle } from "../../../src/ask/types";
import {
  AccountReviewError,
  reviewAccount,
  type AccountReviewInput,
  type AccountReviewResult,
} from "../../../src/review/account-review";
import { ModelJudge, SilentJudge, type RationaleJudge } from "../../../src/review/judge";
import { newsProvider } from "../../../src/review/news";
import * as patternDetectors from "../../../src/review/patterns";
import { AnthropicClient } from "../../../src/vendor/llm";
import type { BitgetCredentials } from "../../../src/vendor/tenant/credentials";
import type { ReviewRecord } from "../desk";
import { audit, openCredentials } from "./connections";
import { inTransaction, withDb, type Db } from "./db";
import { tenantEnv } from "./env";

/**
 * One trader's own Bitget account, reviewed on demand and kept.
 *
 * Three rules hold this together. A review is a minute of reads, so asking twice inside
 * ten minutes gives back the review that already exists rather than reading Bitget again.
 * A review costs the trader's rate limit at Bitget and ours at the news feeds, so there
 * are six an hour per signed-in trader and the answer says when the next one is free. And
 * a review is a record of what was true when it was read, so the bundle is stored whole
 * and never recomputed underneath a trader who is reading it.
 */

/** A review takes about a minute. Two inside ten would read the same 90 days twice. */
const SAME_REVIEW_MINUTES = 10;

/** Six an hour per signed-in trader, counted in the database against the verified user id. */
const REVIEWS_PER_HOUR = 6;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Bitget serves 90 days of fills, so that is the window a trader is offered by default. */
const DEFAULT_DAYS = 90;

/** The oldest range worth asking for. Anything older than this is outside Bitget's history. */
const MAX_RANGE_MS = 400 * DAY_MS;

export interface ReviewRange {
  fromTs: number;
  toTs: number;
}

export type ReviewOutcome =
  | { ok: true; reviewId: string; reused: boolean }
  | { ok: false; reason: string; next: string; retryAfterMs: number | null };

export interface ReviewRow {
  id: string;
  connectionId: string;
  label: string;
  uid: string | null;
  rangeFrom: string;
  rangeTo: string;
  generatedAt: string;
  trips: number;
  patterns: number;
  items: number;
}

export interface StoredReview {
  id: string;
  connectionId: string;
  label: string;
  uid: string | null;
  record: ReviewRecord;
}

export class ReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewError";
  }
}

/** The one call a test replaces, so the whole path can be proven without Bitget. */
export type AccountReviewRunner = (input: AccountReviewInput) => Promise<AccountReviewResult>;

export interface ReviewDeps {
  run?: AccountReviewRunner;
}

const idSchema = z.uuid("that is not an address this desk wrote");

/**
 * What a trader may ask to have reviewed. A range that is backwards, in the future or
 * older than Bitget's own history is refused here rather than turned into an empty shelf.
 */
const rangeSchema = z
  .object({
    fromTs: z.number().int().positive(),
    toTs: z.number().int().positive(),
  })
  .refine((range) => range.fromTs < range.toTs, "the start of that range is after its end")
  .refine((range) => range.toTs - range.fromTs <= MAX_RANGE_MS, "that range is longer than a year")
  .refine((range) => range.fromTs < Date.now() + 60_000, "that range starts in the future");

/** The 90 days Bitget serves, ending now. */
export function defaultRange(now: number = Date.now()): ReviewRange {
  return { fromTs: now - DEFAULT_DAYS * DAY_MS, toTs: now };
}

/**
 * Reviews one connected account, or says plainly why it could not.
 *
 * The long work happens outside any transaction and outside any lock: a review is a
 * minute of Bitget reads, news lookups and grading, and holding a database connection
 * open across it would starve every other page. The ten minute check is made again after
 * the work, so two requests that started together still end with one review.
 *
 * A key Bitget refuses never becomes a stack trace. The connection check inside the
 * engine writes one sentence a trader can act on, including the one for an account still
 * in Classic mode, and that sentence is what comes back here with the step that follows it.
 */
export async function reviewNow(
  userId: string,
  connectionId: string,
  range: ReviewRange = defaultRange(),
  deps: ReviewDeps = {},
): Promise<ReviewOutcome> {
  const id = idSchema.safeParse(connectionId);
  if (!id.success) {
    return {
      ok: false,
      reason: "that is not one of your connected keys",
      next: "Go back to your account and start the review from the key you want read.",
      retryAfterMs: null,
    };
  }

  const asked = rangeSchema.safeParse(range);
  if (!asked.success) {
    const reason = asked.error.issues[0]?.message ?? "that range cannot be read";
    return {
      ok: false,
      reason,
      next: `Ask for a window inside the last ${String(DEFAULT_DAYS)} days, which is all the history Bitget serves.`,
      retryAfterMs: null,
    };
  }

  const existing = await recentReviewId(userId, id.data);
  if (existing !== null) return { ok: true, reviewId: existing, reused: true };

  const limited = await rateLimit(userId);
  if (limited !== null) return limited;

  const opened = await openCredentials(userId, id.data);
  if (opened === null) {
    return {
      ok: false,
      reason: "that key is not on your account any more",
      next: "Connect the key again and the review will read it.",
      retryAfterMs: null,
    };
  }

  const accountId = safeAccountId(opened.uid);
  const run = deps.run ?? reviewAccount;

  let result: AccountReviewResult;
  try {
    result = await run(engineInput(opened.credentials, accountId, asked.data));
  } catch (error) {
    if (error instanceof AccountReviewError) {
      console.warn(`a review was refused for a signed-in trader: ${error.reason}`);
      return {
        ok: false,
        reason: error.reason,
        next: nextStep(error.reason, error.retryable),
        retryAfterMs: error.retryable ? 60_000 : null,
      };
    }
    console.error(`review failed: ${(error as Error).name}: ${(error as Error).message}`);
    return {
      ok: false,
      reason: "the review stopped part way through and nothing was stored",
      next: "Nothing was sent to Bitget except reads. Try again in a minute, and if it keeps failing the server log has the detail.",
      retryAfterMs: 60_000,
    };
  }

  return await store(userId, id.data, result);
}

/** Every review this trader has, newest first, with the key each one was read through. */
export async function listReviews(userId: string, connectionId?: string): Promise<ReviewRow[]> {
  return await withDb(async (db) => {
    const params: unknown[] = [userId];
    if (connectionId !== undefined) params.push(connectionId);
    const { rows } = await db.query<RawRow>(
      [
        "select r.id, r.connection_id, c.label, c.uid, r.range_from, r.range_to, r.generated_at,",
        "jsonb_array_length(r.bundle -> 'graded') as trips,",
        "jsonb_array_length(r.bundle -> 'patterns') as patterns,",
        "jsonb_array_length(r.bundle -> 'checklist') as items",
        "from reviews r join connections c on c.id = r.connection_id",
        "where c.user_id = $1",
        connectionId === undefined ? "" : "and r.connection_id = $2",
        "order by r.generated_at desc limit 50",
      ].join(" "),
      params,
    );
    return rows.map(toRow);
  });
}

/**
 * One stored review, in the shape every desk screen already reads.
 *
 * The user id is part of the query rather than checked after it, so knowing the address
 * of somebody else's review is never enough to open it.
 */
export async function getReview(userId: string, reviewId: string): Promise<StoredReview | null> {
  const id = idSchema.safeParse(reviewId);
  if (!id.success) return null;

  return await withDb(async (db) => {
    const { rows } = await db.query<{
      id: string;
      connection_id: string;
      label: string;
      uid: string | null;
      bundle: ReviewBundle | string;
      verification: ReviewRecord["verification"] | string;
      generated_at: Date | string;
    }>(
      [
        "select r.id, r.connection_id, c.label, c.uid, r.bundle, r.verification, r.generated_at",
        "from reviews r join connections c on c.id = r.connection_id",
        "where r.id = $1 and c.user_id = $2",
      ].join(" "),
      [id.data, userId],
    );
    const row = rows[0];
    if (row === undefined) return null;

    const bundle = (typeof row.bundle === "string" ? JSON.parse(row.bundle) : row.bundle) as ReviewBundle;
    const verification = (
      typeof row.verification === "string" ? JSON.parse(row.verification) : row.verification
    ) as ReviewRecord["verification"];

    return {
      id: row.id,
      connectionId: row.connection_id,
      label: row.label,
      uid: row.uid,
      record: {
        generatedAt: new Date(row.generated_at).getTime(),
        // No ledger signs a person's own Bitget account, so there is no key to name. The
        // verification line says what was actually checked instead.
        publicKeyHex: "",
        publicKeyPath: null,
        verification,
        bundle,
        detectorsRun: detectorNames(),
      },
    };
  });
}

/**
 * The name of every detector a review ran, fired or not, taken from the module's own
 * exports so a screen that says "these nine looked and found nothing" cannot fall behind.
 */
export function detectorNames(): string[] {
  return Object.entries(patternDetectors)
    .filter(([name, value]) => typeof value === "function" && name !== "detectPatterns")
    .map(([name]) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`))
    .sort();
}

/**
 * What the engine is handed for one trader's review.
 *
 * The judge is the model when a key is set and the silent one when it is not, which is a
 * normal state: without it a written note is left ungraded rather than guessed at. The
 * news cache goes in the system temp folder because a hosted web server has no writable
 * folder of its own, and a second review of the same hours then costs no feed calls.
 */
function engineInput(creds: BitgetCredentials, accountId: string, range: ReviewRange): AccountReviewInput {
  const key = tenantEnv().anthropicKey;
  const judge: RationaleJudge = key === null ? new SilentJudge() : new ModelJudge(new AnthropicClient());
  const cacheDir = join(tmpdir(), "vidiyal-web", "news-cache");

  return {
    creds,
    accountId,
    range,
    cacheDir,
    judge,
    news: newsProvider(cacheDir, () => {}),
    // The engine's own log would carry account numbers and read counts into the server
    // log for every trader, so it is dropped here and the screens say what happened.
    log: () => {},
  };
}

/** Writes the finished review and its audit line together, or writes neither. */
async function store(userId: string, connectionId: string, result: AccountReviewResult): Promise<ReviewOutcome> {
  const { bundle } = result;
  const verification = {
    verified: true,
    reason: "read-only account, fills read from Bitget",
    fills: result.fills,
    decisions: 0,
    marks: bundle.equityCurve.length,
  };

  return await withDb(async (db) =>
    inTransaction(db, async () => {
      const again = await recentReviewIdIn(db, userId, connectionId);
      if (again !== null) return { ok: true as const, reviewId: again, reused: true };

      const { rows } = await db.query<{ id: string }>(
        [
          "insert into reviews (connection_id, range_from, range_to, bundle, verification, generated_at)",
          "values ($1, to_timestamp($2 / 1000.0), to_timestamp($3 / 1000.0), $4, $5, to_timestamp($6 / 1000.0))",
          "returning id",
        ].join(" "),
        [
          connectionId,
          bundle.range.fromTs,
          bundle.range.toTs,
          JSON.stringify(bundle),
          JSON.stringify(verification),
          result.generatedAt,
        ],
      );
      const id = rows[0]?.id;
      if (id === undefined) throw new ReviewError("the database accepted no review row");

      if (result.check.ok) {
        await db.query(
          [
            "update connections set equity_usdt = $1, positions = $2, checked_at = now(), status = $3",
            "where id = $4 and user_id = $5",
          ].join(" "),
          [result.check.equityUsdt, result.check.positions, "ok", connectionId, userId],
        );
      }

      await audit(db, userId, "review.created", {
        connection: connectionId,
        review: id,
        trips: bundle.graded.length,
        fills: result.fills,
      });

      return { ok: true as const, reviewId: id, reused: false };
    }),
  );
}

async function recentReviewId(userId: string, connectionId: string): Promise<string | null> {
  return await withDb((db) => recentReviewIdIn(db, userId, connectionId));
}

async function recentReviewIdIn(db: Db, userId: string, connectionId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    [
      "select r.id from reviews r join connections c on c.id = r.connection_id",
      "where r.connection_id = $1 and c.user_id = $2",
      `and r.created_at > now() - interval '${String(SAME_REVIEW_MINUTES)} minutes'`,
      "order by r.created_at desc limit 1",
    ].join(" "),
    [connectionId, userId],
  );
  return rows[0]?.id ?? null;
}

/**
 * The hourly count, made against the verified user id rather than anything the caller
 * sends, so a second browser tab or a cleared cookie does not buy a fresh allowance.
 */
async function rateLimit(userId: string): Promise<ReviewOutcome | null> {
  return await withDb(async (db) => {
    const { rows } = await db.query<{ made: string | number; oldest: Date | string | null }>(
      [
        "select count(*) as made, min(r.created_at) as oldest",
        "from reviews r join connections c on c.id = r.connection_id",
        "where c.user_id = $1 and r.created_at > now() - interval '1 hour'",
      ].join(" "),
      [userId],
    );
    const made = Number(rows[0]?.made ?? 0);
    const oldest = rows[0]?.oldest ?? null;
    if (made < REVIEWS_PER_HOUR) return null;

    const freeAt = oldest === null ? Date.now() + HOUR_MS : new Date(oldest).getTime() + HOUR_MS;
    const waitMs = Math.max(0, freeAt - Date.now());
    const minutes = Math.max(1, Math.ceil(waitMs / 60_000));
    console.warn(`review rate limit hit by a signed-in trader, ${String(made)} in the last hour`);
    return {
      ok: false,
      reason: `That is ${String(REVIEWS_PER_HOUR)} reviews in an hour, which is the limit.`,
      next: `The next one is free in about ${String(minutes)} ${minutes === 1 ? "minute" : "minutes"}. Every review you already have stays where it is.`,
      retryAfterMs: waitMs,
    };
  });
}

/**
 * What a trader should do about a refusal, chosen from what Bitget said.
 *
 * The Classic mode sentence already carries its own steps, so nothing is added to it. The
 * rest are the four things that are actually wrong when a read-only key fails.
 */
function nextStep(reason: string, retryable: boolean): string {
  const said = reason.toLowerCase();
  if (said.includes("classic mode")) {
    return "Nothing is stored until the account is read, so connect again once the upgrade is done.";
  }
  if (said.includes("passphrase") || said.includes("secret")) {
    return "Bitget shows the passphrase once, when the key is made. If it is not to hand, make a new read-only key and connect it again.";
  }
  if (said.includes("ip allow list") || said.includes("permissions")) {
    return "Open the key on Bitget and either add this server to its IP allow list or take the allow list off. Read permission is all this needs.";
  }
  if (said.includes("rate limiting")) {
    return "Bitget is throttling this key. Give it a minute, then ask again.";
  }
  if (said.includes("nothing to read") || said.includes("history")) {
    return "Bitget serves the last 90 days of fills. A quieter account simply has fewer round trips to grade.";
  }
  return retryable
    ? "Nothing is wrong with the key itself. Ask again in a minute."
    : "Check the key is still active on Bitget and has read permission, then connect it again.";
}

/** A file name and a record name a shell can type. The uid comes from Bitget, so never trust it. */
function safeAccountId(uid: string | null): string {
  const cleaned = (uid ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned === "" ? "account" : cleaned;
}

/**
 * One row as Postgres hands it over. It carries an index signature because the query
 * helper takes any record of unknown values, and the named fields below are what this
 * file actually reads out of it.
 */
interface RawRow extends Record<string, unknown> {
  id: string;
  connection_id: string;
  label: string;
  uid: string | null;
  range_from: Date | string;
  range_to: Date | string;
  generated_at: Date | string;
  trips: number | string | null;
  patterns: number | string | null;
  items: number | string | null;
}

function toRow(row: RawRow): ReviewRow {
  return {
    id: row.id,
    connectionId: row.connection_id,
    label: row.label,
    uid: row.uid,
    rangeFrom: new Date(row.range_from).toISOString(),
    rangeTo: new Date(row.range_to).toISOString(),
    generatedAt: new Date(row.generated_at).toISOString(),
    trips: Number(row.trips ?? 0),
    patterns: Number(row.patterns ?? 0),
    items: Number(row.items ?? 0),
  };
}
