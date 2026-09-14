import Link from "next/link";
import { Label, Rise } from "@/components/editorial";
import { AccountArea } from "@/components/tenant/account-area";
import { SignInGate } from "@/components/tenant/sign-in-gate";

export const dynamic = "force-dynamic";

/**
 * A review reads 90 days of fills from Bitget, rebuilds the market around each round trip
 * and grades it, which takes about a minute. The action that does it is started from this
 * page, so this is where the host is told to wait for it.
 */
export const maxDuration = 300;

export const metadata = {
  title: "My shelf | Vidiyal",
  description: "The Bitget keys you have connected, and every review Vidiyal has read through them.",
};

export default function AccountPage() {
  return (
    <main className="relative px-6 pb-28 pt-[30svh] md:px-[5vw] md:pb-40 md:pt-[26svh]">
      <Rise>
        <Label>your own account</Label>
        <h1 className="mt-5 max-w-[12ch] font-display text-[clamp(2.6rem,7vw,6rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-bone">
          My shelf,
          <span className="block font-light italic text-bone/85">my record.</span>
        </h1>
        <p className="mt-8 max-w-[52ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/70">
          Ask for a review and Vidiyal reads your last 90 days of fills, pairs them into round
          trips, rebuilds the market around each one and grades it against the same rubric the
          published record is graded by.{" "}
          <Link href="/connect" className="text-dawn underline-offset-4 hover:underline">
            Connect another key
          </Link>{" "}
          whenever you want.
        </p>
      </Rise>

      <Rise delay={0.08} className="mt-16 md:mt-20">
        <SignInGate>
          <AccountArea />
        </SignInGate>
      </Rise>
    </main>
  );
}
