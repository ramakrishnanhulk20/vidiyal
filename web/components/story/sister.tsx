import { Rise } from "@/components/editorial";
import { BeatMark } from "@/components/story/beat";

/**
 * Beat seven. The other half of the pair, in one line. Kaaval runs through the night and
 * this desk reads that night back, so the link is the last thing on the page before the
 * footer rather than a card in the middle of it.
 */
export function Sister({ href }: { href: string }) {
  return (
    <section className="relative border-t border-bone/10 px-6 py-24 md:px-[5vw] md:py-32">
      <Rise>
        <BeatMark n="07">the other half</BeatMark>
      </Rise>

      <Rise delay={0.06}>
        <p className="mt-8 max-w-[18ch] font-display text-[clamp(2rem,5.4vw,4.2rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-bone md:max-w-[22ch]">
          Kaaval trades the night.
          <span className="block font-light italic text-bone/85">Vidiyal reads it back.</span>
        </p>
      </Rise>

      <Rise delay={0.12}>
        <a
          href={href}
          className="group mt-10 inline-flex items-baseline gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-bone/50 transition-colors duration-500 hover:text-dawn md:text-[12px]"
        >
          the night watch
          <span
            aria-hidden
            className="inline-block transition-transform duration-500 group-hover:translate-x-1.5"
          >
            &rarr;
          </span>
        </a>
      </Rise>
    </section>
  );
}
