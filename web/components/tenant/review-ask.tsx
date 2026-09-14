"use client";

// Copied from web/components/ask-desk.tsx on 2026-09-14; edit there first. The question
// goes with the signed-in trader's token, so it is answered from their own review, and a
// cited trade opens beside their own shelf.

import { usePrivy } from "@privy-io/react-auth";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useRef, useState } from "react";
import { reviewAskAction, type TenantAskOutcome } from "@/app/(tenant)/actions";
import { Label } from "@/components/editorial";
import { utcStamp } from "@/lib/format";
import { GRADE_COLOR } from "@/lib/grades";

export function ReviewAsk({
  reviewId,
  suggestions,
  refs,
  hrefFor,
}: {
  reviewId: string;
  suggestions: string[];
  refs: string[];
  hrefFor: (id: string) => string;
}) {
  const { getAccessToken } = usePrivy();
  const [outcome, setOutcome] = useState<TenantAskOutcome | null>(null);
  const [pending, setPending] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();

  const ask = async (question: string): Promise<void> => {
    setPending(true);
    setOutcome(null);

    const token = await getAccessToken();
    if (token === null) {
      setPending(false);
      setOutcome({
        ok: false,
        question,
        reason: "your sign-in has expired",
        next: "Sign out and in again, then ask it once more.",
      });
      return;
    }

    try {
      setOutcome(await reviewAskAction(token, reviewId, question));
    } catch {
      setOutcome({
        ok: false,
        question,
        reason: "the server could not be reached",
        next: "Your review is untouched. Check your connection and ask again.",
      });
    } finally {
      setPending(false);
    }
  };

  const put = (question: string) => {
    if (field.current) field.current.value = question;
    void ask(question);
  };

  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask(field.current?.value ?? "");
        }}
        className="mt-12"
      >
        <label htmlFor="tenant-question">
          <Label className="cursor-pointer">ask your own record</Label>
        </label>
        <input
          ref={field}
          id="tenant-question"
          name="question"
          type="text"
          maxLength={300}
          autoComplete="off"
          defaultValue=""
          placeholder={suggestions[0] ?? "what went wrong?"}
          className="mt-4 w-full border-b border-bone/25 bg-transparent pb-4 font-display text-[clamp(1.35rem,3.2vw,2.35rem)] font-light italic leading-[1.2] tracking-[-0.02em] text-bone caret-dawn outline-none transition-colors duration-300 placeholder:text-bone/25 hover:border-bone/45 focus:border-dawn"
        />

        <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-5">
          <button
            type="submit"
            disabled={pending}
            className="rounded-[8px] border border-bone/35 px-7 py-3.5 font-mono text-[11px] uppercase tracking-[0.2em] text-bone transition-colors duration-300 hover:border-bone hover:bg-bone hover:text-ground disabled:cursor-wait disabled:border-bone/20 disabled:text-bone/40 disabled:hover:bg-transparent"
          >
            {pending ? "reading your record" : "answer it"}
          </button>
          <span className="flex items-center gap-3 max-w-[44ch] font-mono text-[10px] uppercase leading-[1.8] tracking-[0.16em] text-bone/35">
            {pending ? (
              <>
                <span aria-hidden className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-dawn" />
                building the evidence table first, then the model writes only the English
              </>
            ) : (
              "every number in the answer is copied from a row of the evidence table"
            )}
          </span>
        </div>

        {suggestions.length > 0 ? (
          <div className="mt-12">
            <Label>what your record can answer</Label>
            <ul className="mt-4 flex flex-col gap-3">
              {suggestions.map((question) => (
                <li key={question}>
                  <button
                    type="button"
                    onClick={() => {
                      put(question);
                    }}
                    disabled={pending}
                    className="group text-left font-body text-[1.02rem] font-light leading-[1.5] text-bone/55 transition-colors duration-300 hover:text-bone disabled:opacity-40"
                  >
                    <span className="mr-3 font-mono text-[10px] uppercase tracking-[0.2em] text-bone/25 transition-colors duration-300 group-hover:text-dawn">
                      ask
                    </span>
                    {question}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </form>

      {outcome === null ? null : (
        <motion.article
          key={outcome.ok ? outcome.askedAt : outcome.question}
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="mt-20 md:mt-28"
          aria-live="polite"
        >
          {outcome.ok ? <Written outcome={outcome} refs={refs} hrefFor={hrefFor} /> : <Trouble outcome={outcome} />}
        </motion.article>
      )}
    </div>
  );
}

function Written({
  outcome,
  refs,
  hrefFor,
}: {
  outcome: Extract<TenantAskOutcome, { ok: true }>;
  refs: string[];
  hrefFor: (id: string) => string;
}) {
  const { answer, model, notes } = outcome;
  // The answerer throws a draft away for a number it invented or for a trade id it made
  // up, and only the first of those lands in the answer itself. Its own line is what this
  // reads, so both are said out loud instead of one being shown as a silent fallback.
  const thrown = notes.find((line) => line.includes("thrown away")) ?? null;
  const invented = answer.uncitedNumbers.length > 0;
  const discarded = invented || thrown !== null;

  return (
    <div>
      <div className="border-t border-bone/15 pt-10 md:grid md:grid-cols-12 md:gap-x-10">
        <div className="md:col-span-8">
          <h3 className="max-w-[24ch] font-display text-[clamp(1.7rem,4vw,3rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-bone">
            {answer.question}
          </h3>

          {discarded ? (
            <div className="mt-9 border-l-2 border-dawn pl-5">
              <Label className="text-dawn">the honesty check fired</Label>
              <p className="mt-3 max-w-[54ch] font-body text-[1rem] font-light leading-[1.6] text-bone/85">
                {invented
                  ? "The model wrote a number that no row of the evidence table holds, so its draft was thrown away and the table wrote the paragraph below instead. The numbers it invented:"
                  : "The model's draft did not survive the check against the evidence, so the table wrote the paragraph below instead. The answerer's own words for why:"}
              </p>
              <p className="mt-3 max-w-[54ch] font-mono text-[12px] leading-[1.7] text-dawn">
                {invented ? answer.uncitedNumbers.join("  ") : (thrown as string).replace(/^ask: /, "")}
              </p>
            </div>
          ) : null}

          <div className="mt-9 space-y-5">
            {answer.narrative.split(/(?<=\.)\s+(?=[A-Z])/).map((sentence, i) => (
              <p
                key={`${String(i)}-${sentence.slice(0, 24)}`}
                className="max-w-[64ch] font-body text-[1.12rem] font-light leading-[1.62] text-bone/85"
              >
                <Cited text={sentence} known={refs} hrefFor={hrefFor} />
              </p>
            ))}
          </div>

          {answer.citedRefs.length > 0 ? (
            <div className="mt-10">
              <Label>the trades it cited</Label>
              <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                {answer.citedRefs.map((ref) => (
                  <li key={ref}>
                    <RefLink ref_={ref} known={refs} hrefFor={hrefFor} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <aside className="mt-12 md:col-span-4 md:mt-0">
          <dl className="space-y-6 border-t border-bone/12 pt-7 font-mono text-[11px] text-bone/55 md:border-t-0 md:pt-0">
            <Fact label="the model asked">
              {model === null ? "none, so the evidence table wrote this itself" : model}
            </Fact>
            {model === null ? null : (
              <Fact label="its draft">
                <span style={{ color: discarded ? "var(--color-dawn)" : GRADE_COLOR.A }}>
                  {discarded ? "thrown away, the table answered instead" : "kept, every number checked"}
                </span>
              </Fact>
            )}
            <Fact label="numbers not in the evidence">
              <span style={{ color: invented ? "var(--color-dawn)" : GRADE_COLOR.A }}>
                {invented ? answer.uncitedNumbers.join(", ") : "none"}
              </span>
            </Fact>
            <Fact label="rows behind the answer">{answer.evidence.length}</Fact>
            <Fact label="asked">{utcStamp(outcome.askedAt)}</Fact>
          </dl>
        </aside>
      </div>

      <section className="mt-16 md:mt-24">
        <Label>the evidence table, one row per fact</Label>
        <table className="mt-7 hidden w-full border-collapse text-left font-mono text-[11.5px] md:table">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.2em] text-bone/35">
              <th className="w-[18%] border-b border-bone/15 pb-3 pr-6 font-normal">ref</th>
              <th className="w-[22%] border-b border-bone/15 pb-3 pr-6 font-normal">fact</th>
              <th className="border-b border-bone/15 pb-3 font-normal">value</th>
            </tr>
          </thead>
          <tbody className="text-bone/70">
            {answer.evidence.map((row, i) => {
              const first = i === 0 || answer.evidence[i - 1]?.ref !== row.ref;
              return (
                <tr key={`${row.ref}-${row.fact}-${String(i)}`} className="transition-colors duration-300 hover:bg-bone/[0.04]">
                  <td className={`py-3 pr-6 align-top ${first ? "border-t border-bone/10" : ""}`}>
                    {first ? <RefLink ref_={row.ref} known={refs} hrefFor={hrefFor} /> : null}
                  </td>
                  <td className={`py-3 pr-6 align-top text-bone/45 ${first ? "border-t border-bone/10" : ""}`}>
                    {row.fact}
                  </td>
                  <td className={`py-3 align-top ${first ? "border-t border-bone/10" : ""}`}>{row.value}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <ul className="mt-7 md:hidden">
          {answer.evidence.map((row, i) => (
            <li key={`${row.ref}-${row.fact}-${String(i)}`} className="border-t border-bone/12 py-5 font-mono text-[11px]">
              <RefLink ref_={row.ref} known={refs} hrefFor={hrefFor} />
              <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-bone/35">{row.fact}</p>
              <p className="mt-1 break-words text-bone/70">{row.value}</p>
            </li>
          ))}
          <li className="border-t border-bone/12" />
        </ul>
      </section>
    </div>
  );
}

function Trouble({ outcome }: { outcome: Extract<TenantAskOutcome, { ok: false }> }) {
  return (
    <div className="border-t pt-10" style={{ borderColor: `${GRADE_COLOR.E}40` }}>
      <span
        className="block font-mono text-[10px] uppercase tracking-[0.2em] md:text-[11px]"
        style={{ color: GRADE_COLOR.E }}
      >
        no answer was written
      </span>
      <h3 className="mt-5 max-w-[24ch] font-display text-[clamp(1.6rem,3.6vw,2.6rem)] font-light italic leading-[1.1] tracking-[-0.02em] text-bone">
        {outcome.reason}
      </h3>
      <p className="mt-6 max-w-[58ch] font-body text-[1.05rem] font-light leading-[1.65] text-bone/70">
        {outcome.next}
      </p>
    </div>
  );
}

/** The refs the answerer writes in square brackets, turned back into the trades they name. */
function Cited({
  text,
  known,
  hrefFor,
}: {
  text: string;
  known: string[];
  hrefFor: (id: string) => string;
}) {
  return (
    <>
      {text.split(/(\[[^\]]+\])/).map((part, i) => {
        const mark = /^\[([^\]]+)\]$/.exec(part);
        if (!mark) return <span key={i}>{part}</span>;
        return (
          <span key={i} className="whitespace-nowrap">
            {" "}
            <RefLink ref_={(mark[1] as string).trim()} known={known} hrefFor={hrefFor} small />
          </span>
        );
      })}
    </>
  );
}

function RefLink({
  ref_,
  known,
  hrefFor,
  small = false,
}: {
  ref_: string;
  known: string[];
  hrefFor: (id: string) => string;
  small?: boolean;
}) {
  const size = small ? "text-[10px]" : "text-[11px]";
  if (!known.includes(ref_)) {
    return <span className={`font-mono ${size} text-bone/35`}>[{ref_}]</span>;
  }
  return (
    <Link
      href={hrefFor(ref_)}
      className={`font-mono ${size} text-bone/50 underline decoration-bone/25 underline-offset-4 transition-colors duration-300 hover:text-dawn hover:decoration-dawn`}
    >
      {ref_}
    </Link>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.18em] text-bone/30">{label}</dt>
      <dd className="mt-2 leading-[1.7]">{children}</dd>
    </div>
  );
}
