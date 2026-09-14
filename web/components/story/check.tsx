import { Rise } from "@/components/editorial";
import { BeatMark } from "@/components/story/beat";
import type { CheckBeat } from "@/lib/story";

/** The three lines that say what the check is, in the order it happens. */
const HOW = [
  "Your words pick the trades. Nothing outside this review is readable from here.",
  "Those trades build an evidence table, one row per fact, and every row carries the round trip it came from.",
  "The English is written from that table and checked back against it, number by number. A number no row holds throws the whole draft away and the table writes the paragraph instead.",
];

/**
 * Beat five. The honesty check, explained in three lines and then shown working on a real
 * question. The answerer is given no model here, which is the path where the evidence
 * table writes the paragraph itself, so the uncited list is empty because of how it was
 * built rather than because the page says so.
 */
export function Check({ check }: { check: CheckBeat | null }) {
  return (
    <section id="the-check" className="relative px-6 py-28 md:px-[5vw] md:py-40">
      <div className="grid gap-14 md:grid-cols-12 md:gap-x-10">
        <div className="md:col-span-4">
          <Rise>
            <BeatMark n="05">what stops it making things up</BeatMark>
            <h2 className="mt-7 max-w-[17ch] font-display text-[clamp(2.2rem,5.4vw,4.2rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-bone">
              Every number has
              <span className="block font-light italic text-bone/85">a trade behind it.</span>
            </h2>
          </Rise>

          <ol className="mt-10">
            {HOW.map((line, i) => (
              <Rise key={line} delay={i * 0.06}>
                <li className="flex gap-5 border-t border-bone/12 py-6">
                  <span className="font-mono text-[10px] tracking-[0.2em] text-bone/25 md:text-[11px]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="max-w-[44ch] font-body text-[1rem] font-light leading-[1.6] text-bone/75">
                    {line}
                  </p>
                </li>
              </Rise>
            ))}
            <li className="border-t border-bone/12" />
          </ol>
        </div>

        <div className="md:col-span-7 md:col-start-6">
          {check === null ? (
            <Rise>
              <p className="max-w-[50ch] font-body text-[1.05rem] font-light leading-[1.65] text-bone/70">
                This review holds no graded trade, so there is nothing to ask it about. The check
                still runs the moment there is.
              </p>
            </Rise>
          ) : (
            <Answer check={check} />
          )}
        </div>
      </div>
    </section>
  );
}

function Answer({ check }: { check: CheckBeat }) {
  const { answer } = check;
  const byRef = new Map<string, typeof answer.evidence>();
  for (const row of answer.evidence) {
    const rows = byRef.get(row.ref) ?? [];
    rows.push(row);
    byRef.set(row.ref, rows);
  }

  return (
    <div>
      <Rise>
        <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-bone/30 md:text-[11px]">
          asked of this record, answered from it
        </span>
        <p className="mt-5 max-w-[24ch] font-display text-[clamp(1.5rem,3.4vw,2.4rem)] font-light italic leading-[1.15] tracking-[-0.02em] text-bone">
          {check.question}
        </p>
        <p className="mt-8 max-w-[62ch] font-body text-[1.02rem] font-light leading-[1.7] text-bone/80">
          {answer.narrative}
        </p>
      </Rise>

      <Rise delay={0.06}>
        <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-5 border-t border-bone/12 pt-7 font-mono text-[11px] text-bone/65">
          <Fact label="numbers not in the evidence">
            {answer.uncitedNumbers.length === 0 ? "none" : answer.uncitedNumbers.join(", ")}
          </Fact>
          <Fact label="model">
            {check.model ?? "none, so the evidence table wrote this itself"}
          </Fact>
          <Fact label="rows behind the answer">{answer.evidence.length}</Fact>
        </dl>
        <p className="mt-6 max-w-[58ch] font-mono text-[10px] uppercase leading-[1.9] tracking-[0.16em] text-bone/35">
          {check.discarded === null
            ? "no draft has been thrown away on this record yet, so what the check does when one is thrown away is written above rather than shown"
            : check.discarded}
        </p>
      </Rise>

      <Rise delay={0.1}>
        <div className="mt-10">
          <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-bone/30 md:text-[11px]">
            the trades it cited
          </span>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] text-bone/70">
            {answer.citedRefs.length === 0 ? (
              <li className="text-bone/35">none: the answer used no fact from the table</li>
            ) : (
              answer.citedRefs.map((ref) => (
                <li key={ref} className="break-all">
                  {ref}
                </li>
              ))
            )}
          </ul>
        </div>
      </Rise>

      <Rise delay={0.14}>
        <div className="mt-12">
          <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-bone/30 md:text-[11px]">
            the evidence table, one row per fact
          </span>
          <div className="docs-scroll mt-5 max-h-[26rem] overflow-y-auto border-t border-bone/12">
            {[...byRef.entries()].map(([ref, rows]) => (
              <div key={ref} className="border-b border-bone/[0.07] py-5">
                <span className="block break-all font-mono text-[10px] uppercase tracking-[0.16em] text-bone/35">
                  {ref}
                </span>
                <dl className="mt-3 space-y-1.5">
                  {rows.map((row, i) => (
                    <div
                      key={`${row.fact}-${i}`}
                      className="grid gap-x-6 gap-y-0.5 font-mono text-[11px] leading-[1.7] md:grid-cols-[11rem_1fr]"
                    >
                      <dt className="text-bone/40">{row.fact}</dt>
                      <dd className="break-words text-bone/70">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      </Rise>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.18em] text-bone/30">{label}</dt>
      <dd className="mt-2">{children}</dd>
    </div>
  );
}
