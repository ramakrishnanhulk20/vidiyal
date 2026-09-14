import { Suspense } from "react";
import { Label, Rise } from "@/components/editorial";
import { ReviewView } from "@/components/tenant/review-view";
import { SignInGate } from "@/components/tenant/sign-in-gate";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My shelf | Vidiyal",
  description: "One review of one connected Bitget account: every round trip graded, with the numbers behind each grade.",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReviewPage({ params }: Props) {
  const { id } = await params;

  return (
    <main className="relative px-6 pb-28 pt-[30svh] md:px-[5vw] md:pb-40 md:pt-[26svh]">
      <Rise>
        <Label>your own record</Label>
        <h1 className="mt-5 max-w-[11ch] font-display text-[clamp(2.6rem,7vw,6rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-bone">
          Ninety days,
          <span className="block font-light italic text-bone/85">graded.</span>
        </h1>
      </Rise>

      <Rise delay={0.06} className="mt-14 md:mt-16">
        <SignInGate>
          <Suspense
            fallback={
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-bone/40 md:text-[11px]">
                opening your review
              </p>
            }
          >
            <ReviewView reviewId={id} />
          </Suspense>
        </SignInGate>
      </Rise>
    </main>
  );
}
