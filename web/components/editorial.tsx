"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The one entrance the desk uses: a short rise out of nothing, once, when the block
 * reaches the reader. Restraint is the house style, so nothing here scales or slides
 * sideways, and a visitor who asked for less motion simply gets the block.
 */
export function Rise({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? { opacity: 1 } : { opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-12% 0px -8% 0px" }}
      transition={reduced ? { duration: 0 } : { duration: 0.85, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`block font-mono text-[10px] uppercase tracking-[0.2em] text-bone/40 md:text-[11px] ${className}`}
    >
      {children}
    </span>
  );
}

export function Hairline({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`h-px w-full bg-bone/10 ${className}`} />;
}
