"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";

export function Wordmark() {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      className="fixed left-6 top-6 z-40 md:left-[4vw] md:top-[3vh]"
    >
      <Link href="/" className="group block">
        <span className="block font-display text-[1.6rem] leading-[0.95] font-semibold tracking-[-0.03em] text-bone transition-opacity duration-500 group-hover:opacity-80 md:text-[1.9rem]">
          Vidiyal
        </span>
        <span className="mt-1 block font-display text-[0.82rem] font-light italic tracking-[0.01em] text-dawn transition-all duration-500 group-hover:tracking-[0.05em] md:text-[0.95rem]">
          the morning after the trade
        </span>
      </Link>
    </motion.div>
  );
}
