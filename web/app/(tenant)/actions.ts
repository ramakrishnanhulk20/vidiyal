"use server";

import type { Answer } from "../../../src/ask/answer";
import type { Category, ChecklistItem, GradedTrade, Idea, IdeaCheck, PatternHit } from "../../../src/review/types";
import type { Spine } from "@/lib/desk";
import { toDesk, toSpine } from "@/lib/desk";
import { EngineError, runAsk, runGate } from "@/lib/engine-call";
import { deskState, symbolChoices, type SymbolChoices } from "@/lib/idea";
import { requireUser } from "@/lib/tenant/auth";
import {
  connect,
  listConnections,
  removeConnection,
  type ConnectInput,
  type ConnectionRow,
} from "@/lib/tenant/connections";
import { tenantConfigured } from "@/lib/tenant/env";
import { getReview, listReviews, reviewNow, type ReviewRow } from "@/lib/tenant/reviews";

/**
 * Everything the account screens can ask the server to do.
 *
 * The access token is an argument, not a cookie the browser sends by itself, and the user
 * id is whatever comes out of verifying it. Nothing below reads a user id from the
 * request, so no caller can read another trader's review by naming its address.
 */

export interface ActionFailure {
  ok: false;
  reason: string;
  next: string;
}

export type ConnectActionResult =
  | { ok: true; connectionId: string; uid: string | null; equityUsdt: number; positions: number }
  | (ActionFailure & { retryable: boolean });

export type AccountActionResult = { ok: true; connections: ConnectionRow[]; reviews: ReviewRow[] } | ActionFailure;

export type ReviewActionResult =
  | { ok: true; reviewId: string; reused: boolean }
  | (ActionFailure & { retryAfterMs: number | null });

export type RemoveActionResult = { ok: true; removed: boolean } | ActionFailure;

/** The whole review as the screens draw it, shaped on the server by lib/desk. */
export interface ReviewView {
  id: string;
  label: string;
  uid: string | null;
  generatedAt: number;
  sourceLine: string;
  rangeLine: string;
  countLine: string;
  verificationLine: string;
  fills: number;
  equityMarks: number;
  spines: Spine[];
  graded: GradedTrade[];
  patterns: PatternHit[];
  checklist: ChecklistItem[];
  detectorsRun: string[];
  choices: SymbolChoices;
}

export type ReviewDetailResult = { ok: true; view: ReviewView | null } | ActionFailure;

export type TenantGateOutcome =
  | { ok: true; idea: Idea; check: IdeaCheck; ranAt: number; items: number }
  | ActionFailure;

export type TenantAskOutcome =
  | { ok: true; answer: Answer; model: string | null; notes: string[]; askedAt: number }
  | (ActionFailure & { question: string });

export interface IdeaInput {
  instrument: string;
  side: string;
  notionalUsdt: number;
  note: string;
}

/** Bitget's own floor for a tokenized stock order, and the floor the gate asks for. */
const MIN_NOTIONAL = 10;

const CATEGORIES: Category[] = ["SPOT", "USDT-FUTURES"];

const MAX_QUESTION = 300;

/** The one place a failure in this layer becomes a sentence with a next step in it. */
function failure(error: unknown): ActionFailure {
  const named = error as Error;
  if (named.name === "AuthError") {
    return { ok: false, reason: named.message, next: "Sign in again and the screen will load." };
  }
  if (named.name === "DbError") {
    return {
      ok: false,
      reason: "the account database is not reachable from this host right now",
      next: "Nothing was lost. Try again in a minute.",
    };
  }
  console.error(`account action failed: ${named.name}: ${named.message}`);
  return {
    ok: false,
    reason: "something went wrong on our side",
    next: "Try again, and if it keeps failing the server log has the detail.",
  };
}

function notReady(): ActionFailure | null {
  const status = tenantConfigured();
  if (status.ready) return null;
  return {
    ok: false,
    reason: `the account area is not fully configured on this host: ${status.missing.join(", ")} still to set`,
    next: "Whoever runs this site sets those in the environment. The names and what each one is for are in .env.example.",
  };
}

export async function connectAction(token: string, input: ConnectInput): Promise<ConnectActionResult> {
  const blocked = notReady();
  if (blocked) return { ...blocked, retryable: false };
  try {
    const { userId } = await requireUser(token);
    const result = await connect(userId, input);
    return result.ok
      ? result
      : { ok: false, reason: result.reason, next: nextStepForKey(result.reason, result.retryable), retryable: result.retryable };
  } catch (error) {
    return { ...failure(error), retryable: false };
  }
}

export async function accountAction(token: string): Promise<AccountActionResult> {
  const blocked = notReady();
  if (blocked) return blocked;
  try {
    const { userId } = await requireUser(token);
    const [connections, reviews] = await Promise.all([listConnections(userId), listReviews(userId)]);
    return { ok: true, connections, reviews };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Reads one connected account's last 90 days and grades them. It is the long one: a
 * minute of Bitget reads, news lookups and grading, which is why the screen that calls it
 * says so while it waits.
 */
export async function reviewAction(token: string, connectionId: string): Promise<ReviewActionResult> {
  const blocked = notReady();
  if (blocked) return { ...blocked, retryAfterMs: null };
  try {
    const { userId } = await requireUser(token);
    const outcome = await reviewNow(userId, connectionId);
    return outcome.ok ? outcome : { ok: false, reason: outcome.reason, next: outcome.next, retryAfterMs: outcome.retryAfterMs };
  } catch (error) {
    return { ...failure(error), retryAfterMs: null };
  }
}

export async function removeAction(token: string, connectionId: string): Promise<RemoveActionResult> {
  const blocked = notReady();
  if (blocked) return blocked;
  try {
    const { userId } = await requireUser(token);
    return { ok: true, removed: await removeConnection(userId, connectionId) };
  } catch (error) {
    return failure(error);
  }
}

/**
 * One stored review, shaped for the screens.
 *
 * The shaping happens here rather than in the browser so the same functions that draw the
 * demo shelf draw this one: a trader's own record and the published one are the same
 * object by the time either reaches a component.
 */
export async function reviewDetailAction(token: string, reviewId: string): Promise<ReviewDetailResult> {
  const blocked = notReady();
  if (blocked) return blocked;
  try {
    const { userId } = await requireUser(token);
    const stored = await getReview(userId, reviewId);
    if (stored === null) return { ok: true, view: null };

    const { record } = stored;
    const desk = toDesk(record);
    return {
      ok: true,
      view: {
        id: stored.id,
        label: stored.label,
        uid: stored.uid,
        generatedAt: record.generatedAt,
        sourceLine: desk.sourceLine,
        rangeLine: desk.rangeLine,
        countLine: desk.countLine,
        verificationLine: desk.verificationLine,
        fills: record.verification.fills,
        equityMarks: record.bundle.equityCurve.length,
        spines: record.bundle.graded.map(toSpine),
        graded: record.bundle.graded,
        patterns: record.bundle.patterns,
        checklist: record.bundle.checklist,
        detectorsRun: record.detectorsRun ?? [],
        choices: await symbolChoices(record.bundle),
      },
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * One typed idea held against the checklist this trader's own record earned.
 *
 * The check runs against the live market, so the answer is what Bitget is doing now
 * rather than what it was doing when the trades that taught the lesson were made. A
 * passing idea ends at the Agent Hub dry run, which hands back the request Bitget would
 * have received. Nothing is ever placed.
 */
export async function reviewGateAction(
  token: string,
  reviewId: string,
  input: IdeaInput,
): Promise<TenantGateOutcome> {
  const blocked = notReady();
  if (blocked) return blocked;

  const [category, symbol] = input.instrument.split("|");
  if (!symbol || !category || !CATEGORIES.includes(category as Category)) {
    return {
      ok: false,
      reason: "no instrument was chosen",
      next: "Pick one of the instruments in the list. They are the ones your own account has traded.",
    };
  }
  if (input.side !== "buy" && input.side !== "sell") {
    return { ok: false, reason: "no side was chosen", next: "Choose buy or sell." };
  }
  if (!Number.isFinite(input.notionalUsdt) || input.notionalUsdt < MIN_NOTIONAL) {
    return {
      ok: false,
      reason: `${String(input.notionalUsdt)} USDT is not a size the gate can check`,
      next: `Type a number of USDT, ${String(MIN_NOTIONAL)} or more. Bitget refuses a tokenized stock order under ${String(MIN_NOTIONAL)} USDT, so anything smaller could not be previewed either.`,
    };
  }

  const note = input.note.trim();
  const idea: Idea = {
    category: category as Category,
    symbol,
    side: input.side,
    notionalUsdt: input.notionalUsdt,
    note: note === "" ? null : note.slice(0, 280),
  };

  try {
    const { userId } = await requireUser(token);
    const stored = await getReview(userId, reviewId);
    if (stored === null) {
      return { ok: false, reason: "that review is not on your account", next: "Go back to your account and open one of your own reviews." };
    }

    const items = stored.record.bundle.checklist;
    const check = await runGate({ idea, items, state: deskState(stored.record.bundle) });
    return { ok: true, idea, check, ranAt: Date.now(), items: items.length };
  } catch (error) {
    if (error instanceof EngineError) {
      return { ok: false, reason: error.message, next: `${error.detail}. Nothing was sent to Bitget.` };
    }
    return failure(error);
  }
}

/** One question about this trader's own review, answered from its evidence table. */
export async function reviewAskAction(
  token: string,
  reviewId: string,
  question: string,
): Promise<TenantAskOutcome> {
  const asked = question.trim();
  const blocked = notReady();
  if (blocked) return { ...blocked, question: asked };

  if (asked.length < 3) {
    return {
      ok: false,
      question: asked,
      reason: "that is not a question yet",
      next: "Ask about a symbol, a side, a grade letter, a pattern, or a stretch of time. The desk picks the trades your words name and answers from those.",
    };
  }

  try {
    const { userId } = await requireUser(token);
    const stored = await getReview(userId, reviewId);
    if (stored === null) {
      return {
        ok: false,
        question: asked,
        reason: "that review is not on your account",
        next: "Go back to your account and open one of your own reviews.",
      };
    }

    const result = await runAsk({ bundle: stored.record.bundle, question: asked.slice(0, MAX_QUESTION) });
    return { ok: true, answer: result.answer, model: result.model, notes: result.notes, askedAt: Date.now() };
  } catch (error) {
    const detail = error instanceof EngineError ? error.detail : (error as Error).message;
    return {
      ok: false,
      question: asked,
      reason: error instanceof EngineError ? error.message : "the question could not be answered",
      next: `${detail}. The evidence it would have been built from is still on your shelf, so ask again, or read the trades themselves.`,
    };
  }
}

/**
 * What to do about a key Bitget refused, in one sentence, chosen from what it said. The
 * Classic mode message already carries its own steps, so nothing is added to it.
 */
function nextStepForKey(reason: string, retryable: boolean): string {
  const said = reason.toLowerCase();
  if (said.includes("classic mode")) {
    return "Nothing was stored, so connect again once the upgrade is done.";
  }
  if (said.includes("passphrase") || said.includes("secret")) {
    return "Bitget shows the passphrase once, when the key is made. If it is not to hand, make a new read-only key and paste all three values again.";
  }
  if (said.includes("ip allow list") || said.includes("permissions")) {
    return "Open the key on Bitget and either add this server to its IP allow list or take the allow list off. Read permission is all this needs.";
  }
  if (said.includes("rate limiting")) {
    return "Bitget is throttling this key. Give it a minute, then try again.";
  }
  return retryable
    ? "Nothing is wrong with the key itself. Try again in a minute."
    : "Check all three values were copied whole, with no spaces at either end.";
}
