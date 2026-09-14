import Link from "next/link";
import { Hairline, Label, Rise } from "@/components/editorial";
import { MiniSpine } from "@/components/mini-spine";
import { gradedById, loadReview, toSpine } from "@/lib/desk";

export const dynamic = "force-dynamic";

export const metadata = { title: "Patterns | Vidiyal" };

/** The card widths, alternating, so two cards never line up on a wide screen. */
const PLACES = [
  "md:col-start-1 md:col-span-11",
  "md:col-start-2 md:col-span-11 md:mt-20",
  "md:col-start-1 md:col-span-10 md:mt-16",
  "md:col-start-3 md:col-span-10 md:mt-16",
];

export default async function Patterns() {
  const record = await loadReview();
  const { patterns, graded } = record.bundle;
  const ran = record.detectorsRun ?? [];
  const quiet = ran.filter((name) => !patterns.some((hit) => hit.pattern === name));

  return (
    <main className="relative px-6 pb-28 pt-[30svh] md:px-[5vw] md:pb-40 md:pt-[26svh]">
      <Rise>
        <Label>the same mistake, more than once</Label>
        <h1 className="mt-5 max-w-[13ch] font-display text-[clamp(2.6rem,7vw,6rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-bone">
          What the record
          <span className="block font-light italic text-bone/85">does again.</span>
        </h1>
        <p className="mt-8 max-w-[46ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/70">
          A pattern is a detector over the whole trade table. Each one hands back the trades that
          prove it, so nothing on this page is a claim without the record behind it.
        </p>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-bone/40 md:text-[11px]">
          {ran.length === 0 ? "detector list not kept by this review" : `${ran.length} detectors ran`}
          <span className="mx-2.5 text-bone/20">&middot;</span>
          {patterns.length} fired
          <span className="mx-2.5 text-bone/20">&middot;</span>
          {graded.length} round trips read
        </p>
      </Rise>

      {patterns.length === 0 ? (
        <Rise delay={0.1} className="mt-24 md:mt-32">
          <h2 className="max-w-[20ch] font-display text-[clamp(1.6rem,3.4vw,2.6rem)] font-light italic leading-[1.1] tracking-[-0.02em] text-bone/90">
            Nothing repeated itself in this record.
          </h2>
          <p className="mt-7 max-w-[56ch] font-body text-[1.05rem] font-light leading-[1.65] text-bone/70">
            {ran.length === 0
              ? "This review was written before the desk kept the names of the detectors, so it can only say that none of them fired."
              : `All ${ran.length} detectors ran over the ${graded.length} round trips in this review and none of them fired. An empty page here is a result, not a gap.`}
          </p>
          {ran.length > 0 ? (
            <ul className="mt-10 grid max-w-[42rem] gap-px bg-bone/10 sm:grid-cols-2">
              {ran.map((name) => (
                <li
                  key={name}
                  className="bg-ground px-4 py-3.5 font-mono text-[11px] uppercase tracking-[0.16em] text-bone/45"
                >
                  {name.replace(/-/g, " ")}
                  <span className="ml-2 text-bone/20">found nothing</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Rise>
      ) : (
        <div className="mt-24 grid gap-16 md:mt-32 md:grid-cols-12 md:gap-x-10 md:gap-y-4">
          {patterns.map((hit, i) => {
            const spines = hit.trades
              .map((id) => gradedById(record, id))
              .filter((found) => found !== null)
              .map(toSpine);

            return (
              <Rise
                key={hit.pattern}
                delay={0.05}
                className={PLACES[i % PLACES.length] as string}
              >
                <article className="grid gap-10 border-t border-bone/15 pt-8 md:grid-cols-12 md:gap-x-10">
                  <div className="md:col-span-6">
                    <Label>{hit.pattern}</Label>
                    <h2 className="mt-4 font-display text-[clamp(2rem,4.6vw,3.6rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-bone">
                      {hit.pattern.replace(/-/g, " ")}
                    </h2>
                    <p className="mt-5 max-w-[42ch] font-body text-[1.1rem] font-light leading-[1.55] text-bone/85">
                      {hit.description}
                    </p>

                    <ul className="mt-8 space-y-3 border-l border-bone/15 pl-5">
                      {hit.evidence.map((line) => (
                        <li
                          key={line}
                          className="max-w-[46ch] font-body text-[0.98rem] font-light leading-[1.6] text-bone/65"
                        >
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="md:col-span-5 md:col-start-8">
                    <Label>
                      the {spines.length} {spines.length === 1 ? "trade" : "trades"} behind it
                    </Label>
                    <ul className="mt-4 space-y-2.5">
                      {spines.map((spine) => (
                        <li key={spine.id}>
                          <MiniSpine spine={spine} />
                        </li>
                      ))}
                    </ul>

                    <Link
                      href="/checklist"
                      className="group mt-8 inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-bone/40 transition-colors duration-500 hover:text-dawn"
                    >
                      the item it became
                      <span className="inline-block transition-transform duration-500 group-hover:translate-x-1">
                        &rarr;
                      </span>
                    </Link>
                  </div>
                </article>
              </Rise>
            );
          })}
        </div>
      )}

      {patterns.length > 0 && quiet.length > 0 ? (
        <Rise className="mt-28 md:mt-40">
          <Hairline />
          <Label className="mt-8">
            these {quiet.length} detectors also ran over the same {graded.length} round trips and
            found nothing
          </Label>
          <ul className="mt-5 flex flex-wrap gap-x-7 gap-y-3 font-mono text-[11px] uppercase tracking-[0.16em] text-bone/35">
            {quiet.map((name) => (
              <li key={name}>{name.replace(/-/g, " ")}</li>
            ))}
          </ul>
        </Rise>
      ) : null}
    </main>
  );
}
