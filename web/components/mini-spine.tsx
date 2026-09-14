import Link from "next/link";
import type { Spine } from "@/lib/desk";
import { GRADE_COLOR } from "@/lib/grades";
import { tradeHref } from "@/lib/trade";

/**
 * The same object as the shelf, off its stack and laid flat. The spine is the one motif
 * the desk repeats, so a trade named by a pattern or a question is still the book the
 * reader saw on the shelf, never a link in a list.
 */
export function MiniSpine({ spine, className = "" }: { spine: Spine; className?: string }) {
  return (
    <Link
      href={tradeHref(spine.id)}
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
