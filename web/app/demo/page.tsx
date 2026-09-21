import Link from "next/link";
import { Label, Rise } from "@/components/editorial";
import { loadReview, toDesk } from "@/lib/desk";

// The demo is the published record as it stands now, so nothing is baked into the build.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Demo record | Vidiyal",
  description:
    "Every screen a connected trader gets, shown on a record anyone can check: the signed ledger of a Kaaval trading brain. No sign-in and no key.",
};

export default async function DemoPage() {
  const record = await loadReview();
  const desk = toDesk(record);
  const worst = [...desk.spines].sort((a, b) => a.total - b.total)[0] ?? null;

  const screens = [
    { href: "/", name: "The shelf", line: `${desk.countLine.toLowerCase()}, each one graded on process` },
    ...(worst === null
      ? []
      : [
          {
            href: `/trades/${encodeURIComponent(worst.id)}`,
            name: "One trade, taken apart",
            line: `the lowest grade on the shelf: ${worst.ticker} ${worst.side}, ${worst.letter} ${worst.total.toFixed(1)}`,
          },
        ]),
    { href: "/patterns", name: "Patterns", line: "the mistakes this record made more than once, with the trades behind each" },
    { href: "/checklist", name: "Checklist", line: "one rule for each pattern, and the test that checks it" },
    { href: "/gate", name: "The gate", line: "type an idea and it is held against the checklist and the live Bitget book" },
    { href: "/ask", name: "Ask", line: "a question answered only from trades in the record" },
  ];

  return (
    <main className="relative px-6 pb-28 pt-[30svh] md:px-[5vw] md:pb-40 md:pt-[26svh]">
      <Rise>
        <Label>demo record, no sign-in and no key</Label>
        <h1 className="mt-5 max-w-[14ch] font-display text-[clamp(2.6rem,7vw,6rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-bone">
          See it work
          <span className="block font-light italic text-bone/85">on a record you can check.</span>
        </h1>
        <p className="mt-8 max-w-[54ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/70">
          A trader who connects a Bitget key gets six screens about their own trades. Here are the
          same six, drawn for the signed paper record of a Kaaval trading brain. It is simulated,
          it is real data, and nothing on it is typed in.
        </p>

        <dl className="mt-8 space-y-1.5 font-mono text-[11px] uppercase leading-relaxed tracking-[0.16em] text-bone/50">
          <dd>{desk.sourceLine}</dd>
          <dd>
            {desk.rangeLine}
            <span className="mx-2 text-bone/25">&middot;</span>
            {desk.countLine}
          </dd>
          <dd>{desk.verificationLine}</dd>
        </dl>
      </Rise>

      <Rise delay={0.08} className="mt-16 md:mt-20">
        <ol className="max-w-[64rem] border-t border-bone/12">
          {screens.map((screen, index) => (
            <li key={screen.href} className="border-b border-bone/12">
              <Link
                href={screen.href}
                className="group grid gap-2 py-7 transition-colors duration-500 hover:bg-bone/[0.03] md:grid-cols-[4rem_16rem_1fr_2rem] md:items-baseline md:gap-6"
              >
                <span className="font-mono text-[11px] tracking-[0.2em] text-dawn">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="font-display text-[1.6rem] font-semibold leading-none tracking-[-0.03em] text-bone">
                  {screen.name}
                </span>
                <span className="font-body text-[0.98rem] font-light leading-[1.5] text-bone/60">{screen.line}</span>
                <span
                  aria-hidden
                  className="hidden font-mono text-bone/40 transition-transform duration-500 group-hover:translate-x-1 md:block"
                >
                  &rarr;
                </span>
              </Link>
            </li>
          ))}
        </ol>

        <div className="mt-14">
          <Link
            href="/connect"
            className="group inline-flex items-center gap-3 rounded-[8px] border border-bone/30 px-6 py-3.5 font-mono text-[11px] uppercase tracking-[0.2em] text-bone transition-colors duration-500 hover:border-bone hover:bg-bone hover:text-ground"
          >
            review my own trades
            <span aria-hidden className="inline-block transition-transform duration-500 group-hover:translate-x-1">
              &rarr;
            </span>
          </Link>
        </div>
      </Rise>
    </main>
  );
}
