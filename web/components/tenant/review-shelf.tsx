"use client";

// Copied from web/components/shelf.tsx on 2026-09-14; edit there first. The one difference
// is where a spine leads: a trade on a trader's own shelf opens beside that shelf rather
// than on the published record's own page.

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { getLenis } from "@/components/smooth-scroll";
import type { Spine } from "@/lib/desk";
import { GRADE_COLOR } from "@/lib/grades";

/** Where the stack stands at the top of the track, and where it stands at the bottom. */
const DESKTOP = { tilt: [58, 13], turn: [-13, -2], gap: [66, 112], lift: [0, -76] };
const NARROW = { tilt: [50, 12], turn: [-6, -1.2], gap: [56, 80], lift: [0, -60] };
const MOBILE = { tilt: [18, 9], turn: [-4, -1.5], gap: [62, 74], lift: [8, -10] };

/** Below this the turn has to come in, above it the full desktop stack fits. */
const WIDE_PX = 1366;
const SIDE_PX = 768;

const ENTER = { duration: 0.95, ease: [0.16, 1, 0.3, 1] as const };

export function ReviewShelf({
  spines,
  hrefFor,
  className = "",
}: {
  spines: Spine[];
  hrefFor: (id: string) => string;
  className?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const stage = stageRef.current;
    const rig = rigRef.current;
    if (!stage || !rig) return;

    const track = stage.closest<HTMLElement>("[data-shelf-track]") ?? stage;
    let frame = 0;
    let last = -1;

    const step = () => {
      frame = requestAnimationFrame(step);
      const travel = track.offsetHeight - window.innerHeight;
      const scrolled = (getLenis()?.scroll ?? window.scrollY) - track.offsetTop;
      const p = travel <= 0 ? 0 : Math.min(1, Math.max(0, scrolled / travel));
      if (Math.abs(p - last) < 0.0004) return;
      last = p;

      const set = layout();
      rig.style.setProperty("--shelf-tilt", `${mix(set.tilt, p)}deg`);
      rig.style.setProperty("--shelf-turn", `${mix(set.turn, p)}deg`);
      rig.style.setProperty("--spine-gap", `${mix(set.gap, p)}px`);
      rig.style.setProperty("--shelf-lift", `${mix(set.lift, p)}px`);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  return (
    <div ref={stageRef} className={`shelf-stage ${className}`}>
      <div ref={rigRef} className="shelf-rig" style={{ ["--n" as string]: spines.length }}>
        {spines.map((spine, i) => (
          <div
            key={spine.id}
            className="spine-slot"
            style={{ ["--i" as string]: i, ["--z" as string]: spines.length - 1 - i }}
          >
            <motion.div
              className="spine"
              data-spine={spine.id}
              style={{ ["--grade" as string]: GRADE_COLOR[spine.letter] }}
              initial={{ opacity: 0, y: 46 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { ...ENTER, delay: 0.2 + i * 0.04 }}
              whileHover={
                reduced
                  ? undefined
                  : { y: -8, filter: "brightness(1.18)", transition: { duration: 0.28, ease: "easeOut" } }
              }
            >
              <Link
                href={hrefFor(spine.id)}
                aria-label={`${spine.ticker} ${spine.side}, graded ${spine.letter}, ${spine.total.toFixed(1)} of 100`}
                className="absolute inset-0 z-10"
              />
              <div className="grid h-full grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 font-mono text-[9px] uppercase tracking-[0.12em] text-bone/80 md:gap-4 md:px-5 md:text-[11px] md:tracking-[0.16em]">
                <span className="truncate">
                  {spine.ticker}
                  <span className="hidden text-bone/35 md:inline">{spine.quote}</span>
                  <span className="ml-1.5 text-bone/45 md:ml-2">{spine.side}</span>
                </span>
                <span className="justify-self-center whitespace-nowrap">
                  <span
                    className="text-[13px] font-medium tracking-[0.1em] md:text-[14px]"
                    style={{ color: GRADE_COLOR[spine.letter] }}
                  >
                    {spine.letter}
                  </span>
                  <span className="ml-2 text-bone/60">{spine.total.toFixed(1)}</span>
                </span>
                <span className="justify-self-end whitespace-nowrap text-bone/45">
                  {spine.entryLabel}
                  <span className="mx-1 text-bone/25 md:mx-1.5">&rarr;</span>
                  <span className={spine.open ? "text-bone/70" : ""}>{spine.exitLabel}</span>
                </span>
              </div>
            </motion.div>
          </div>
        ))}
      </div>

      {spines.length < 3 ? (
        <p className="absolute bottom-6 right-6 max-w-[24ch] text-right font-mono text-[10px] uppercase leading-relaxed tracking-[0.16em] text-bone/40">
          this review found {spines.length} {spines.length === 1 ? "round trip" : "round trips"} in
          your last 90 days
        </p>
      ) : null}
    </div>
  );
}

function layout(): typeof DESKTOP {
  if (window.matchMedia(`(min-width: ${WIDE_PX}px)`).matches) return DESKTOP;
  return window.matchMedia(`(min-width: ${SIDE_PX}px)`).matches ? NARROW : MOBILE;
}

function mix(range: number[], p: number): number {
  const from = range[0] as number;
  const to = range[1] as number;
  return Math.round((from + (to - from) * ease(p)) * 100) / 100;
}

/** Ease the walk so the shelf settles rather than snapping at either end of the track. */
function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}
