import Link from "next/link";
import type { ReactNode } from "react";
import { Rise } from "@/components/editorial";
import { MiniSpine } from "@/components/mini-spine";
import { BeatMark } from "@/components/story/beat";
import { DrawnRule, RuleDot } from "@/components/story/drawn-rule";
import type { LessonBeat } from "@/lib/story";

/**
 * Beat four. A habit the detectors found, the checklist item the record earned from it,
 * and the verdict that item gives a live idea, drawn as one line down the page because
 * they are one thing happening in three places.
 */
export function Lesson({ lesson, verdict }: { lesson: LessonBeat; verdict: ReactNode }) {
  return (
    <section id="the-lesson" className="relative px-6 py-28 md:px-[5vw] md:py-40">
      <Rise>
        <BeatMark n="04">from a habit to a rule to a verdict</BeatMark>
        <h2 className="mt-7 max-w-[13ch] font-display text-[clamp(2.2rem,5.4vw,4.2rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-bone">
          The same mistake,
          <span className="block font-light italic text-bone/85">twice.</span>
        </h2>
      </Rise>

      <div className="relative mt-16 pl-8 md:mt-24 md:pl-[7vw]">
        <DrawnRule className="absolute left-0 top-1 h-[calc(100%-0.25rem)]" />

        <Step>
          <Label>what the detector found</Label>
          {lesson.pattern === null ? (
            <>
              <h3 className="mt-4 max-w-[20ch] font-display text-[clamp(1.6rem,3.6vw,2.6rem)] font-light italic leading-[1.1] tracking-[-0.02em] text-bone/90">
                Nothing repeated itself in this record.
              </h3>
              <p className="mt-6 max-w-[52ch] font-body text-[1.05rem] font-light leading-[1.65] text-bone/70">
                All {lesson.detectorsRun} detectors ran over the whole trade table and none of them
                fired. An empty step here is a result, not a gap.
              </p>
            </>
          ) : (
            <>
              <h3 className="mt-4 font-display text-[clamp(2rem,4.6vw,3.4rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-bone">
                {lesson.title}
              </h3>
              <p className="mt-5 max-w-[44ch] font-body text-[1.1rem] font-light leading-[1.55] text-bone/85">
                {lesson.pattern.description}
              </p>
              <ul className="mt-7 space-y-3 border-l border-bone/15 pl-5">
                {lesson.pattern.evidence.map((line) => (
                  <li
                    key={line}
                    className="max-w-[52ch] font-body text-[0.98rem] font-light leading-[1.6] text-bone/65"
                  >
                    {line}
                  </li>
                ))}
              </ul>

              <p className="mt-9 font-mono text-[10px] uppercase tracking-[0.2em] text-bone/30 md:text-[11px]">
                the {lesson.trades.length} {lesson.trades.length === 1 ? "trade" : "trades"} behind it
              </p>
              <ul className="mt-4 grid max-w-[44rem] gap-2.5 sm:grid-cols-2">
                {lesson.trades.map((spine) => (
                  <li key={spine.id}>
                    <MiniSpine spine={spine} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Step>

        <Step className="mt-20 md:mt-28">
          <Label>the item it became</Label>
          {lesson.item === null ? (
            <p className="mt-4 max-w-[50ch] font-body text-[1.05rem] font-light leading-[1.65] text-bone/70">
              No habit fired, so the record earned no item. The gate still runs, and it will say
              exactly that.
            </p>
          ) : (
            <>
              <h3 className="mt-4 max-w-[24ch] font-display text-[clamp(1.5rem,3.4vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-bone">
                {lesson.item.text}
              </h3>
              <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.16em] text-bone/40">
                the test the gate runs
                <span className="mx-2.5 text-bone/20">&middot;</span>
                <span className="normal-case tracking-[0.04em] text-bone/70">{lesson.item.test}</span>
              </p>
              <Link
                href="/checklist"
                className="group mt-7 inline-flex items-baseline gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-bone/45 transition-colors duration-500 hover:text-dawn md:text-[11px]"
              >
                the whole list this record earned
                <span
                  aria-hidden
                  className="inline-block transition-transform duration-500 group-hover:translate-x-1"
                >
                  &rarr;
                </span>
              </Link>
            </>
          )}
        </Step>

        <Step className="mt-20 md:mt-28">
          <Label>what it says about the next order</Label>
          <div className="mt-4">{verdict}</div>
        </Step>
      </div>
    </section>
  );
}

function Step({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <Rise className={`relative ${className}`}>
      <RuleDot className="-left-8 top-1.5 md:-left-[7vw]" />
      {children}
    </Rise>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="block font-mono text-[10px] uppercase tracking-[0.22em] text-bone/30 md:text-[11px]">
      {children}
    </span>
  );
}
