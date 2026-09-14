import Link from "next/link";
import { Rise } from "@/components/editorial";
import { BeatMark } from "@/components/story/beat";

/**
 * Beat six. The only thing the page asks anyone to do, and the three facts about the key
 * that decide whether they will do it: one read to verify it, sealed after that, read
 * only from then on.
 */
export function Invitation() {
  return (
    <section id="review-your-own" className="relative px-6 py-28 md:px-[5vw] md:py-40">
      <div
        aria-hidden
        className="pointer-events-none absolute left-[6vw] top-[18%] -z-10 h-[46vh] w-[70vw] bg-[radial-gradient(50%_50%_at_40%_50%,rgba(86,60,44,0.45)_0%,rgba(20,16,13,0)_100%)] blur-2xl"
      />

      <div className="grid gap-12 md:grid-cols-12 md:gap-x-10">
        <div className="md:col-span-7 md:col-start-2">
          <Rise>
            <BeatMark n="06">your own record, on the same shelf</BeatMark>
            <h2 className="mt-7 max-w-[9ch] font-display text-[clamp(2.6rem,8vw,6.5rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-bone">
              Review
              <span className="block font-light italic text-bone/85">your own.</span>
            </h2>
          </Rise>
        </div>

        <div className="md:col-span-5 md:col-start-8 md:pt-[14svh]">
          <Rise delay={0.08}>
            <p className="max-w-[38ch] font-body text-[1.1rem] font-light leading-[1.6] text-bone/80 md:text-[1.2rem]">
              Paste a read-only key. We verify it with one read, seal it, and use it only to read.
              Tomorrow morning your trades are on the shelf.
            </p>
          </Rise>

          <Rise delay={0.14}>
            <Link
              href="/connect"
              className="group mt-10 inline-flex items-center gap-4 rounded-[8px] border border-bone/30 px-7 py-4 font-mono text-[11px] uppercase tracking-[0.2em] text-bone transition-colors duration-500 hover:border-bone hover:bg-bone hover:text-ground"
            >
              review my trades
              <span
                aria-hidden
                className="inline-block transition-transform duration-500 group-hover:translate-x-1"
              >
                &rarr;
              </span>
            </Link>
          </Rise>
        </div>
      </div>
    </section>
  );
}
