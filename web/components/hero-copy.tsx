"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import type { Desk } from "@/lib/desk";

const RISE = {
  initial: { opacity: 0, y: 26 },
  animate: { opacity: 1, y: 0 },
};

const EASE = [0.16, 1, 0.3, 1] as const;

export function HeroTitle({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <div className={className}>
      <div
        aria-hidden
        className="pointer-events-none absolute -left-[10vw] -top-[6vh] -z-10 h-[46vh] w-[62vw] bg-[radial-gradient(55%_52%_at_34%_50%,rgba(10,8,6,0.92)_0%,rgba(10,8,6,0)_100%)] blur-2xl"
      />
      <motion.h1
        initial={RISE.initial}
        animate={RISE.animate}
        transition={reduced ? { duration: 0 } : { duration: 1.05, ease: EASE, delay: 0.18 }}
        className="font-display text-[clamp(2.75rem,7.2vw,6.75rem)] font-semibold leading-[0.9] tracking-[-0.035em] text-bone"
      >
        Read it back
        <span className="block font-light italic tracking-[-0.02em] text-bone/85">
          in daylight.
        </span>
      </motion.h1>
    </div>
  );
}

export function HeroFoot({ desk, className = "" }: { desk: Desk; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={RISE.initial}
      animate={RISE.animate}
      transition={reduced ? { duration: 0 } : { duration: 1.05, ease: EASE, delay: 0.55 }}
      className={className}
    >
      <p className="max-w-[34ch] font-body text-[1.05rem] font-light leading-[1.5] text-bone/75 md:text-[1.15rem]">
        Every trade you made, graded on process, not luck.
      </p>

      <dl className="mt-7 space-y-1.5 font-mono text-[10px] uppercase leading-relaxed tracking-[0.16em] text-bone/45 md:text-[11px]">
        <div className="flex items-center gap-2.5">
          <LiveDot live={desk.live} reduced={reduced === true} />
          <dt className="sr-only">source</dt>
          <dd>{desk.sourceLine}</dd>
        </div>
        <div>
          <dt className="sr-only">range</dt>
          <dd>
            {desk.rangeLine}
            <span className="mx-2 text-bone/25">&middot;</span>
            {desk.countLine}
          </dd>
        </div>
        <div>
          <dt className="sr-only">record check</dt>
          <dd className={desk.live ? "" : "text-bone/70"}>{desk.verificationLine}</dd>
        </div>
      </dl>
    </motion.div>
  );
}

/**
 * The two things a first-time reader can do with the shelf: hand over their own record,
 * or read the one already on the page. They enter after the shelf and the headline have
 * settled, so the first screen is the object and the words before it is a choice.
 */
export function HeroActions({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={RISE.initial}
      animate={RISE.animate}
      transition={reduced ? { duration: 0 } : { duration: 1.05, ease: EASE, delay: 0.75 }}
      className={`flex flex-wrap items-center gap-3.5 ${className}`}
    >
      <Link
        href="/connect"
        className="group inline-flex items-center gap-3 rounded-[8px] border border-bone/30 px-6 py-3.5 font-mono text-[10px] uppercase tracking-[0.2em] text-bone transition-colors duration-500 hover:border-bone hover:bg-bone hover:text-ground md:text-[11px]"
      >
        review my trades
        <span
          aria-hidden
          className="inline-block transition-transform duration-500 group-hover:translate-x-1"
        >
          &rarr;
        </span>
      </Link>
      <a
        href="#one-trade"
        className="group inline-flex items-center gap-3 rounded-[8px] border border-transparent px-6 py-3.5 font-mono text-[10px] uppercase tracking-[0.2em] text-bone/50 transition-colors duration-500 hover:border-bone/25 hover:text-bone md:text-[11px]"
      >
        see a review
        <span
          aria-hidden
          className="inline-block transition-transform duration-500 group-hover:translate-y-0.5"
        >
          &darr;
        </span>
      </a>
    </motion.div>
  );
}

/**
 * The record is live, so the dot breathes. The ring is always in the markup and only its
 * animation is dropped for a visitor who asked for less motion: markup that depends on a
 * browser preference cannot match what the server rendered.
 */
function LiveDot({ live, reduced }: { live: boolean; reduced: boolean }) {
  if (!live) return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-bone/30" />;
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0">
      <motion.span
        className="absolute inset-0 rounded-full bg-dawn"
        animate={reduced ? { scale: 1, opacity: 0 } : { scale: [1, 2.8, 2.8], opacity: [0.55, 0, 0] }}
        transition={reduced ? { duration: 0 } : { duration: 2.6, repeat: Infinity, ease: "easeOut" }}
      />
      <span className="relative h-1.5 w-1.5 rounded-full bg-dawn" />
    </span>
  );
}
