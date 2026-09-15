import { Suspense } from "react";
import { HeroActions, HeroFoot, HeroTitle } from "@/components/hero-copy";
import { Shelf } from "@/components/shelf";
import { Sources } from "@/components/sources";
import { Check } from "@/components/story/check";
import { GateVerdict, GateVerdictPending } from "@/components/story/gate-verdict";
import { Invitation } from "@/components/story/invitation";
import { Lesson } from "@/components/story/lesson";
import { Night } from "@/components/story/night";
import { ScoresPinned } from "@/components/story/scores-pinned";
import { Sister } from "@/components/story/sister";
import { loadReview, recordUrl, toDesk } from "@/lib/desk";
import { kaavalUrl, readCheck, readLesson, readNight, readScores } from "@/lib/story";

// Every beat is the record as it stands right now, and the gate verdict is the live
// market, so nothing here is baked into the build.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vidiyal, the morning after the trade",
  description:
    "One night of trading, read back in daylight: the trade nobody reviewed, its five scores, the habit it repeated, and the rule that habit became.",
};

export default async function Home() {
  const record = await loadReview();
  const desk = toDesk(record);

  const night = await readNight(record);
  const scores = night === null ? null : await readScores(record, night.id);
  const lesson = await readLesson(record);
  const check = await readCheck(record);

  return (
    <main className="relative">
      <section data-shelf-track className="relative md:h-[280svh]">
        <div className="relative flex min-h-[100svh] flex-col gap-8 px-6 pb-24 pt-[17svh] md:block md:h-[100svh] md:min-h-0 md:gap-0 md:overflow-hidden md:p-0 md:sticky md:top-0">
          <Shelf
            spines={desk.spines}
            className="relative order-2 h-[46svh] w-full md:absolute md:inset-0 md:order-none md:h-auto"
          />

          <HeroTitle className="relative order-1 z-20 md:absolute md:left-[5vw] md:top-[17svh] md:order-none" />

          <HeroActions className="relative order-3 z-20 md:absolute md:left-[5vw] md:top-[46svh] md:order-none" />

          <HeroFoot
            desk={desk}
            className="relative order-4 z-20 md:absolute md:bottom-[8svh] md:left-[5vw] md:order-none"
          />
        </div>
      </section>

      <Sources record={record} published={recordUrl()} />

      <Night night={night} />

      {scores === null ? null : <ScoresPinned scores={scores} />}

      <Lesson
        lesson={lesson}
        verdict={
          <Suspense fallback={<GateVerdictPending />}>
            <GateVerdict record={record} />
          </Suspense>
        }
      />

      <Check check={check} />

      <Invitation />

      <Sister href={kaavalUrl()} />
    </main>
  );
}
