import { answerQuestion, type Answer } from "../../src/ask/answer";
import type { ChecklistItem, Idea, IdeaCheck, PatternHit } from "../../src/review/types.js";
import { toSpine, type ReviewRecord, type Spine } from "./desk";
import { EngineError, engineMode, runGate, type EngineMode } from "./engine-call";
import { num, ticker, utcStamp } from "./format";
import { GRADE_MEANING, type Letter } from "./grades";
import { deskState, symbolChoices } from "./idea";
import { scoreRows, type ScoreRow } from "./trade";

/**
 * The eight beats of the landing story, each one read out of the same review bundle every
 * other screen reads. Nothing on the page is typed in: a beat with no artefact behind it
 * says so in its own words rather than drawing a placeholder.
 *
 * Every reader here is async because two of them reach the engine, and a page that has to
 * remember which of its beats may be awaited is a page that will one day await the wrong one.
 */

const ET_ZONE = "America/New_York";

/** The sessions a trade can land in with New York shut. */
const OUT_OF_HOURS = new Set(["after-hours", "weekend", "holiday"]);

const SESSION_WORDS: Record<string, string> = {
  "after-hours": "New York had closed hours earlier",
  weekend: "New York was shut for the weekend",
  holiday: "New York was shut for a holiday",
  regular: "New York was open",
};

export interface NightBeat {
  id: string;
  spine: Spine;
  symbol: string;
  ticker: string;
  side: "long" | "short";
  letter: Letter;
  total: number;
  /** The entry on a New York clock, which is the clock the underlying stock keeps. */
  etClock: string;
  etMeridiem: string;
  etDayLine: string;
  utcLine: string;
  session: string;
  sessionWords: string;
  toOpenLine: string;
  /** False when no entry in this record landed with New York shut, so the page names the session it did land in. */
  outOfHours: boolean;
}

export async function readNight(record: ReviewRecord): Promise<NightBeat | null> {
  const graded = record.bundle.graded;
  if (graded.length === 0) return null;

  const outside = graded.filter((one) => OUT_OF_HOURS.has(one.context.sessionAtEntry));
  const picked =
    outside.length > 0
      ? [...outside].sort(
          (a, b) =>
            etMinutes(a.trade.entryTs) - etMinutes(b.trade.entryTs) || a.trade.entryTs - b.trade.entryTs,
        )[0]!
      : [...graded].sort((a, b) => a.trade.entryTs - b.trade.entryTs)[0]!;

  const { trade, context, scores } = picked;
  const clock = etClock(trade.entryTs);

  return {
    id: trade.id,
    spine: toSpine(picked),
    symbol: trade.symbol,
    ticker: ticker(trade.symbol),
    side: trade.side,
    letter: scores.letter,
    total: scores.total,
    etClock: clock.time,
    etMeridiem: clock.meridiem,
    etDayLine: etDay(trade.entryTs),
    utcLine: utcStamp(trade.entryTs),
    session: context.sessionAtEntry,
    sessionWords: SESSION_WORDS[context.sessionAtEntry] ?? context.sessionAtEntry,
    toOpenLine: `${num(context.msToNextOpenAtEntry / 3_600_000, 1)} hours before the next regular open`,
    outOfHours: outside.length > 0,
  };
}

export interface ScoresBeat {
  id: string;
  ticker: string;
  side: "long" | "short";
  rows: ScoreRow[];
  letter: Letter;
  total: number;
  meaning: string;
  entryLine: string;
}

/** The same trade beat two named, walked through score by score. */
export async function readScores(record: ReviewRecord, id: string): Promise<ScoresBeat | null> {
  const graded = record.bundle.graded.find((one) => one.trade.id === id);
  if (graded === undefined) return null;

  const { trade, scores } = graded;
  return {
    id: trade.id,
    ticker: ticker(trade.symbol),
    side: trade.side,
    rows: scoreRows(scores),
    letter: scores.letter,
    total: scores.total,
    meaning: GRADE_MEANING[scores.letter],
    entryLine: `${trade.side} ${num(trade.qty, 4)} ${ticker(trade.symbol)} at ${num(trade.entryPrice, 4)}`,
  };
}

export interface LessonBeat {
  pattern: PatternHit | null;
  title: string;
  item: ChecklistItem | null;
  trades: Spine[];
  detectorsRun: number;
}

/** The first habit the detectors found, and the item the record earned from it. */
export async function readLesson(record: ReviewRecord): Promise<LessonBeat> {
  const hit = record.bundle.patterns[0] ?? null;
  const item =
    hit === null
      ? null
      : (record.bundle.checklist.find((one) => one.pattern === hit.pattern) ?? null);

  return {
    pattern: hit,
    title: hit === null ? "nothing repeated itself" : hit.pattern.replace(/-/g, " "),
    item,
    trades:
      hit === null
        ? []
        : hit.trades
            .map((tradeId) => record.bundle.graded.find((one) => one.trade.id === tradeId) ?? null)
            .filter((one) => one !== null)
            .map(toSpine),
    detectorsRun: record.detectorsRun?.length ?? 0,
  };
}

export type GateBeat =
  | { ok: true; idea: Idea; check: IdeaCheck; items: number; checkedLine: string; mode: EngineMode }
  | { ok: false; problem: string; next: string; checkedLine: string; mode: EngineMode };

/** The size the gate form offers by default, so the page asks what a reader would ask. */
const STORY_NOTIONAL = 300;

/** The gate reads Bitget, so one answer serves every reader who arrives in the same five minutes. */
const GATE_HELD_MS = 5 * 60_000;

let gateHeld: { at: number; work: Promise<GateBeat> } | null = null;

/**
 * One idea held against the checklist this record earned, run through the same engine
 * helper the gate screen uses, so the page shows a verdict from the live market rather
 * than a stored one. A failure is carried through with what to do about it, because an
 * empty verdict would be indistinguishable from an idea that passed nothing.
 */
export async function readGate(record: ReviewRecord): Promise<GateBeat> {
  const now = Date.now();
  if (gateHeld !== null && now - gateHeld.at < GATE_HELD_MS) return await gateHeld.work;

  const work = runTheGate(record);
  gateHeld = { at: now, work };
  // A failed run is not worth holding for five minutes: Bitget being unreachable for one
  // second should not decide what the next reader sees.
  void work.then((beat) => {
    if (!beat.ok && gateHeld?.work === work) gateHeld = null;
  });
  return await work;
}

async function runTheGate(record: ReviewRecord): Promise<GateBeat> {
  const mode = engineMode();
  const choices = await symbolChoices(record.bundle);
  const first = choices.traded[0] ?? choices.universe[0] ?? null;

  if (first === null) {
    return {
      ok: false,
      problem: "this record names no instrument the gate could hold an idea against",
      next: "The review traded nothing and the engine's universe file was out of reach, so there is no symbol to check. Run the review again beside the engine and this beat fills itself.",
      checkedLine: checkedLine(Date.now()),
      mode,
    };
  }

  const idea: Idea = {
    category: first.category,
    symbol: first.symbol,
    side: "buy",
    notionalUsdt: STORY_NOTIONAL,
    note: null,
  };

  try {
    const check = await runGate({
      idea,
      items: record.bundle.checklist,
      state: deskState(record.bundle),
    });
    return {
      ok: true,
      idea,
      check,
      items: record.bundle.checklist.length,
      checkedLine: checkedLine(Date.now()),
      mode,
    };
  } catch (error) {
    const detail = error instanceof EngineError ? error.detail : (error as Error).message;
    return {
      ok: false,
      problem: error instanceof EngineError ? error.message : "the gate could not be run",
      next: `${detail}. Nothing was sent to Bitget. The same idea can be typed by hand on the gate screen, which runs the identical check.`,
      checkedLine: checkedLine(Date.now()),
      mode,
    };
  }
}

function checkedLine(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `checked at ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC, held for five minutes`;
}

export interface CheckBeat {
  question: string;
  answer: Answer;
  /** Null until a run of the answerer throws a draft away and the record keeps the line it wrote. */
  discarded: string | null;
  model: string | null;
}

/**
 * The honesty check, shown on a real answer.
 *
 * The answerer is handed no model on purpose, which is the path that proves the point:
 * the evidence table writes the paragraph itself, so every number in it came out of a row
 * and the uncited list is empty by construction.
 */
export async function readCheck(record: ReviewRecord): Promise<CheckBeat | null> {
  const worst = [...record.bundle.graded].sort((a, b) => a.scores.total - b.scores.total)[0];
  if (worst === undefined) return null;

  const question = `why did this account lose on ${ticker(worst.trade.symbol)}?`;
  return {
    question,
    answer: await answerQuestion(record.bundle, question, null),
    discarded: null,
    model: null,
  };
}

/** Where the night watch answers. One env var, because the two sites deploy apart. */
export function kaavalUrl(): string {
  const raw = process.env.KAAVAL_URL;
  return raw === undefined || raw.trim() === ""
    ? "https://kaaval-agent.vercel.app"
    : raw.trim().replace(/\/+$/, "");
}

function etParts(ts: number, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat("en-US", { timeZone: ET_ZONE, ...options }).formatToParts(
    new Date(ts),
  );
}

function partOf(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

/** Minutes since midnight on a New York clock, which is how the earliest entry is picked. */
function etMinutes(ts: number): number {
  const parts = etParts(ts, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return Number(partOf(parts, "hour")) * 60 + Number(partOf(parts, "minute"));
}

function etClock(ts: number): { time: string; meridiem: string } {
  const parts = etParts(ts, { hour: "numeric", minute: "2-digit", hour12: true });
  return {
    time: `${partOf(parts, "hour")}:${partOf(parts, "minute")}`,
    meridiem: partOf(parts, "dayPeriod").toLowerCase() === "pm" ? "p.m." : "a.m.",
  };
}

function etDay(ts: number): string {
  const parts = etParts(ts, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  return `${partOf(parts, "weekday")} ${partOf(parts, "day")} ${partOf(parts, "month")} ${partOf(parts, "year")} new york`.toUpperCase();
}
