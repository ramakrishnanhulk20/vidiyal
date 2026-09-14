import Link from "next/link";
import { Hairline, Label, Rise } from "@/components/editorial";
import { loadReview } from "@/lib/desk";

export const dynamic = "force-dynamic";

export const metadata = { title: "Checklist | Vidiyal" };

export default async function Checklist() {
  const record = await loadReview();
  const { checklist, patterns, graded } = record.bundle;

  return (
    <main className="relative px-6 pb-28 pt-[30svh] md:px-[5vw] md:pb-40 md:pt-[26svh]">
      <Rise>
        <Label>one item for every habit that fired</Label>
        <h1 className="mt-5 max-w-[12ch] font-display text-[clamp(2.6rem,7vw,6rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-bone">
          The list the
          <span className="block font-light italic text-bone/85">record earned.</span>
        </h1>
        <p className="mt-8 max-w-[48ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/70">
          Nothing here was chosen by hand. Every pattern the review found turns into one item with
          a test that runs against the live market and this account before a new order, and an idea
          passes only when every item passes.
        </p>
      </Rise>

      {checklist.length === 0 ? (
        <Rise delay={0.1} className="mt-24 md:mt-32">
          <h2 className="max-w-[22ch] font-display text-[clamp(1.6rem,3.4vw,2.6rem)] font-light italic leading-[1.1] tracking-[-0.02em] text-bone/90">
            No pattern fired, so the record earned no item.
          </h2>
          <p className="mt-7 max-w-[54ch] font-body text-[1.05rem] font-light leading-[1.65] text-bone/70">
            The gate still runs against the live market, and it will say the same thing: this
            review of {graded.length} round trips found no habit worth holding a new idea against.
          </p>
          <Link
            href="/patterns"
            className="group mt-10 inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-bone/45 transition-colors duration-500 hover:text-dawn"
          >
            what the detectors looked for
            <span className="inline-block transition-transform duration-500 group-hover:translate-x-1">
              &rarr;
            </span>
          </Link>
        </Rise>
      ) : (
        <ol className="mt-24 md:mt-32">
          {checklist.map((item, i) => {
            const hit = patterns.find((pattern) => pattern.pattern === item.pattern) ?? null;
            return (
              <Rise key={item.id} delay={i * 0.06}>
                <li className="grid grid-cols-1 gap-6 border-t border-bone/15 py-10 md:grid-cols-12 md:gap-x-10 md:py-14">
                  <span className="font-display text-[clamp(2.4rem,5vw,4rem)] font-light leading-[0.8] tracking-[-0.03em] text-bone/25 md:col-span-2">
                    {String(i + 1).padStart(2, "0")}
                  </span>

                  <div className="md:col-span-7">
                    <h2 className="max-w-[26ch] font-display text-[clamp(1.5rem,3.2vw,2.4rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-bone">
                      {item.text}
                    </h2>
                    {hit ? (
                      <p className="mt-5 max-w-[48ch] font-body text-[1rem] font-light leading-[1.6] text-bone/60">
                        {hit.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="md:col-span-3">
                    <Label>the test the gate runs</Label>
                    <p className="mt-3 font-mono text-[12px] tracking-[0.04em] text-bone/75">
                      {item.test}
                    </p>
                    <Label className="mt-8">it came from</Label>
                    <Link
                      href="/patterns"
                      className="group mt-3 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-bone/60 transition-colors duration-500 hover:text-dawn"
                    >
                      {item.pattern.replace(/-/g, " ")}
                      <span className="inline-block transition-transform duration-500 group-hover:translate-x-1">
                        &rarr;
                      </span>
                    </Link>
                    {hit ? (
                      <span className="mt-3 block font-mono text-[10px] uppercase tracking-[0.16em] text-bone/30">
                        {hit.trades.length} {hit.trades.length === 1 ? "trade" : "trades"} behind it
                      </span>
                    ) : null}
                  </div>
                </li>
              </Rise>
            );
          })}
          <li>
            <Hairline />
          </li>
        </ol>
      )}

      <Rise className="mt-20 md:mt-28">
        <Link
          href="/gate"
          className="group inline-flex items-baseline gap-4 font-display text-[clamp(1.4rem,3vw,2.2rem)] font-light italic tracking-[-0.02em] text-bone/85 transition-colors duration-500 hover:text-bone"
        >
          Hold an idea against it
          <span className="inline-block font-mono text-[12px] not-italic tracking-[0.2em] text-dawn transition-transform duration-500 group-hover:translate-x-1.5">
            &rarr;
          </span>
        </Link>
      </Rise>
    </main>
  );
}
