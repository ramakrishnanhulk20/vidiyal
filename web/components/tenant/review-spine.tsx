"use client";

// Copied from web/components/mini-spine.tsx on 2026-09-14; edit there first. The only
// difference is that the link is handed in, because a trade on a trader's own shelf opens
// beside that shelf.

import Link from "next/link";
import type { Spine } from "@/lib/desk";
import { GRADE_COLOR } from "@/lib/grades";

export function ReviewSpine({ spine, href, className = "" }: { spine: Spine; href: string; className?: string }) {
  return (
    <Link
      href={href}
      className={`group block ${className}`}
      aria-label={`${spine.ticker} ${spine.side}, graded ${spine.letter}`}
    >
      <div
        className="spine transition-[transform,filter] duration-300 ease-out group-hover:-translate-y-1 group-hover:brightness-125"
        style={{ ["--grade" as string]: GRADE_COLOR[spine.letter], ["--spine-h" as string]: "42px" }}
      >
        <div className="grid h-full grid-cols-[1fr_auto] items-center gap-3 px-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-bone/75">
          <span className="truncate">
            {spine.ticker}
            <span className="ml-1.5 text-bone/40">{spine.side}</span>
          </span>
          <span className="whitespace-nowrap">
            <span className="font-medium" style={{ color: GRADE_COLOR[spine.letter] }}>
              {spine.letter}
            </span>
            <span className="ml-2 text-bone/55">{spine.total.toFixed(1)}</span>
            <span className="ml-2.5 text-bone/30">{spine.entryLabel}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
