import { Rise } from "@/components/editorial";
import { MiniSpine } from "@/components/mini-spine";
import { BeatMark } from "@/components/story/beat";
import type { NightBeat } from "@/lib/story";

/**
 * Beat two. One trade out of the record, stood on its own screen with the clock it was
 * entered on. The clock is a New York clock because the thing being traded is a New York
 * stock, and that gap between the two is the whole reason this product exists.
 */
export function Night({ night }: { night: NightBeat | null }) {
  if (night === null) {
    return (
      <section id="one-trade" className="relative px-6 py-28 md:px-[5vw] md:py-40">
        <BeatMark n="02">the hour nobody reads back</BeatMark>
        <p className="mt-8 max-w-[48ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/70">
          This review holds no graded round trip, so there is no entry to stand here. The shelf
          above says the same thing, and neither of them will invent one.
        </p>
      </section>
    );
  }

  return (
    <section
      id="one-trade"
      className="relative overflow-hidden px-6 py-28 md:min-h-[100svh] md:px-[5vw] md:py-40"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[18vw] top-[8%] -z-10 h-[70vh] w-[80vw] bg-[radial-gradient(50%_50%_at_50%_50%,rgba(78,56,42,0.5)_0%,rgba(20,16,13,0)_100%)] blur-2xl"
      />

      <div className="grid gap-14 md:grid-cols-12 md:gap-x-10">
        <div className="md:col-span-5 md:pt-[10svh]">
          <Rise>
            <BeatMark n="02">the hour nobody reads back</BeatMark>
            <h2 className="mt-7 max-w-[14ch] font-display text-[clamp(2.2rem,5.4vw,4.2rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-bone">
              Nobody reviews
              <span className="block font-light italic text-bone/85">what happened</span>
              <span className="block font-light italic text-bone/85">
                at <span className="not-italic text-dawn">3 a.m.</span>
              </span>
            </h2>
          </Rise>

          <Rise delay={0.08}>
            <p className="mt-9 max-w-[42ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/70 md:text-[1.15rem]">
              Agents and people now trade tokenized stocks through the night on Bitget. The morning
              after is where the money is decided.
            </p>
          </Rise>

          <Rise delay={0.14}>
            <p className="mt-8 max-w-[44ch] font-mono text-[10px] uppercase leading-[1.9] tracking-[0.16em] text-bone/40 md:text-[11px]">
              {night.outOfHours
                ? `this entry landed ${night.session}, ${night.sessionWords}`
                : `no entry in this record landed out of hours, so this is the earliest one: ${night.session}, ${night.sessionWords}`}
              <span className="mx-2.5 text-bone/20">&middot;</span>
              {night.toOpenLine}
            </p>
          </Rise>
        </div>

        <div className="md:col-span-6 md:col-start-7 md:pt-[20svh]">
          <Rise delay={0.1}>
            <div className="flex items-end gap-3 md:gap-5">
              <span className="font-display text-[clamp(5rem,22vw,13rem)] font-semibold leading-[0.78] tracking-[-0.05em] text-bone">
                {night.etClock}
              </span>
              <span className="pb-2 font-display text-[clamp(1.1rem,3vw,2.1rem)] font-light italic leading-none tracking-[-0.02em] text-bone/70 md:pb-4">
                {night.etMeridiem}
                <span className="ml-2 font-mono text-[10px] not-italic tracking-[0.2em] text-bone/40 md:text-[11px]">
                  ET
                </span>
              </span>
            </div>
            <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-bone/40 md:text-[11px]">
              {night.etDayLine}
              <span className="mx-2.5 text-bone/20">&middot;</span>
              {night.utcLine}
            </p>
          </Rise>

          <Rise delay={0.18} className="mt-12 max-w-[26rem]">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-bone/30 md:text-[11px]">
              the trade that was sitting there in the morning
            </p>
            <div className="mt-4">
              <MiniSpine spine={night.spine} />
            </div>
            <p className="mt-4 font-mono text-[10px] uppercase leading-[1.9] tracking-[0.16em] text-bone/35">
              round trip {night.id}
            </p>
          </Rise>
        </div>
      </div>
    </section>
  );
}
