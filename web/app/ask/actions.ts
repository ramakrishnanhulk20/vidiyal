"use server";

import { loadReview } from "@/lib/desk";
import { EngineError, runAsk, type AskResult } from "@/lib/engine-call";

export type { AskResult };

export type AskOutcome =
  | { ok: true; result: AskResult; askedAt: number }
  | { ok: false; question: string; problem: string; next: string };

const MAX_QUESTION = 300;

/**
 * One question about the review, answered from the evidence table and checked against it.
 *
 * The model, when there is one, only writes the English. Every number it uses is matched
 * back to a row of the table before the answer is returned, and a number that is not in
 * the table throws the whole draft away in favour of the paragraph the table writes for
 * itself. That check is the reason this page exists, so the page shows it when it fires.
 */
export async function askDesk(_previous: AskOutcome | null, form: FormData): Promise<AskOutcome> {
  const question = String(form.get("question") ?? "").trim();

  if (question.length < 3) {
    return {
      ok: false,
      question,
      problem: "that is not a question yet",
      next: "Ask about a symbol, a side, a grade letter, a pattern, or a stretch of time. The desk picks the trades your words name and answers from those.",
    };
  }

  const record = await loadReview();

  try {
    const result = await runAsk({
      bundle: record.bundle,
      question: question.slice(0, MAX_QUESTION),
    });
    return { ok: true, result, askedAt: Date.now() };
  } catch (error) {
    const detail = error instanceof EngineError ? error.detail : (error as Error).message;
    return {
      ok: false,
      question,
      problem: error instanceof EngineError ? error.message : "the question could not be answered",
      next: `${detail}. The evidence the answer would have been built from is still on the desk, so ask again, or read the trades themselves on the shelf.`,
    };
  }
}
