import { Label, Rise } from "@/components/editorial";
import { AskDesk } from "@/components/ask-desk";
import { loadReview } from "@/lib/desk";
import { ticker } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Ask | Vidiyal" };

export default async function Ask() {
  const record = await loadReview();
  const { graded, patterns } = record.bundle;

  const worst = [...graded].sort((a, b) => a.scores.total - b.scores.total).at(0) ?? null;
  const overnight = graded.some((one) => one.context.sessionAtEntry === "after-hours");

  // Every suggestion is built from this record: the trade that graded worst, the patterns
  // that actually fired, the sessions these entries happened in. A question the desk
  // cannot answer from the bundle is never offered.
  const suggestions = [
    worst ? `What made ${ticker(worst.trade.symbol)} the worst trade in this review?` : null,
    ...patterns.map((hit) => `Which trades show ${hit.pattern.replace(/-/g, " ")}?`),
    worst ? `Why did the grade ${worst.scores.letter} trade score what it did?` : null,
    overnight ? "What happened on the trades entered overnight?" : null,
  ].filter((line): line is string => line !== null);

  return (
    <main className="relative px-6 pb-28 pt-[30svh] md:px-[5vw] md:pb-40 md:pt-[26svh]">
      <Rise>
        <Label>the record answers, and shows its working</Label>
        <h1 className="mt-5 max-w-[12ch] font-display text-[clamp(2.6rem,7vw,6rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-bone">
          Ask it what
          <span className="block font-light italic text-bone/85">it can prove.</span>
        </h1>
        <p className="mt-8 max-w-[52ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/70">
          Three steps, and only the last one is a model. Your words pick the trades. Those trades
          build an evidence table, one row per fact, each row carrying the round trip it belongs to.
          Then the English is written from that table and checked back against it, number by number.
        </p>
        <p className="mt-7 max-w-[52ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/60">
          A number in the answer that no row holds means the model made it up. The draft is thrown
          away, the table writes the paragraph instead, and this page says so out loud.
        </p>
        <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.18em] text-bone/40 md:text-[11px]">
          {graded.length} round trips
          <span className="mx-2.5 text-bone/20">&middot;</span>
          {patterns.length} {patterns.length === 1 ? "pattern" : "patterns"}
          <span className="mx-2.5 text-bone/20">&middot;</span>
          nothing outside this review is readable from here
        </p>
      </Rise>

      <AskDesk suggestions={suggestions} refs={graded.map((one) => one.trade.id)} />
    </main>
  );
}
