import Link from "next/link";
import { Rise } from "@/components/editorial";
import type { ReviewRecord } from "@/lib/desk";
import { GRADE_COLOR } from "@/lib/grades";
import { readGate } from "@/lib/story";

const PASS = GRADE_COLOR.A;
const FAIL = GRADE_COLOR.E;

/**
 * The third step of beat four: the item this record earned, run against the market as it
 * is right now. It is a live read, so it arrives after the rest of the page and carries
 * the minute it was checked. A failure says what happened and what to do about it, since
 * a blank space here would read as an idea that passed nothing.
 */
export async function GateVerdict({ record }: { record: ReviewRecord }) {
  const gate = await readGate(record);

  if (!gate.ok) {
    return (
      <div>
        <span className="block font-mono text-[10px] uppercase tracking-[0.2em] md:text-[11px]" style={{ color: FAIL }}>
          the gate did not run
        </span>
        <h3 className="mt-4 max-w-[24ch] font-display text-[clamp(1.5rem,3.2vw,2.4rem)] font-light italic leading-[1.1] tracking-[-0.02em] text-bone">
          {gate.problem}
        </h3>
        <p className="mt-5 max-w-[54ch] font-body text-[1.02rem] font-light leading-[1.65] text-bone/70">
          {gate.next}
        </p>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-bone/30">
          {gate.checkedLine}
          <span className="mx-2.5 text-bone/20">&middot;</span>
          engine reached in {gate.mode} mode
        </p>
      </div>
    );
  }

  const { check, idea } = gate;
  const passed = check.results.filter((result) => result.pass).length;

  return (
    <div>
      <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-bone/40 md:text-[11px]">
        {idea.side} {idea.notionalUsdt} usdt of {idea.symbol} on {idea.category}, right now
      </span>
      <h3
        className="mt-5 max-w-[16ch] font-display text-[clamp(2rem,5vw,3.6rem)] font-semibold leading-[0.92] tracking-[-0.04em]"
        style={{ color: check.pass ? PASS : FAIL }}
      >
        {check.pass ? "It passes." : "It does not pass."}
      </h3>
      <p className="mt-5 font-mono text-[10px] uppercase leading-[1.9] tracking-[0.16em] text-bone/40 md:text-[11px]">
        {passed} of {check.results.length} {check.results.length === 1 ? "item" : "items"} passed
        <span className="mx-2.5 text-bone/20">&middot;</span>
        {gate.checkedLine}
      </p>

      {check.results.length === 0 ? (
        <p className="mt-8 max-w-[52ch] font-body text-[1.02rem] font-light leading-[1.65] text-bone/70">
          This review earned no item, so there was nothing to hold the idea against. What the
          preview shows is only the request Bitget would have received.
        </p>
      ) : (
        <ul className="mt-10">
          {check.results.map((result) => (
            <li key={result.item.id} className="grid gap-3 border-t border-bone/10 py-6 md:grid-cols-12 md:gap-x-8">
              <div className="flex items-center gap-3 md:col-span-2">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0"
                  style={{ backgroundColor: result.pass ? PASS : FAIL }}
                />
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.18em] md:text-[11px]"
                  style={{ color: result.pass ? PASS : FAIL }}
                >
                  {result.pass ? "pass" : "fail"}
                </span>
              </div>
              <p className="font-body text-[1rem] font-light leading-[1.5] text-bone/85 md:col-span-5">
                {result.item.text}
              </p>
              <p className="font-mono text-[11.5px] leading-[1.75] text-bone/55 md:col-span-5">
                {result.observed}
              </p>
            </li>
          ))}
          <li className="border-t border-bone/10" />
        </ul>
      )}

      <p className="mt-8 max-w-[58ch] font-body text-[1rem] font-light leading-[1.6] text-bone/60">
        {check.dryRunNote}
      </p>

      <Rise delay={0.05}>
        <Link
          href="/gate"
          className="group mt-8 inline-flex items-baseline gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-bone/45 transition-colors duration-500 hover:text-dawn md:text-[11px]"
        >
          type your own idea into the gate
          <span
            aria-hidden
            className="inline-block transition-transform duration-500 group-hover:translate-x-1"
          >
            &rarr;
          </span>
        </Link>
      </Rise>
    </div>
  );
}

/** What stands there while Bitget is being read. The wait is named rather than spun at. */
export function GateVerdictPending() {
  return (
    <div>
      <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-bone/40 md:text-[11px]">
        holding one idea against the list
      </span>
      <h3 className="mt-5 max-w-[18ch] font-display text-[clamp(2rem,5vw,3.6rem)] font-semibold leading-[0.92] tracking-[-0.04em] text-bone/25">
        Reading the live market.
      </h3>
      <p className="mt-5 max-w-[48ch] font-mono text-[10px] uppercase leading-[1.9] tracking-[0.16em] text-bone/35 md:text-[11px]">
        a few seconds: the spread, the divergence and the stop are read from Bitget before the
        verdict can be honest. nothing is sent anywhere.
      </p>
    </div>
  );
}
