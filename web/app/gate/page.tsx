import Link from "next/link";
import { Label, Rise } from "@/components/editorial";
import { GateForm } from "@/components/gate-form";
import { loadReview } from "@/lib/desk";
import { num } from "@/lib/format";
import { deskState, openExposureUsdt, symbolChoices } from "@/lib/idea";

export const dynamic = "force-dynamic";

export const metadata = { title: "The gate | Vidiyal" };

export default async function Gate() {
  const record = await loadReview();
  const bundle = record.bundle;
  const state = deskState(bundle);
  const choices = await symbolChoices(bundle);
  const open = bundle.graded.filter((graded) => graded.trade.exitTs === null).length;

  return (
    <main className="relative px-6 pb-28 pt-[30svh] md:px-[5vw] md:pb-40 md:pt-[26svh]">
      <Rise>
        <Label>before the order exists</Label>
        <h1 className="mt-5 max-w-[11ch] font-display text-[clamp(2.6rem,7vw,6rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-bone">
          Hold an idea
          <span className="block font-light italic text-bone/85">against the list.</span>
        </h1>
        <p className="mt-8 max-w-[50ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/70">
          Every item runs against the market as it is right now, not as it was when the trade that
          taught the lesson was made. When every item passes, the Agent Hub previews the exact
          request Bitget would receive. Nothing is ever sent.
        </p>
      </Rise>

      <Rise delay={0.08} className="mt-12">
        <dl className="flex flex-wrap gap-x-12 gap-y-6 border-t border-bone/12 pt-8 font-mono text-[11px] text-bone/60">
          <Stat label="checklist">
            {bundle.checklist.length} {bundle.checklist.length === 1 ? "item" : "items"}
          </Stat>
          <Stat label="equity the record last marked">{num(state.equity, 2)} USDT</Stat>
          <Stat label="open exposure">
            {num(openExposureUsdt(bundle), 2)} USDT over {open} {open === 1 ? "trip" : "trips"}
          </Stat>
          <Stat label="net exposure">{num(state.netExposureUsdt, 2)} USDT</Stat>
        </dl>
        <p className="mt-6 max-w-[62ch] font-mono text-[10px] uppercase leading-[1.9] tracking-[0.16em] text-bone/35">
          the instruments below: {choices.note}
        </p>
        {bundle.checklist.length === 0 ? (
          <p className="mt-8 max-w-[56ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/70">
            This review found no repeating habit, so the checklist is empty and the gate can only
            show you the request Bitget would receive.{" "}
            <Link href="/patterns" className="text-dawn underline-offset-4 hover:underline">
              What the detectors looked for
            </Link>
            .
          </p>
        ) : null}
      </Rise>

      <GateForm choices={choices} items={bundle.checklist.length} />
    </main>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone/30">{label}</dt>
      <dd className="mt-2">{children}</dd>
    </div>
  );
}
