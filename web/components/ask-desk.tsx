"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useActionState, useRef } from "react";
import { askDesk, type AskOutcome } from "@/app/ask/actions";
import { Label } from "@/components/editorial";
import { utcStamp } from "@/lib/format";
import { GRADE_COLOR } from "@/lib/grades";
import { tradeHref } from "@/lib/trade";

export function AskDesk({ suggestions, refs }: { suggestions: string[]; refs: string[] }) {
  const [outcome, ask, pending] = useActionState<AskOutcome | null, FormData>(askDesk, null);
  const field = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const reduced = useReducedMotion();

  const put = (question: string) => {
    if (!field.current || !form.current) return;
    field.current.value = question;
    form.current.requestSubmit();
  };

  return (
    <div>
      <form ref={form} action={ask} className="mt-14 md:mt-20">
        <label htmlFor="question">
          <Label className="cursor-pointer">ask the record</Label>
        </label>
        <input
          ref={field}
          id="question"
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
            {pending ? "reading the record" : "answer it"}
          </button>
          <span className="max-w-[42ch] font-mono text-[10px] uppercase leading-[1.8] tracking-[0.16em] text-bone/35">
            {pending
              ? "reading the record, about ten seconds: the evidence table is built first, then the model writes only the English"
              : "every number in the answer is copied from a row of the evidence table"}
          </span>
        </div>

        {suggestions.length > 0 ? (
          <div className="mt-12">
            <Label>what this record can answer</Label>
            <ul className="mt-4 flex flex-col gap-3">
              {suggestions.map((question) => (
                <li key={question}>
                  <button
                    type="button"
                    onClick={() => put(question)}
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
          className="mt-24 md:mt-36"
          aria-live="polite"
        >
          {outcome.ok ? <Written outcome={outcome} refs={refs} /> : <Trouble outcome={outcome} />}
        </motion.article>
      )}
    </div>
  );
}

function Written({
  outcome,
  refs,
}: {
  outcome: Extract<AskOutcome, { ok: true }>;
  refs: string[];
}) {
  const { answer, model, notes } = outcome.result;
  // The answerer throws a draft away for a number it invented or for a trade id it made
  // up, and only the first of those lands in the answer itself. Its own line is what the
  // page reads, so both are said out loud instead of one being shown as a silent fallback.
  const thrown = notes.find((line) => line.includes("thrown away")) ?? null;
  const invented = answer.uncitedNumbers.length > 0;
  const discarded = invented || thrown !== null;
  const byRef = new Map<string, typeof answer.evidence>();
  for (const row of answer.evidence) {
    const held = byRef.get(row.ref) ?? [];
    held.push(row);
    byRef.set(row.ref, held);
  }

  return (
    <div>
      <div className="border-t border-bone/15 pt-10 md:grid md:grid-cols-12 md:gap-x-10">
        <div className="md:col-span-8">
          <h2 className="max-w-[24ch] font-display text-[clamp(1.7rem,4vw,3rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-bone">
            {answer.question}
          </h2>

          {discarded ? (
            <div className="mt-9 border-l-2 pl-5" style={{ borderColor: "var(--color-dawn)" }}>
              <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-dawn md:text-[11px]">
                the honesty check fired
              </span>
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
                key={`${i}-${sentence.slice(0, 24)}`}
                className="max-w-[64ch] font-body text-[1.12rem] font-light leading-[1.62] text-bone/85"
              >
                <Cited text={sentence} known={refs} />
              </p>
            ))}
          </div>

          {answer.citedRefs.length > 0 ? (
            <div className="mt-10">
              <Label>the trades it cited</Label>
              <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                {answer.citedRefs.map((ref) => (
                  <li key={ref}>
                    <RefLink ref_={ref} known={refs} />
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

      <section className="mt-20 md:mt-28">
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
                <tr
                  key={`${row.ref}-${row.fact}-${i}`}
                  className="transition-colors duration-300 hover:bg-bone/[0.04]"
                >
                  <td className={`py-3 pr-6 align-top ${first ? "border-t border-bone/10" : ""}`}>
                    {first ? <RefLink ref_={row.ref} known={refs} /> : null}
                  </td>
                  <td
                    className={`py-3 pr-6 align-top text-bone/45 ${first ? "border-t border-bone/10" : ""}`}
                  >
                    {row.fact}
                  </td>
                  <td className={`py-3 align-top ${first ? "border-t border-bone/10" : ""}`}>
                    {row.value}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-7 md:hidden">
          {[...byRef.entries()].map(([ref, rows]) => (
            <div key={ref} className="border-t border-bone/12 py-6">
              <RefLink ref_={ref} known={refs} />
              <dl className="mt-4 space-y-3 font-mono text-[11px]">
                {rows.map((row, i) => (
                  <div key={`${row.fact}-${i}`}>
                    <dt className="text-[10px] uppercase tracking-[0.16em] text-bone/35">
                      {row.fact}
                    </dt>
                    <dd className="mt-1 break-words text-bone/70">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          <div className="border-t border-bone/12" />
        </div>
      </section>
    </div>
  );
}

function Trouble({ outcome }: { outcome: Extract<AskOutcome, { ok: false }> }) {
  return (
    <div className="border-t pt-10" style={{ borderColor: `${GRADE_COLOR.E}40` }}>
      <span
        className="block font-mono text-[10px] uppercase tracking-[0.2em] md:text-[11px]"
        style={{ color: GRADE_COLOR.E }}
      >
        no answer was written
      </span>
      <h2 className="mt-5 max-w-[24ch] font-display text-[clamp(1.6rem,3.6vw,2.6rem)] font-light italic leading-[1.1] tracking-[-0.02em] text-bone">
        {outcome.problem}
      </h2>
      <p className="mt-6 max-w-[58ch] font-body text-[1.05rem] font-light leading-[1.65] text-bone/70">
        {outcome.next}
      </p>
    </div>
  );
}

/** The refs the answerer writes in square brackets, turned back into the trades they name. */
function Cited({ text, known }: { text: string; known: string[] }) {
  return (
    <>
      {text.split(/(\[[^\]]+\])/).map((part, i) => {
        const mark = /^\[([^\]]+)\]$/.exec(part);
        if (!mark) return <span key={i}>{part}</span>;
        return (
          <span key={i} className="whitespace-nowrap">
            {" "}
            <RefLink ref_={(mark[1] as string).trim()} known={known} small />
          </span>
        );
      })}
    </>
  );
}

function RefLink({ ref_, known, small = false }: { ref_: string; known: string[]; small?: boolean }) {
  const size = small ? "text-[10px]" : "text-[11px]";
  if (!known.includes(ref_)) {
    return <span className={`font-mono ${size} text-bone/35`}>[{ref_}]</span>;
  }
  return (
    <Link
      href={tradeHref(ref_)}
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
