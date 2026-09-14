"use server";

import type { Category, Idea, IdeaCheck } from "../../../src/review/types.js";
import { loadReview } from "@/lib/desk";
import { EngineError, runGate } from "@/lib/engine-call";
import { deskState } from "@/lib/idea";

export type GateOutcome =
  | { ok: true; idea: Idea; check: IdeaCheck; ranAt: number; items: number }
  | { ok: false; problem: string; next: string };

/** Bitget's own floor for a tokenized stock order, and the floor the desk asks for. */
const MIN_NOTIONAL = 10;

const CATEGORIES: Category[] = ["SPOT", "USDT-FUTURES"];

/**
 * One typed idea held against the checklist this review earned.
 *
 * The check itself runs in the engine's process against the live market, so the answer
 * is what the market is doing now rather than what it did when the trades that taught
 * the lesson were made. Nothing here places an order: a passing idea ends at the Agent
 * Hub dry run, which hands back the request Bitget would have received.
 */
export async function holdIdea(_previous: GateOutcome | null, form: FormData): Promise<GateOutcome> {
  const [category, symbol] = String(form.get("instrument") ?? "").split("|");
  const side = String(form.get("side") ?? "");
  const notionalUsdt = Number(form.get("notional"));
  const note = String(form.get("note") ?? "").trim();

  if (!symbol || !category || !CATEGORIES.includes(category as Category)) {
    return {
      ok: false,
      problem: "no instrument was chosen",
      next: "Pick one of the instruments in the list. They are the ones this record traded and the ones the engine behind it built its universe from.",
    };
  }
  if (side !== "buy" && side !== "sell") {
    return { ok: false, problem: "no side was chosen", next: "Choose buy or sell." };
  }
  if (!Number.isFinite(notionalUsdt) || notionalUsdt < MIN_NOTIONAL) {
    return {
      ok: false,
      problem: `${form.get("notional")} USDT is not a size the gate can check`,
      next: `Type a number of USDT, ${MIN_NOTIONAL} or more. Bitget refuses a tokenized stock order under ${MIN_NOTIONAL} USDT, so anything smaller could not be previewed either.`,
    };
  }

  const idea: Idea = {
    category: category as Category,
    symbol,
    side,
    notionalUsdt,
    note: note === "" ? null : note.slice(0, 280),
  };

  const record = await loadReview();
  const items = record.bundle.checklist;

  try {
    const check = await runGate({ idea, items, state: deskState(record.bundle) });
    return { ok: true, idea, check, ranAt: Date.now(), items: items.length };
  } catch (error) {
    if (error instanceof EngineError) {
      return { ok: false, problem: error.message, next: nextStep(error.detail) };
    }
    return {
      ok: false,
      problem: "the gate could not be run",
      next: `${(error as Error).message}. Nothing was sent to Bitget.`,
    };
  }
}

/**
 * What a reader should do about a failure. Bitget refusing a symbol and Bitget being
 * unreachable are different problems with different answers, and a gate that says only
 * "something went wrong" is a gate nobody trusts with the next order.
 */
function nextStep(detail: string): string {
  const said = detail.toLowerCase();
  if (said.includes("does not exist") || said.includes("symbol") || said.includes("instrument")) {
    return `Bitget did not recognise that instrument: ${detail}. Pick one from the list, which is built from this record and the engine's own universe.`;
  }
  if (said.includes("timeout") || said.includes("econn") || said.includes("fetch")) {
    return `Bitget did not answer in time: ${detail}. The market reads the gate makes are public, so this is the venue or the network, not a missing key. Try again in a moment.`;
  }
  return detail === ""
    ? "The engine stopped without saying why. Nothing was sent to Bitget. Try again, and if it repeats, run the same idea from the engine with npm run proof:review to see the whole log."
    : `${detail}. Nothing was sent to Bitget.`;
}
