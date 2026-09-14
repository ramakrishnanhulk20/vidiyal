"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * The one line that ties beat four together: a habit, the item it became, and the verdict
 * on a live idea are three things, and the page says they are one thing by drawing a rule
 * through all three as the reader arrives.
 */
export function DrawnRule({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      initial={reduced ? { scaleY: 1 } : { scaleY: 0 }}
      whileInView={{ scaleY: 1 }}
      viewport={{ once: true, margin: "-10% 0px -20% 0px" }}
      transition={reduced ? { duration: 0 } : { duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
      style={{ originY: 0 }}
      className={`w-px origin-top bg-gradient-to-b from-dawn/70 via-bone/20 to-bone/[0.06] ${className}`}
    />
  );
}

/** The point on the rule where one of the three steps sits. */
export function RuleDot({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      initial={reduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
      transition={reduced ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
      className={`absolute h-1.5 w-1.5 rounded-full bg-bone/50 ${className}`}
    />
  );
}
