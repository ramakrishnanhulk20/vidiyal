import type { ReactNode } from "react";

/**
 * The mark at the head of every beat: its number, a short rule, and what the beat is.
 * The rule is the same hairline the desk draws everywhere else, so the eight beats read
 * as one object rather than eight cards.
 */
export function BeatMark({
  n,
  children,
  className = "",
}: {
  n: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <span className="font-mono text-[10px] tracking-[0.22em] text-bone/30 md:text-[11px]">{n}</span>
      <span aria-hidden className="h-px w-8 bg-bone/15 md:w-12" />
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-bone/40 md:text-[11px]">
        {children}
      </span>
    </div>
  );
}
