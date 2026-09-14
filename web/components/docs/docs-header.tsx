"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { DocsSearch } from "@/components/docs/docs-search";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The row the docs sit under. The wordmark that links back to the shelf is the desk's
 * own, fixed at the top left of every page, so this row carries the spine mark instead
 * of a second copy of it.
 */
export function DocsHeader() {
  const reduced = useReducedMotion() ?? false;

  return (
    <motion.div
      initial={reduced ? { opacity: 1 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.8, ease: EASE, delay: 0.15 }}
      className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5 border-b border-bone/10 pb-6"
    >
      <span className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-bone/50 md:text-[11px]">
        <span aria-hidden className="block h-3.5 w-[3px] rounded-[1px] bg-dawn" />
        documentation
      </span>

      <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
        <DocsSearch />
        <Link
          href="/"
          className="group inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-bone/45 transition-colors duration-500 hover:text-dawn"
        >
          <span
            aria-hidden
            className="inline-block transition-transform duration-500 group-hover:-translate-x-1"
          >
            &larr;
          </span>
          back to the shelf
        </Link>
      </div>
    </motion.div>
  );
}
