"use client";

// Copied from web/app/trades/[id]/page.tsx on 2026-09-14; edit there first. The published
// record keeps the news and the judge's sentence beside its bundle and a trader's own
// review does not, so those two panels are not here and this file says so where they were.

import Link from "next/link";
import type { GradedTrade } from "../../../src/review/types";
import { Hairline, Label, Rise } from "@/components/editorial";
import { held, num, ticker, usdt, utcStamp } from "@/lib/format";
import { GRADE_COLOR, GRADE_MEANING } from "@/lib/grades";
import { contextRows, costRows, fillRows, scoreRows } from "@/lib/trade";

/** One round trip off a trader's own shelf, read the way the published record's are read. */
export function ReviewTrade({ graded, backHref }: { graded: GradedTrade; backHref: string }) {
  const { trade, scores, context } = graded;
  const grade = GRADE_COLOR[scores.letter];
  const open = trade.exitTs === null;
  const fills = fillRows(graded);

  return (
    <div>
      <Rise>
        <Link
          href={backHref}
          className="group inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-bone/40 transition-colors duration-500 hover:text-bone md:text-[11px]"
        >
          <span aria-hidden className="inline-block transition-transform duration-500 group-hover:-translate-x-1">
            &larr;
          </span>
          back to your shelf
        </Link>
      </Rise>

      <Rise delay={0.05} className="mt-10 md:mt-14">
        <header className="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
          <div className="flex items-baseline gap-5 md:gap-7">
            <span
              className="font-display text-[clamp(5.5rem,15vw,12rem)] font-semibold leading-[0.72] tracking-[-0.05em]"
              style={{ color: grade }}
            >
              {scores.letter}
            </span>
            <span className="font-display text-[clamp(1.75rem,4vw,3rem)] font-light leading-none tracking-[-0.03em] text-bone/85">
              {num(scores.total, 1)}
              <span className="ml-1.5 font-mono text-[11px] tracking-[0.18em] text-bone/35">/100</span>
            </span>
          </div>

          <div className="md:pt-3">
            <Label>round trip {trade.id}</Label>
            <h2 className="mt-3 max-w-[18ch] font-display text-[clamp(1.9rem,4.6vw,3.4rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-bone">
              {trade.side} {num(trade.qty, 4)} {ticker(trade.symbol)}
              <span className="font-light italic text-bone/70"> at {num(trade.entryPrice, 4)}</span>
            </h2>
            <p className="mt-5 max-w-[66ch] font-mono text-[10px] uppercase leading-[1.9] tracking-[0.16em] text-bone/45 md:text-[11px]">
              {trade.category}
              <Dot />
              {utcStamp(trade.entryTs)}
              <Dot />
              {open ? "still open" : `held ${held(trade.entryTs, trade.exitTs as number)}`}
              <Dot />
              grade {scores.letter} is {GRADE_MEANING[scores.letter]}
            </p>
          </div>
        </header>
      </Rise>

      <Section title="the five scores" eyebrow="what the rubric read" className="mt-24 md:mt-32">
        <div className="md:col-span-9">
          {scoreRows(scores).map((row, i) => (
            <Rise key={row.key} delay={i * 0.05}>
              <Hairline />
              <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-4 py-7 md:grid-cols-[13rem_4.5rem_1fr] md:py-8">
                <Label className="md:pt-1.5">{row.label}</Label>
                <span className="justify-self-end font-mono text-[13px] tracking-[0.1em] text-bone/70 md:justify-self-start md:pt-1">
                  {num(row.value, 2)}
                  <span className="text-bone/30">/5</span>
                </span>
                <div className="col-span-2 md:col-span-1">
                  {row.lines.map((line) => (
                    <p
                      key={line}
                      className="max-w-[64ch] font-body text-[1rem] font-light leading-[1.65] text-bone/80 [&+p]:mt-2.5 md:text-[1.05rem]"
                    >
                      {line}
                    </p>
                  ))}
                  <span className="mt-3 block font-mono text-[10px] uppercase tracking-[0.18em] text-bone/25">
                    {row.weight} of the 100
                  </span>
                </div>
              </div>
            </Rise>
          ))}
          <Hairline />
        </div>
      </Section>

      <Section title="the fills" eyebrow="what bitget reported" className="mt-24 md:mt-32">
        <div className="md:col-span-11">
          <Rise>
            <table className="hidden w-full border-collapse text-left font-mono text-[11px] md:table">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.2em] text-bone/35">
                  {["time utc", "side", "price", "qty", "fee usdt", "slippage"].map((head) => (
                    <th key={head} className="border-b border-bone/15 pb-3 pr-6 font-normal">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-bone/75">
                {fills.map((fill) => (
                  <tr key={fill.id} className="transition-colors duration-300 hover:bg-bone/[0.04]">
                    <td className="border-b border-bone/10 py-4 pr-6">{fill.time}</td>
                    <td className="border-b border-bone/10 py-4 pr-6 uppercase tracking-[0.1em]">{fill.side}</td>
                    <td className="border-b border-bone/10 py-4 pr-6">{fill.price}</td>
                    <td className="border-b border-bone/10 py-4 pr-6">{fill.qty}</td>
                    <td className="border-b border-bone/10 py-4 pr-6">{fill.fee}</td>
                    <td className="border-b border-bone/10 py-4">{fill.slippage}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="md:hidden">
              {fills.map((fill) => (
                <li key={fill.id} className="border-t border-bone/10 py-5 font-mono text-[11px]">
                  <div className="flex items-baseline justify-between text-bone/70">
                    <span className="uppercase tracking-[0.16em]">
                      {fill.side} {fill.qty}
                    </span>
                    <span>{fill.time} UTC</span>
                  </div>
                  <dl className="mt-3 space-y-1.5 text-[10px] text-bone/45">
                    <Pair label="price" value={fill.price} />
                    <Pair label="fee usdt" value={fill.fee} />
                    <Pair label="slippage" value={fill.slippage} />
                  </dl>
                </li>
              ))}
              <li className="border-t border-bone/10" />
            </ul>
          </Rise>

          <Rise delay={0.08}>
            <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4 font-mono text-[11px] text-bone/60">
              {costRows(graded).map((row) => (
                <div key={row.label}>
                  <dt className="text-[10px] uppercase tracking-[0.2em] text-bone/30">{row.label}</dt>
                  <dd className="mt-1.5">{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 max-w-[62ch] font-body text-[1rem] font-light leading-[1.6] text-bone/55">
              Bitget publishes no historical order book, so the spread you paid and the share of
              the book you took cannot be rebuilt for a past fill. The rubric leaves those out
              rather than guessing them.
            </p>
          </Rise>
        </div>
      </Section>

      <Section title="the market around it" eyebrow="rebuilt from bitget" className="mt-24 md:mt-32">
        <div className="md:col-span-9">
          <dl className="grid gap-x-12 md:grid-cols-2">
            {contextRows(context).map((row, i) => (
              <Rise key={row.label} delay={(i % 2) * 0.05}>
                <div className="border-t border-bone/10 py-6">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-bone/40">{row.label}</dt>
                  <dd className="mt-2.5 max-w-[46ch] font-body text-[1rem] font-light leading-[1.6] text-bone/80">
                    {row.value}
                  </dd>
                </div>
              </Rise>
            ))}
          </dl>
        </div>
      </Section>

      <Section title="your own words" eyebrow="the only score a model touches" className="mt-24 md:mt-32">
        <div className="md:col-span-9">
          <Rise>
            <p className="max-w-[60ch] font-body text-[1.05rem] font-light leading-[1.65] text-bone/70">
              A Bitget account keeps no note beside a fill, so there is nothing here for the judge
              to read. The rubric scores silence 2 out of 5 rather than 0, because not explaining a
              trade is not the same as explaining it badly.
            </p>
            <span className="mt-7 block font-mono text-[10px] uppercase tracking-[0.18em] text-bone/30">
              reasoning scored {num(scores.reasoning, 2)} of 5
              <Dot />
              friction {usdt(trade.feesUsdt + trade.slippageUsdt + Math.abs(trade.fundingUsdt))}
            </span>
          </Rise>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  eyebrow,
  className = "",
  children,
}: {
  title: string;
  eyebrow: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`grid gap-8 md:grid-cols-12 md:gap-x-10 ${className}`}>
      <Rise className="md:col-span-3">
        <h3 className="font-display text-[clamp(1.4rem,2.6vw,2rem)] font-light italic leading-[1.05] tracking-[-0.02em] text-bone/90">
          {title}
        </h3>
        <Label className="mt-3">{eyebrow}</Label>
      </Rise>
      {children}
    </section>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="uppercase tracking-[0.16em]">{label}</dt>
      <dd className="text-bone/70">{value}</dd>
    </div>
  );
}

function Dot() {
  return <span className="mx-2.5 text-bone/20">&middot;</span>;
}
