import { Suspense } from "react";
import { Check } from "@/components/story/check";
import { GateVerdict, GateVerdictPending } from "@/components/story/gate-verdict";
import { Invitation } from "@/components/story/invitation";
import { Lesson } from "@/components/story/lesson";
import { Night } from "@/components/story/night";
import { ScoresPinned } from "@/components/story/scores-pinned";
import { Sister } from "@/components/story/sister";
import { loadReview, toDesk, type Spine } from "@/lib/desk";
import { GRADE_COLOR, GRADE_MEANING, LETTERS, type Letter } from "@/lib/grades";
import { kaavalUrl, readCheck, readLesson, readNight, readScores } from "@/lib/story";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vidiyal lab", robots: { index: false, follow: false } };

export default async function Lab() {
  const record = await loadReview();
  const desk = toDesk(record);
  const byLetter = new Map<Letter, Spine>();
  for (const spine of desk.spines) {
    if (!byLetter.has(spine.letter)) byLetter.set(spine.letter, spine);
  }

  const night = await readNight(record);
  const scores = night === null ? null : await readScores(record, night.id);
  const lesson = await readLesson(record);
  const check = await readCheck(record);

  return (
    <>
      <main className="mx-auto max-w-3xl px-6 py-20">
      <Label>the grade family, one spine each, at rest</Label>
      <div className="mt-6 space-y-4">
        {LETTERS.map((letter) => {
          const spine = byLetter.get(letter);
          return (
            <div key={letter}>
              <div className="spine" style={{ ["--grade" as string]: GRADE_COLOR[letter] }}>
                <div className="grid h-full grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 font-mono text-[11px] uppercase tracking-[0.16em] text-bone/80">
                  <span>
                    {spine ? (
                      <>
                        {spine.ticker}
                        <span className="text-bone/35">{spine.quote}</span>
                        <span className="ml-2 text-bone/45">{spine.side}</span>
                      </>
                    ) : (
                      <span className="text-bone/35">no trade at this grade yet</span>
                    )}
                  </span>
                  <span className="justify-self-center whitespace-nowrap">
                    <span
                      className="text-[14px] font-medium tracking-[0.1em]"
                      style={{ color: GRADE_COLOR[letter] }}
                    >
                      {letter}
                    </span>
                    <span className="ml-2 text-bone/60">
                      {spine ? spine.total.toFixed(1) : GRADE_MEANING[letter]}
                    </span>
                  </span>
                  <span className="justify-self-end whitespace-nowrap text-bone/45">
                    {spine ? (
                      <>
                        {spine.entryLabel}
                        <span className="mx-1.5 text-bone/25">&rarr;</span>
                        {spine.exitLabel}
                      </>
                    ) : null}
                  </span>
                </div>
              </div>
              <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-bone/30">
                {GRADE_COLOR[letter]} &middot; {GRADE_MEANING[letter]}
              </p>
            </div>
          );
        })}
      </div>

      <Label className="mt-20">the three typefaces</Label>
      <div className="mt-6 space-y-8 border-l border-bone/10 pl-6">
        <div>
          <span className="block font-display text-[1.9rem] font-semibold leading-[0.95] tracking-[-0.03em]">
            Vidiyal
          </span>
          <span className="mt-1 block font-display text-[0.95rem] font-light italic text-dawn">
            the morning after the trade
          </span>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-bone/30">
            Fraunces 600 and 300 italic, optical size axis on
          </p>
        </div>
        <div>
          <p className="max-w-[34ch] font-body text-[1.15rem] font-light leading-[1.5] text-bone/75">
            Every trade you made, graded on process, not luck.
          </p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-bone/30">
            IBM Plex Sans 300, body size
          </p>
        </div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-bone/45">
            {desk.sourceLine} &middot; {desk.rangeLine} &middot; {desk.countLine}
          </p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-bone/30">
            IBM Plex Mono 400, label size
          </p>
        </div>
      </div>

      <Label className="mt-20">the ground, the grain and the one accent</Label>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Swatch hex="#14100d" name="ground" />
        <Swatch hex="#0c0908" name="ground deep" />
        <Swatch hex="#EDE6DC" name="bone" />
        <Swatch hex="#FF7D55" name="dawn coral" />
      </div>
      <p className="mt-4 font-mono text-[10px] uppercase leading-relaxed tracking-[0.16em] text-bone/30">
        the grain sits over this page at 16 percent, overlay blend
      </p>

      <Label className="mt-24">the beats of the landing story, one at a time</Label>
      <p className="mt-3 font-mono text-[10px] uppercase leading-[1.9] tracking-[0.16em] text-bone/25">
        each one reads the same review bundle the shelf reads &middot; the whole page, in order,
        is the home page
      </p>
      </main>

      <StoryBench
        night={night}
        scores={scores}
        lesson={lesson}
        check={check}
        kaaval={kaavalUrl()}
        verdict={
          <Suspense fallback={<GateVerdictPending />}>
            <GateVerdict record={record} />
          </Suspense>
        }
      />
    </>
  );
}

/** The beats laid out at the width they are designed for, each under its own label. */
function StoryBench({
  night,
  scores,
  lesson,
  check,
  verdict,
  kaaval,
}: {
  night: Awaited<ReturnType<typeof readNight>>;
  scores: Awaited<ReturnType<typeof readScores>>;
  lesson: Awaited<ReturnType<typeof readLesson>>;
  check: Awaited<ReturnType<typeof readCheck>>;
  verdict: React.ReactNode;
  kaaval: string;
}) {
  return (
    <div className="pb-28 md:pb-40">
      <Bench label="beat 2, three in the morning">
        <Night night={night} />
      </Bench>
      <Bench label="beat 3, five scores, one trade, shown at rest: the pinned walk is on the home page">
        {scores === null ? <Missing /> : <ScoresPinned scores={scores} still />}
      </Bench>
      <Bench label="beat 4, the same mistake twice, with the live gate verdict">
        <Lesson lesson={lesson} verdict={verdict} />
      </Bench>
      <Bench label="beat 5, the check that makes it worth reading">
        <Check check={check} />
      </Bench>
      <Bench label="beat 6, review your own">
        <Invitation />
      </Bench>
      <Bench label="beat 7, the sister line">
        <Sister href={kaaval} />
      </Bench>
    </div>
  );
}

function Bench({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-bone/10">
      <p className="px-6 pt-8 font-mono text-[10px] uppercase tracking-[0.22em] text-dawn/60 md:px-[5vw]">
        {label}
      </p>
      {children}
    </section>
  );
}

function Missing() {
  return (
    <p className="px-6 py-16 font-mono text-[11px] uppercase tracking-[0.16em] text-bone/35 md:px-[5vw]">
      this review holds no graded trade, so this beat has nothing to draw
    </p>
  );
}

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h2
      className={`font-mono text-[10px] uppercase tracking-[0.22em] text-bone/35 ${className}`}
    >
      {children}
    </h2>
  );
}

function Swatch({ hex, name }: { hex: string; name: string }) {
  return (
    <div>
      <div className="h-16 rounded-[3px] border border-bone/10" style={{ background: hex }} />
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-bone/35">
        {name}
        <span className="ml-2 text-bone/20">{hex}</span>
      </p>
    </div>
  );
}
