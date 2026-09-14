"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef } from "react";
import { BeatMark } from "@/components/story/beat";
import { getLenis } from "@/components/smooth-scroll";
import { GRADE_COLOR } from "@/lib/grades";
import type { ScoresBeat } from "@/lib/story";

/** How much of a screen each score gets while the panel is held, and the tail the letter lands in. */
const STEP_SCREENS = 1;
const TAIL_SCREENS = 0.7;

/**
 * Beat three. The trade from beat two is held still while the page walks down it, one
 * score at a time, and the letter resolves last.
 *
 * The walk is published as one CSS variable on the panel and the rows read it in CSS, so
 * scrolling this section renders nothing in React. Narrow windows and a reader who asked
 * for less motion never pin at all: they get the same five rows, stacked, at rest.
 */
export function ScoresPinned({ scores, still = false }: { scores: ScoresBeat; still?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (still) return;
    const track = trackRef.current;
    const panel = panelRef.current;
    if (!track || !panel) return;

    gsap.registerPlugin(ScrollTrigger);

    // Lenis drives the page, so the trigger is told when the page has moved rather than
    // waiting for a scroll event the smooth scroller never fires.
    const lenis = getLenis();
    const update = () => ScrollTrigger.update();
    lenis?.on("scroll", update);

    const media = gsap.matchMedia();
    media.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
      panel.dataset.pinned = "true";
      const trigger = ScrollTrigger.create({
        trigger: track,
        start: "top top",
        end: () => `+=${window.innerHeight * (scores.rows.length * STEP_SCREENS + TAIL_SCREENS)}`,
        pin: panel,
        pinSpacing: true,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          panel.style.setProperty("--p", self.progress.toFixed(4));
        },
      });
      panel.style.setProperty("--p", trigger.progress.toFixed(4));

      return () => {
        delete panel.dataset.pinned;
        panel.style.removeProperty("--p");
      };
    });

    return () => {
      lenis?.off("scroll", update);
      media.revert();
    };
  }, [still, scores.rows.length]);

  const grade = GRADE_COLOR[scores.letter];

  return (
    <div ref={trackRef} className="relative">
      <div
        ref={panelRef}
        className="story-scores relative px-6 py-24 md:flex md:min-h-[100svh] md:items-center md:px-[5vw] md:py-0"
        style={{
          ["--n" as string]: scores.rows.length,
          ["--span" as string]: scores.rows.length * STEP_SCREENS + TAIL_SCREENS,
        }}
      >
        <div className="grid w-full gap-12 md:grid-cols-12 md:gap-x-10">
          <div className="md:col-span-4 md:pt-[8svh]">
            <BeatMark n="03">what the rubric read</BeatMark>
            <h2 className="mt-7 max-w-[11ch] font-display text-[clamp(2.2rem,5vw,3.8rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-bone">
              Five scores,
              <span className="block font-light italic text-bone/85">one trade.</span>
            </h2>
            <p className="mt-6 max-w-[34ch] font-mono text-[10px] uppercase leading-[1.9] tracking-[0.16em] text-bone/40 md:text-[11px]">
              {scores.entryLine}
              <span className="mx-2.5 text-bone/20">&middot;</span>
              round trip {scores.id}
            </p>

            <div className="story-letter mt-12 flex items-baseline gap-5 md:mt-[12svh]">
              <span
                className="font-display text-[clamp(3.5rem,9vw,7rem)] font-semibold leading-[0.72] tracking-[-0.05em]"
                style={{ color: grade }}
              >
                {scores.letter}
              </span>
              <span className="font-display text-[clamp(1.2rem,2.6vw,2rem)] font-light leading-none tracking-[-0.03em] text-bone/80">
                {scores.total.toFixed(1)}
                <span className="ml-1.5 font-mono text-[10px] tracking-[0.18em] text-bone/35">
                  /100
                </span>
              </span>
            </div>
            <p className="story-letter mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-bone/35">
              grade {scores.letter} is {scores.meaning}
            </p>
          </div>

          <div className="md:col-span-7 md:col-start-6">
            {scores.rows.map((row, i) => (
              <div
                key={row.key}
                className="story-score border-t border-bone/12 py-6 md:py-7"
                style={{ ["--i" as string]: i }}
              >
                <div className="flex items-baseline justify-between gap-6">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-bone/45 md:text-[11px]">
                    {row.label}
                  </span>
                  <span className="shrink-0 font-mono text-[13px] tracking-[0.08em] text-bone/70">
                    {row.value.toFixed(2)}
                    <span className="text-bone/30">/5</span>
                    <span className="ml-3 text-[10px] uppercase tracking-[0.18em] text-bone/25">
                      {row.weight} of 100
                    </span>
                  </span>
                </div>
                {row.lines.map((line) => (
                  <p
                    key={line}
                    className="mt-3 max-w-[58ch] font-body text-[1rem] font-light leading-[1.6] text-bone/80 [&+p]:mt-2"
                  >
                    {line}
                  </p>
                ))}
              </div>
            ))}
            <div className="border-t border-bone/12" />
          </div>
        </div>
      </div>
    </div>
  );
}
