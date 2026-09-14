"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { reviewDetailAction, type ReviewDetailResult, type ReviewView as View } from "@/app/(tenant)/actions";
import { Hairline, Label, Rise } from "@/components/editorial";
import { ReviewAsk } from "@/components/tenant/review-ask";
import { ReviewGate } from "@/components/tenant/review-gate";
import { ReviewShelf } from "@/components/tenant/review-shelf";
import { ReviewSpine } from "@/components/tenant/review-spine";
import { ReviewTrade } from "@/components/tenant/review-trade";
import { ticker, utcStamp } from "@/lib/format";

/**
 * One trader's own review, drawn by the same parts the published record is drawn by.
 *
 * Everything on this page came out of one row of the reviews table, shaped on the server
 * by lib/desk so a trader's shelf and the demo shelf are the same object by the time
 * either reaches a component. Nothing is recomputed in the browser.
 */

type GetToken = () => Promise<string | null>;

const EXPIRED = {
  reason: "your sign-in has expired",
  next: "Sign out and in again, and this review comes straight back.",
};

async function readReview(getAccessToken: GetToken, reviewId: string): Promise<ReviewDetailResult> {
  const token = await getAccessToken();
  if (token === null) return { ok: false, ...EXPIRED };
  return await reviewDetailAction(token, reviewId);
}

export function ReviewView({ reviewId }: { reviewId: string }) {
  const { getAccessToken } = usePrivy();
  const [result, setResult] = useState<ReviewDetailResult | null>(null);
  const search = useSearchParams();
  const wanted = search.get("trade");

  const load = useCallback(async (): Promise<void> => {
    setResult(await readReview(getAccessToken, reviewId));
  }, [getAccessToken, reviewId]);

  // The review is read with a token that only exists in this browser, so the answer
  // arrives in a callback and is dropped if the trader has already moved on.
  useEffect(() => {
    let alive = true;
    void readReview(getAccessToken, reviewId).then((answer) => {
      if (alive) setResult(answer);
    });
    return () => {
      alive = false;
    };
  }, [getAccessToken, reviewId]);

  if (result === null) {
    return (
      <p className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-bone/40 md:text-[11px]">
        <span aria-hidden className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-dawn" />
        opening your review
      </p>
    );
  }

  if (!result.ok) {
    return (
      <div className="border-l-2 border-dawn pl-5">
        <Label className="text-dawn">this did not load</Label>
        <p className="mt-3 max-w-[60ch] font-mono text-[12px] leading-[1.7] text-bone/85">{result.reason}</p>
        <p className="mt-3 max-w-[60ch] font-body text-[1rem] font-light leading-[1.6] text-bone/60">{result.next}</p>
        <button
          type="button"
          onClick={() => {
            setResult(null);
            void load();
          }}
          className="mt-6 font-mono text-[10px] uppercase tracking-[0.2em] text-bone/40 transition-colors duration-300 hover:text-dawn md:text-[11px]"
        >
          try again
        </button>
      </div>
    );
  }

  if (result.view === null) {
    return (
      <div className="border-l-2 border-dawn pl-5">
        <p className="max-w-[60ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/80">
          There is no review at that address on your account. It may have gone with the key it was
          read through.
        </p>
        <Link
          href="/account"
          className="mt-6 inline-block font-mono text-[10px] uppercase tracking-[0.2em] text-bone/40 transition-colors duration-300 hover:text-dawn md:text-[11px]"
        >
          back to your account
        </Link>
      </div>
    );
  }

  const view = result.view;
  const shelfHref = `/account/reviews/${view.id}`;
  const tradeHrefFor = (id: string) => `${shelfHref}?trade=${encodeURIComponent(id)}`;
  const chosen = wanted === null ? null : (view.graded.find((one) => one.trade.id === wanted) ?? null);

  if (wanted !== null) {
    return chosen === null ? (
      <div className="border-l-2 border-dawn pl-5">
        <p className="max-w-[60ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/80">
          This review holds no round trip called {wanted}.
        </p>
        <Link
          href={shelfHref}
          className="mt-6 inline-block font-mono text-[10px] uppercase tracking-[0.2em] text-bone/40 transition-colors duration-300 hover:text-dawn md:text-[11px]"
        >
          back to your shelf
        </Link>
      </div>
    ) : (
      <ReviewTrade graded={chosen} backHref={shelfHref} />
    );
  }

  return (
    <div>
      <Rise>
        <p className="max-w-[64ch] font-mono text-[10px] uppercase leading-[1.9] tracking-[0.16em] text-bone/50 md:text-[11px]">
          {view.sourceLine}
          <span className="mx-2.5 text-bone/20">&middot;</span>
          {view.rangeLine}
          <span className="mx-2.5 text-bone/20">&middot;</span>
          {view.countLine}
        </p>
        <p className="mt-3 max-w-[64ch] font-mono text-[10px] uppercase leading-[1.9] tracking-[0.16em] text-bone/35 md:text-[11px]">
          {view.verificationLine}
          <span className="mx-2.5 text-bone/20">&middot;</span>
          read {utcStamp(view.generatedAt)}
        </p>
      </Rise>

      {view.spines.length === 0 ? (
        <Rise delay={0.08} className="mt-16">
          <h2 className="max-w-[22ch] font-display text-[clamp(1.6rem,3.4vw,2.6rem)] font-light italic leading-[1.1] tracking-[-0.02em] text-bone/90">
            Bitget served no round trip in this window.
          </h2>
          <p className="mt-7 max-w-[56ch] font-body text-[1.05rem] font-light leading-[1.65] text-bone/70">
            The key answered and the read went through: there simply were no fills to pair in the
            last 90 days. An empty shelf here is a result, not a gap.
          </p>
        </Rise>
      ) : (
        <section data-shelf-track className="relative mt-16 md:mt-10 md:h-[200svh]">
          <div className="relative flex min-h-[62svh] flex-col md:sticky md:top-0 md:block md:h-[100svh] md:min-h-0 md:overflow-hidden">
            <ReviewShelf
              spines={view.spines}
              hrefFor={tradeHrefFor}
              className="relative h-[58svh] w-full md:absolute md:inset-0 md:h-auto"
            />
          </div>
        </section>
      )}

      <Patterns view={view} hrefFor={tradeHrefFor} />
      <Checklist view={view} />

      <section className="mt-28 md:mt-40">
        <Rise>
          <Label>before the next order exists</Label>
          <h2 className="mt-5 max-w-[13ch] font-display text-[clamp(2rem,5vw,4rem)] font-semibold leading-[0.92] tracking-[-0.04em] text-bone">
            Hold an idea
            <span className="block font-light italic text-bone/85">against your list.</span>
          </h2>
          <p className="mt-7 max-w-[52ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/70">
            Every item runs against the market as it is right now. When they all pass, the Agent
            Hub previews the exact request Bitget would receive. Nothing is ever sent.
          </p>
          <p className="mt-5 max-w-[62ch] font-mono text-[10px] uppercase leading-[1.9] tracking-[0.16em] text-bone/35">
            the instruments below: {view.choices.note}
          </p>
        </Rise>
        <ReviewGate reviewId={view.id} choices={view.choices} items={view.checklist.length} />
      </section>

      <section className="mt-28 md:mt-40">
        <Rise>
          <Label>your record answers, and shows its working</Label>
          <h2 className="mt-5 max-w-[13ch] font-display text-[clamp(2rem,5vw,4rem)] font-semibold leading-[0.92] tracking-[-0.04em] text-bone">
            Ask it what
            <span className="block font-light italic text-bone/85">it can prove.</span>
          </h2>
          <p className="mt-7 max-w-[52ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/70">
            Your words pick the trades. Those trades build an evidence table, one row per fact.
            Then the English is written from that table and checked back against it, number by
            number. A number no row holds means the model made it up, and the draft is thrown away.
          </p>
        </Rise>
        <ReviewAsk
          reviewId={view.id}
          suggestions={suggestionsFor(view)}
          refs={view.graded.map((one) => one.trade.id)}
          hrefFor={tradeHrefFor}
        />
      </section>

      <Sources view={view} />
    </div>
  );
}

function Patterns({ view, hrefFor }: { view: View; hrefFor: (id: string) => string }) {
  const quiet = view.detectorsRun.filter((name) => !view.patterns.some((hit) => hit.pattern === name));

  return (
    <section className="mt-28 md:mt-40">
      <Rise>
        <Label>the same mistake, more than once</Label>
        <h2 className="mt-5 max-w-[13ch] font-display text-[clamp(2rem,5vw,4rem)] font-semibold leading-[0.92] tracking-[-0.04em] text-bone">
          What your record
          <span className="block font-light italic text-bone/85">does again.</span>
        </h2>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-bone/40 md:text-[11px]">
          {view.detectorsRun.length} detectors ran
          <span className="mx-2.5 text-bone/20">&middot;</span>
          {view.patterns.length} fired
          <span className="mx-2.5 text-bone/20">&middot;</span>
          {view.graded.length} round trips read
        </p>
      </Rise>

      {view.patterns.length === 0 ? (
        <Rise delay={0.08} className="mt-14">
          <p className="max-w-[56ch] font-body text-[1.05rem] font-light leading-[1.65] text-bone/70">
            All {view.detectorsRun.length} detectors ran over your {view.graded.length} round trips
            and none of them fired. Nothing repeated itself in this window, which is a result and
            not a gap.
          </p>
        </Rise>
      ) : (
        <div className="mt-14 grid gap-14 md:grid-cols-12 md:gap-x-10">
          {view.patterns.map((hit) => (
            <Rise key={hit.pattern} delay={0.05} className="md:col-span-11">
              <article className="grid gap-10 border-t border-bone/15 pt-8 md:grid-cols-12 md:gap-x-10">
                <div className="md:col-span-6">
                  <Label>{hit.pattern}</Label>
                  <h3 className="mt-4 font-display text-[clamp(1.7rem,3.8vw,3rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-bone">
                    {hit.pattern.replace(/-/g, " ")}
                  </h3>
                  <p className="mt-5 max-w-[42ch] font-body text-[1.1rem] font-light leading-[1.55] text-bone/85">
                    {hit.description}
                  </p>
                  <ul className="mt-8 space-y-3 border-l border-bone/15 pl-5">
                    {hit.evidence.map((line) => (
                      <li key={line} className="max-w-[46ch] font-body text-[0.98rem] font-light leading-[1.6] text-bone/65">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="md:col-span-5 md:col-start-8">
                  <Label>
                    the {hit.trades.length} {hit.trades.length === 1 ? "trade" : "trades"} behind it
                  </Label>
                  <ul className="mt-4 space-y-2.5">
                    {hit.trades.map((id) => {
                      const spine = view.spines.find((one) => one.id === id) ?? null;
                      return spine === null ? null : (
                        <li key={id}>
                          <ReviewSpine spine={spine} href={hrefFor(id)} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </article>
            </Rise>
          ))}
        </div>
      )}

      {quiet.length > 0 && view.patterns.length > 0 ? (
        <Rise className="mt-20">
          <Hairline />
          <Label className="mt-8">
            these {quiet.length} detectors also ran over the same {view.graded.length} round trips
            and found nothing
          </Label>
          <ul className="mt-5 flex flex-wrap gap-x-7 gap-y-3 font-mono text-[11px] uppercase tracking-[0.16em] text-bone/35">
            {quiet.map((name) => (
              <li key={name}>{name.replace(/-/g, " ")}</li>
            ))}
          </ul>
        </Rise>
      ) : null}
    </section>
  );
}

function Checklist({ view }: { view: View }) {
  return (
    <section className="mt-28 md:mt-40">
      <Rise>
        <Label>one item for every habit that fired</Label>
        <h2 className="mt-5 max-w-[13ch] font-display text-[clamp(2rem,5vw,4rem)] font-semibold leading-[0.92] tracking-[-0.04em] text-bone">
          The list your
          <span className="block font-light italic text-bone/85">record earned.</span>
        </h2>
      </Rise>

      {view.checklist.length === 0 ? (
        <Rise delay={0.08} className="mt-12">
          <p className="max-w-[56ch] font-body text-[1.05rem] font-light leading-[1.65] text-bone/70">
            No pattern fired, so your record earned no item. The gate below still runs against the
            live market and will say the same thing.
          </p>
        </Rise>
      ) : (
        <ol className="mt-14">
          {view.checklist.map((item, i) => {
            const hit = view.patterns.find((pattern) => pattern.pattern === item.pattern) ?? null;
            return (
              <Rise key={item.id} delay={i * 0.05}>
                <li className="grid grid-cols-1 gap-6 border-t border-bone/15 py-10 md:grid-cols-12 md:gap-x-10 md:py-12">
                  <span className="font-display text-[clamp(2.2rem,4.6vw,3.6rem)] font-light leading-[0.8] tracking-[-0.03em] text-bone/25 md:col-span-2">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="md:col-span-7">
                    <h3 className="max-w-[26ch] font-display text-[clamp(1.4rem,3vw,2.2rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-bone">
                      {item.text}
                    </h3>
                    {hit ? (
                      <p className="mt-5 max-w-[48ch] font-body text-[1rem] font-light leading-[1.6] text-bone/60">
                        {hit.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="md:col-span-3">
                    <Label>the test the gate runs</Label>
                    <p className="mt-3 font-mono text-[12px] tracking-[0.04em] text-bone/75">{item.test}</p>
                    <Label className="mt-8">it came from</Label>
                    <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-bone/60">
                      {item.pattern.replace(/-/g, " ")}
                    </p>
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
    </section>
  );
}

function Sources({ view }: { view: View }) {
  return (
    <section className="mt-28 border-t border-bone/12 pt-16 md:mt-40">
      <Rise>
        <Label>sources</Label>
        <dl className="mt-8 font-mono text-[11px] leading-[1.75] text-bone/70">
          <Fact label="record">{view.sourceLine}</Fact>
          <Fact label="key">{view.label}</Fact>
          <Fact label="range">
            {view.rangeLine}
            <span className="mx-2.5 text-bone/20">&middot;</span>
            {view.countLine}
            <span className="mx-2.5 text-bone/20">&middot;</span>
            {view.equityMarks} equity marks
          </Fact>
          <Fact label="what was checked">{view.verificationLine}</Fact>
          <Fact label="fills read">{view.fills}</Fact>
          <Fact label="review written">{utcStamp(view.generatedAt)}</Fact>
        </dl>
        <p className="mt-8 max-w-[56ch] font-body text-[1rem] font-light leading-[1.6] text-bone/55">
          Every read here went through a read-only surface: your key cannot place, change or cancel
          an order through this desk, and the market half of the review carries no credential at all.
        </p>
      </Rise>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 border-t border-bone/10 py-5 md:grid-cols-[13rem_1fr] md:gap-6">
      <dt className="text-[10px] uppercase tracking-[0.18em] text-bone/30">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/**
 * Questions built from this record and nothing else: the trade that graded worst, the
 * patterns that actually fired, the sessions these entries happened in. A question the
 * desk cannot answer from the bundle is never offered.
 */
function suggestionsFor(view: View): string[] {
  const worst = [...view.graded].sort((a, b) => a.scores.total - b.scores.total).at(0) ?? null;
  const overnight = view.graded.some((one) => one.context.sessionAtEntry === "after-hours");

  return [
    worst ? `What made ${ticker(worst.trade.symbol)} the worst trade in this review?` : null,
    ...view.patterns.map((hit) => `Which of my trades show ${hit.pattern.replace(/-/g, " ")}?`),
    worst ? `Why did the grade ${worst.scores.letter} trade score what it did?` : null,
    overnight ? "What happened on the trades I entered overnight?" : null,
  ].filter((line): line is string => line !== null);
}
