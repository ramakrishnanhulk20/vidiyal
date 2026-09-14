"use client";

// Copied from web/components/gate-form.tsx on 2026-09-14; edit there first. The demo gate
// posts a form to a server action; this one hands the signed-in trader's token over with
// the idea, so the checklist it runs is the one their own record earned.

import { usePrivy } from "@privy-io/react-auth";
import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { reviewGateAction, type TenantGateOutcome } from "@/app/(tenant)/actions";
import { Label } from "@/components/editorial";
import { utcStamp } from "@/lib/format";
import { GRADE_COLOR } from "@/lib/grades";
import type { SymbolChoices } from "@/lib/idea";

const PASS = GRADE_COLOR.A;
const FAIL = GRADE_COLOR.E;

export function ReviewGate({
  reviewId,
  choices,
  items,
}: {
  reviewId: string;
  choices: SymbolChoices;
  items: number;
}) {
  const { getAccessToken } = usePrivy();
  const [outcome, setOutcome] = useState<TenantGateOutcome | null>(null);
  const [pending, setPending] = useState(false);
  const reduced = useReducedMotion();
  const first = choices.traded[0] ?? choices.universe[0] ?? null;

  const submit = async (form: HTMLFormElement): Promise<void> => {
    const data = new FormData(form);
    setPending(true);
    setOutcome(null);

    const token = await getAccessToken();
    if (token === null) {
      setPending(false);
      setOutcome({
        ok: false,
        reason: "your sign-in has expired",
        next: "Sign out and in again, then hold the idea up once more.",
      });
      return;
    }

    try {
      setOutcome(
        await reviewGateAction(token, reviewId, {
          instrument: String(data.get("instrument") ?? ""),
          side: String(data.get("side") ?? ""),
          notionalUsdt: Number(data.get("notional")),
          note: String(data.get("note") ?? ""),
        }),
      );
    } catch {
      setOutcome({
        ok: false,
        reason: "the server could not be reached",
        next: "Nothing was sent to Bitget. Check your connection and try again.",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(event.currentTarget);
        }}
        className="mt-12"
      >
        <div className="grid gap-x-10 gap-y-9 md:grid-cols-12">
          <Field className="md:col-span-5" label="instrument" htmlFor="tenant-instrument">
            <div className="relative">
              <select
                id="tenant-instrument"
                name="instrument"
                defaultValue={first?.value ?? ""}
                className="w-full appearance-none border-b border-bone/25 bg-transparent py-3 pr-8 font-mono text-[15px] text-bone outline-none transition-colors duration-300 hover:border-bone/50 focus:border-dawn"
              >
                {choices.traded.length > 0 ? (
                  <optgroup label="traded in this review">
                    {choices.traded.map((option) => (
                      <option key={option.value} value={option.value} className="bg-ground">
                        {option.symbol} &middot; {option.category}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {choices.universe.length > 0 ? (
                  <optgroup label="in the engine's universe">
                    {choices.universe.map((option) => (
                      <option key={option.value} value={option.value} className="bg-ground">
                        {option.symbol} &middot; {option.category}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
              <span
                aria-hidden
                className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 font-mono text-[11px] text-bone/35"
              >
                &darr;
              </span>
            </div>
          </Field>

          <Field className="md:col-span-3" label="side">
            <div className="flex gap-2.5 pt-1.5">
              {["buy", "sell"].map((side, i) => (
                <label key={side} className="flex-1">
                  <input type="radio" name="side" value={side} defaultChecked={i === 0} className="peer sr-only" />
                  <span className="block cursor-pointer rounded-[8px] border border-bone/20 py-2.5 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-bone/50 transition-colors duration-300 hover:border-bone/45 hover:text-bone/80 peer-checked:border-bone/70 peer-checked:text-bone peer-focus-visible:border-dawn">
                    {side}
                  </span>
                </label>
              ))}
            </div>
          </Field>

          <Field className="md:col-span-4" label="notional in usdt" htmlFor="tenant-notional">
            <input
              id="tenant-notional"
              type="number"
              name="notional"
              defaultValue={300}
              min={10}
              step={1}
              inputMode="decimal"
              className="w-full border-b border-bone/25 bg-transparent py-3 font-mono text-[15px] text-bone outline-none transition-colors duration-300 hover:border-bone/50 focus:border-dawn"
            />
          </Field>

          <Field className="md:col-span-12" label="the note you would have written (optional)" htmlFor="tenant-note">
            <input
              id="tenant-note"
              type="text"
              name="note"
              maxLength={280}
              placeholder="the reason this order exists"
              className="w-full border-b border-bone/25 bg-transparent py-3 font-body text-[1.05rem] font-light text-bone outline-none transition-colors duration-300 placeholder:text-bone/25 hover:border-bone/50 focus:border-dawn"
            />
          </Field>
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-6">
          <button
            type="submit"
            disabled={pending}
            className="rounded-[8px] border border-bone/35 px-7 py-3.5 font-mono text-[11px] uppercase tracking-[0.2em] text-bone transition-colors duration-300 hover:border-bone hover:bg-bone hover:text-ground disabled:cursor-wait disabled:border-bone/20 disabled:text-bone/40 disabled:hover:bg-transparent"
          >
            {pending ? "holding it" : `hold it against ${items === 1 ? "the item" : `all ${String(items)}`}`}
          </button>
          <span className="flex items-center gap-3 font-mono text-[10px] uppercase leading-relaxed tracking-[0.16em] text-bone/35">
            {pending ? (
              <>
                <span aria-hidden className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-dawn" />
                reading the live market, a few seconds
              </>
            ) : (
              "no order is placed: a pass ends at the Agent Hub dry run"
            )}
          </span>
        </div>
      </form>

      {outcome === null ? null : (
        <motion.section
          key={outcome.ok ? `pass-${String(outcome.ranAt)}` : "fail"}
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          className="mt-20 md:mt-28"
          aria-live="polite"
        >
          {outcome.ok ? <Verdict outcome={outcome} /> : <Trouble outcome={outcome} />}
        </motion.section>
      )}
    </div>
  );
}

function Verdict({ outcome }: { outcome: Extract<TenantGateOutcome, { ok: true }> }) {
  const { check, idea } = outcome;
  const passed = check.results.filter((result) => result.pass).length;

  return (
    <div>
      <div className="border-t border-bone/15 pt-10">
        <Label>
          {idea.side} {idea.notionalUsdt} usdt of {idea.symbol} on {idea.category}
        </Label>
        <h3
          className="mt-5 max-w-[16ch] font-display text-[clamp(2.2rem,6vw,4.5rem)] font-semibold leading-[0.92] tracking-[-0.04em]"
          style={{ color: check.pass ? PASS : FAIL }}
        >
          {check.pass ? "It passes." : "It does not pass."}
        </h3>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-bone/40 md:text-[11px]">
          {passed} of {check.results.length} {check.results.length === 1 ? "item" : "items"} passed
          <span className="mx-2.5 text-bone/20">&middot;</span>
          checked against the live market {utcStamp(outcome.ranAt)}
        </p>
      </div>

      {check.results.length === 0 ? (
        <p className="mt-10 max-w-[56ch] font-body text-[1.05rem] font-light leading-[1.65] text-bone/70">
          Your record earned no checklist item, so there was nothing to hold the idea against. What
          follows is only what Bitget would have received.
        </p>
      ) : (
        <ul className="mt-14">
          {check.results.map((result) => (
            <li
              key={result.item.id}
              className="grid grid-cols-1 gap-4 border-t border-bone/10 py-8 md:grid-cols-12 md:gap-x-10"
            >
              <div className="flex items-center gap-3 md:col-span-2">
                <span aria-hidden className="h-2 w-2 shrink-0" style={{ backgroundColor: result.pass ? PASS : FAIL }} />
                <span
                  className="font-mono text-[11px] uppercase tracking-[0.18em]"
                  style={{ color: result.pass ? PASS : FAIL }}
                >
                  {result.pass ? "pass" : "fail"}
                </span>
              </div>
              <div className="md:col-span-5">
                <p className="max-w-[38ch] font-body text-[1.05rem] font-light leading-[1.5] text-bone/85">
                  {result.item.text}
                </p>
                <span className="mt-3 block font-mono text-[10px] uppercase tracking-[0.16em] text-bone/30">
                  {result.item.test}
                </span>
              </div>
              <p className="font-mono text-[12px] leading-[1.75] text-bone/60 md:col-span-5">{result.observed}</p>
            </li>
          ))}
          <li className="border-t border-bone/10" />
        </ul>
      )}

      <div className="mt-16">
        <Label>{check.dryRun === null ? "no order was built" : "the request Bitget would receive"}</Label>
        <p className="mt-4 max-w-[62ch] font-body text-[1rem] font-light leading-[1.6] text-bone/70">
          {check.dryRunNote}
        </p>
        {check.dryRun === null ? null : (
          <pre className="mt-7 overflow-x-auto border border-bone/12 bg-ground-deep/60 p-5 font-mono text-[11.5px] leading-[1.8] text-bone/75">
            {JSON.stringify(check.dryRun, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function Trouble({ outcome }: { outcome: Extract<TenantGateOutcome, { ok: false }> }) {
  return (
    <div className="border-t pt-10" style={{ borderColor: `${FAIL}40` }}>
      <span className="block font-mono text-[10px] uppercase tracking-[0.2em] md:text-[11px]" style={{ color: FAIL }}>
        the gate did not run
      </span>
      <h3 className="mt-5 max-w-[22ch] font-display text-[clamp(1.6rem,3.6vw,2.6rem)] font-light italic leading-[1.1] tracking-[-0.02em] text-bone">
        {outcome.reason}
      </h3>
      <p className="mt-6 max-w-[58ch] font-body text-[1.05rem] font-light leading-[1.65] text-bone/70">
        {outcome.next}
      </p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  className = "",
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      {htmlFor === undefined ? (
        <Label>{label}</Label>
      ) : (
        <label htmlFor={htmlFor}>
          <Label className="cursor-pointer">{label}</Label>
        </label>
      )}
      <div className="mt-2">{children}</div>
    </div>
  );
}
