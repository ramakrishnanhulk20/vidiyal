import { Label, Rise } from "@/components/editorial";
import { ConnectForm } from "@/components/tenant/connect-form";
import { SignInGate } from "@/components/tenant/sign-in-gate";
import { tenantConfigured } from "@/lib/tenant/env";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Review my trades | Vidiyal",
  description:
    "Sign in and connect a read-only Bitget key. Vidiyal reads your last 90 days, grades every round trip, and gives you your own shelf. No order is ever placed.",
};

const GUIDE = [
  "Make a key on Bitget with read permission only.",
  "We check it with one read and show you what it saw.",
  "Our code drops every write before it reaches Bitget.",
];

export default function ConnectPage() {
  const status = tenantConfigured();

  return (
    <main className="relative px-6 pb-28 pt-[30svh] md:px-[5vw] md:pb-40 md:pt-[26svh]">
      <Rise>
        <Label>your own record, not ours</Label>
        <h1 className="mt-5 max-w-[12ch] font-display text-[clamp(2.6rem,7vw,6rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-bone">
          Review my
          <span className="block font-light italic text-bone/85">own trades.</span>
        </h1>
        <p className="mt-8 max-w-[52ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/70">
          Connect a read-only Bitget key and Vidiyal reads your last 90 days: every fill paired
          into round trips, the market rebuilt around each one, a grade with the numbers behind
          it, the habits that repeat, and a checklist your next idea has to pass.
        </p>

        <ol className="mt-10 flex flex-col gap-3.5">
          {GUIDE.map((line, index) => (
            <li key={line} className="flex gap-5 font-mono text-[11px] leading-relaxed text-bone/60">
              <span className="text-dawn">{String(index + 1).padStart(2, "0")}</span>
              <span className="min-w-0 max-w-[52ch]">{line}</span>
            </li>
          ))}
        </ol>

        {status.database && status.sealing ? null : (
          <p className="mt-10 max-w-[56ch] border-l-2 border-dawn pl-5 font-mono text-[11px] leading-[1.8] text-dawn">
            This host cannot store a key yet: {status.missing.join(", ")} still to set. You can
            sign in, but connecting will be refused until that is done.
          </p>
        )}
      </Rise>

      <Rise delay={0.08} className="mt-16 md:mt-20">
        <SignInGate>
          <ConnectForm />
        </SignInGate>
      </Rise>
    </main>
  );
}
