"use client";

// Copied from kaaval/web/components/tenant/ConnectForm.tsx on 2026-09-14; edit there first.
// The palette, the wording and the next step after a refusal are Vidiyal's.

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useState } from "react";
import { connectAction, type ConnectActionResult } from "@/app/(tenant)/actions";
import { Label } from "@/components/editorial";
import { num } from "@/lib/format";

/**
 * The form that turns a read-only Bitget key into a connection.
 *
 * The secret and the passphrase are typed, sent once, and dropped. They are never put
 * back on the screen, never placed in a link, and never kept in this component after the
 * answer comes back, because the only copy that should exist after this is the sealed one
 * in the database.
 */

type State = "idle" | "checking" | "done" | "failed";

const EMPTY = { label: "", apiKey: "", secretKey: "", passphrase: "" };

export function ConnectForm() {
  const { getAccessToken } = usePrivy();
  const [fields, setFields] = useState(EMPTY);
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<ConnectActionResult | null>(null);

  const submit = async (): Promise<void> => {
    setState("checking");
    setResult(null);

    const token = await getAccessToken();
    if (token === null) {
      setResult({
        ok: false,
        reason: "your sign-in has expired",
        next: "Sign out and in again, then paste the key once more.",
        retryable: false,
      });
      setState("failed");
      return;
    }

    try {
      const answer = await connectAction(token, fields);
      setResult(answer);
      setState(answer.ok ? "done" : "failed");
      if (answer.ok) setFields(EMPTY);
      else setFields({ ...fields, secretKey: "", passphrase: "" });
    } catch {
      setResult({
        ok: false,
        reason: "the server could not be reached",
        next: "Check your connection and try again. Nothing was stored.",
        retryable: true,
      });
      setState("failed");
    }
  };

  if (state === "done" && result?.ok) {
    return (
      <div className="border-t border-bone/15 pt-10">
        <Label>key accepted</Label>
        <h2 className="mt-5 max-w-[18ch] font-display text-[clamp(1.8rem,4.4vw,3rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-bone">
          One read, and it answered.
        </h2>
        <dl className="mt-8 font-mono text-[12px]">
          <Line label="account" value={result.uid ?? "not reported by Bitget"} />
          <Line label="equity" value={`${num(result.equityUsdt, 2)} USDT`} />
          <Line label="positions" value={String(result.positions)} />
        </dl>
        <p className="mt-8 max-w-[54ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/70">
          Nothing was placed, changed or cancelled, and nothing ever will be: the key is held
          under a read-only surface that refuses every write before it reaches Bitget.
        </p>
        <Link
          href="/account"
          className="group mt-9 inline-flex items-center gap-3 rounded-[8px] border border-bone/35 px-7 py-3.5 font-mono text-[11px] uppercase tracking-[0.2em] text-bone transition-colors duration-300 hover:border-bone hover:bg-bone hover:text-ground"
        >
          go to your shelf
          <span aria-hidden className="inline-block transition-transform duration-500 group-hover:translate-x-1">
            &rarr;
          </span>
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="border-t border-bone/15 pt-10"
    >
      <div className="grid max-w-[46rem] gap-x-10 gap-y-8 md:grid-cols-2">
        <Field
          label="label"
          hint="your name for this key, so you can tell it from the next one"
          value={fields.label}
          onChange={(value) => {
            setFields({ ...fields, label: value });
          }}
          maxLength={40}
        />
        <Field
          label="api key"
          value={fields.apiKey}
          onChange={(value) => {
            setFields({ ...fields, apiKey: value });
          }}
          maxLength={128}
        />
        <Field
          label="secret key"
          secret
          value={fields.secretKey}
          onChange={(value) => {
            setFields({ ...fields, secretKey: value });
          }}
          maxLength={128}
        />
        <Field
          label="passphrase"
          secret
          value={fields.passphrase}
          onChange={(value) => {
            setFields({ ...fields, passphrase: value });
          }}
          maxLength={128}
        />
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-6">
        <button
          type="submit"
          disabled={state === "checking"}
          className="rounded-[8px] border border-bone/35 px-7 py-3.5 font-mono text-[11px] uppercase tracking-[0.2em] text-bone transition-colors duration-300 hover:border-bone hover:bg-bone hover:text-ground disabled:cursor-wait disabled:border-bone/20 disabled:text-bone/40 disabled:hover:bg-transparent"
        >
          {state === "checking" ? "checking your key" : "connect this key"}
        </button>
        <span className="flex items-center gap-3 font-mono text-[10px] uppercase leading-relaxed tracking-[0.16em] text-bone/35">
          {state === "checking" ? (
            <>
              <span aria-hidden className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-dawn" />
              checking your key with one read
            </>
          ) : (
            "one read: your balances and your open positions, nothing else"
          )}
        </span>
      </div>

      {state === "failed" && result && !result.ok ? (
        <div className="mt-12 border-l-2 border-dawn pl-5" aria-live="polite">
          <Label className="text-dawn">that key was not stored</Label>
          <p className="mt-3 max-w-[60ch] font-mono text-[12px] leading-[1.7] text-bone/85">{result.reason}</p>
          <p className="mt-3 max-w-[60ch] font-body text-[1rem] font-light leading-[1.6] text-bone/60">
            {result.next}
          </p>
        </div>
      ) : null}
    </form>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  secret?: boolean;
  maxLength: number;
}

function Field({ label, value, onChange, hint, secret = false, maxLength }: FieldProps) {
  return (
    <label className="block">
      <Label className="cursor-pointer">{label}</Label>
      {hint === undefined ? null : (
        <span className="mt-2 block font-body text-[0.95rem] font-light leading-[1.5] text-bone/45">{hint}</span>
      )}
      <input
        type={secret ? "password" : "text"}
        value={value}
        maxLength={maxLength}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="mt-3 w-full border-b border-bone/25 bg-transparent py-3 font-mono text-[14px] text-bone outline-none transition-colors duration-300 hover:border-bone/50 focus:border-dawn"
      />
    </label>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5 border-t border-bone/10 py-4 md:grid-cols-[11rem_1fr] md:gap-6">
      <dt className="text-[10px] uppercase tracking-[0.18em] text-bone/30">{label}</dt>
      <dd className="min-w-0 break-all text-bone/75">{value}</dd>
    </div>
  );
}
