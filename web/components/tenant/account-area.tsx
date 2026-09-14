"use client";

// Copied from kaaval/web/components/tenant/AccountArea.tsx on 2026-09-14; edit there first.
// What a key does here is a review of the last 90 days rather than a plan for tonight.

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { accountAction, removeAction, reviewAction, type AccountActionResult } from "@/app/(tenant)/actions";
import { Label } from "@/components/editorial";
import { num, utcDay, utcStamp } from "@/lib/format";
import type { ConnectionRow } from "@/lib/tenant/connections";
import type { ReviewRow } from "@/lib/tenant/reviews";

/**
 * The trader's own keys and every review read through them.
 *
 * Every number here is read from the database for this signed-in trader at the moment the
 * page loads. There is no seeded list and no placeholder row: an account with nothing
 * connected says so.
 */

type Busy = { kind: "review" | "remove"; connectionId: string } | null;

type GetToken = () => Promise<string | null>;

const EXPIRED = {
  reason: "your sign-in has expired",
  next: "Sign out and in again, and your shelf comes back.",
};

/** One read of this trader's keys and reviews, with no state of its own. */
async function readAccount(getAccessToken: GetToken): Promise<AccountActionResult> {
  const token = await getAccessToken();
  if (token === null) return { ok: false, ...EXPIRED };
  return await accountAction(token);
}

export function AccountArea() {
  const { getAccessToken } = usePrivy();
  const [data, setData] = useState<AccountActionResult | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string; next?: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setData(await readAccount(getAccessToken));
  }, [getAccessToken]);

  // The read needs a token that only exists in this browser, so it happens here rather than
  // on the server. The answer is applied in the callback, and dropped if the trader has
  // already left the page.
  useEffect(() => {
    let alive = true;
    void readAccount(getAccessToken).then((answer) => {
      if (alive) setData(answer);
    });
    return () => {
      alive = false;
    };
  }, [getAccessToken]);

  const review = async (connectionId: string): Promise<void> => {
    setBusy({ kind: "review", connectionId });
    setMessage(null);
    const token = await getAccessToken();
    if (token === null) {
      setMessage({ tone: "bad", text: EXPIRED.reason, next: EXPIRED.next });
      setBusy(null);
      return;
    }
    const answer = await reviewAction(token, connectionId);
    setBusy(null);
    if (answer.ok) {
      setMessage({
        tone: "good",
        text: answer.reused
          ? "That account was read in the last ten minutes, so this is the same review."
          : "Your shelf is ready.",
      });
      await load();
    } else {
      setMessage({ tone: "bad", text: answer.reason, next: answer.next });
    }
  };

  const remove = async (connectionId: string): Promise<void> => {
    setBusy({ kind: "remove", connectionId });
    setMessage(null);
    const token = await getAccessToken();
    if (token === null) {
      setMessage({ tone: "bad", text: EXPIRED.reason, next: EXPIRED.next });
      setBusy(null);
      return;
    }
    const answer = await removeAction(token, connectionId);
    setBusy(null);
    setConfirming(null);
    if (answer.ok) {
      setMessage({ tone: "good", text: "That key and every review read with it are gone." });
      await load();
    } else {
      setMessage({ tone: "bad", text: answer.reason, next: answer.next });
    }
  };

  if (data === null) {
    return (
      <p className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-bone/40 md:text-[11px]">
        <span aria-hidden className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-dawn" />
        reading your account
      </p>
    );
  }

  if (!data.ok) {
    return (
      <div className="border-l-2 border-dawn pl-5">
        <Label className="text-dawn">this did not load</Label>
        <p className="mt-3 max-w-[60ch] font-mono text-[12px] leading-[1.7] text-bone/85">{data.reason}</p>
        <p className="mt-3 max-w-[60ch] font-body text-[1rem] font-light leading-[1.6] text-bone/60">{data.next}</p>
        <button
          type="button"
          onClick={() => {
            setData(null);
            void load();
          }}
          className="mt-6 font-mono text-[10px] uppercase tracking-[0.2em] text-bone/40 transition-colors duration-300 hover:text-dawn md:text-[11px]"
        >
          try again
        </button>
      </div>
    );
  }

  return (
    <div>
      {message === null ? null : (
        <div
          className={`mb-12 border-l-2 pl-5 ${message.tone === "good" ? "border-bone/40" : "border-dawn"}`}
          aria-live="polite"
        >
          <p className={`font-mono text-[12px] leading-[1.7] ${message.tone === "good" ? "text-bone/80" : "text-dawn"}`}>
            {message.text}
          </p>
          {message.next === undefined ? null : (
            <p className="mt-3 max-w-[60ch] font-body text-[1rem] font-light leading-[1.6] text-bone/60">
              {message.next}
            </p>
          )}
        </div>
      )}

      <Label>your keys</Label>

      {data.connections.length === 0 ? (
        <p className="mt-6 max-w-[56ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/60">
          Nothing connected yet.{" "}
          <Link href="/connect" className="text-dawn underline-offset-4 hover:underline">
            Connect a read-only key
          </Link>{" "}
          and Vidiyal will read your last 90 days.
        </p>
      ) : (
        <ul className="mt-8">
          {data.connections.map((connection) => (
            <li key={connection.id} className="border-t border-bone/12 py-10">
              <ConnectionCard
                connection={connection}
                reviews={data.reviews.filter((row) => row.connectionId === connection.id)}
                busy={busy}
                confirming={confirming === connection.id}
                onReview={() => {
                  void review(connection.id);
                }}
                onAskRemove={() => {
                  setConfirming(confirming === connection.id ? null : connection.id);
                }}
                onRemove={() => {
                  void remove(connection.id);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <Label className="mt-24">every review so far</Label>
      {data.reviews.length === 0 ? (
        <p className="mt-6 max-w-[56ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/60">
          No account has been read yet. A review takes about a minute and reads nothing but your
          own fills, orders and balances.
        </p>
      ) : (
        <ul className="mt-8">
          {data.reviews.map((row) => (
            <li key={row.id} className="border-t border-bone/12">
              <ReviewLine row={row} />
            </li>
          ))}
          <li className="border-t border-bone/12" />
        </ul>
      )}
    </div>
  );
}

function ReviewLine({ row }: { row: ReviewRow }) {
  return (
    <Link
      href={`/account/reviews/${row.id}`}
      className="group grid gap-2 py-5 font-mono text-[11.5px] transition-colors duration-300 hover:text-dawn md:grid-cols-[13rem_1fr_auto] md:items-baseline md:gap-8"
    >
      <span className="text-bone/75">{utcStamp(new Date(row.generatedAt).getTime())}</span>
      <span className="min-w-0 break-words text-bone/45">
        {utcDay(new Date(row.rangeFrom).getTime())} to {utcDay(new Date(row.rangeTo).getTime())}
        <span className="mx-2.5 text-bone/20">&middot;</span>
        {row.label}
      </span>
      <span className="text-bone/55">
        {row.trips} {row.trips === 1 ? "round trip" : "round trips"}
        <span className="mx-2.5 text-bone/20">&middot;</span>
        {row.patterns} {row.patterns === 1 ? "pattern" : "patterns"}
        <span className="mx-2.5 text-bone/20">&middot;</span>
        {row.items} {row.items === 1 ? "item" : "items"}
      </span>
    </Link>
  );
}

interface CardProps {
  connection: ConnectionRow;
  reviews: ReviewRow[];
  busy: Busy;
  confirming: boolean;
  onReview: () => void;
  onAskRemove: () => void;
  onRemove: () => void;
}

function ConnectionCard({ connection, reviews, busy, confirming, onReview, onAskRemove, onRemove }: CardProps) {
  const reviewing = busy?.kind === "review" && busy.connectionId === connection.id;
  const removing = busy?.kind === "remove" && busy.connectionId === connection.id;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
        <h3 className="min-w-0 font-display text-[clamp(1.5rem,3vw,2.1rem)] font-semibold break-words tracking-[-0.03em] text-bone">
          {connection.label}
        </h3>
        <span className="font-mono text-[11px] tracking-[0.14em] text-bone/40">
          {connection.status === "ok" ? "reading fine" : connection.status}
          <span className="mx-2.5 text-bone/20">&middot;</span>
          {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
        </span>
      </div>

      <dl className="mt-6 font-mono text-[12px]">
        <Line label="account" value={connection.uid ?? "not reported by Bitget"} />
        <Line
          label="equity"
          value={connection.equityUsdt === null ? "not read yet" : `${num(connection.equityUsdt, 2)} USDT`}
        />
        <Line label="positions" value={connection.positions === null ? "not read yet" : String(connection.positions)} />
        <Line
          label="last read"
          value={connection.checkedAt === null ? "never" : utcStamp(new Date(connection.checkedAt).getTime())}
        />
      </dl>

      <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
        <button
          type="button"
          onClick={onReview}
          disabled={reviewing || removing}
          className="rounded-[8px] border border-bone/35 px-7 py-3.5 font-mono text-[11px] uppercase tracking-[0.2em] text-bone transition-colors duration-300 hover:border-bone hover:bg-bone hover:text-ground disabled:cursor-wait disabled:border-bone/20 disabled:text-bone/40 disabled:hover:bg-transparent"
        >
          {reviewing ? "reading" : "review my trades"}
        </button>

        {reviewing ? (
          <span className="flex items-center gap-3 font-mono text-[10px] uppercase leading-relaxed tracking-[0.16em] text-bone/40">
            <span aria-hidden className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-dawn" />
            reading your last 90 days from Bitget, about a minute
          </span>
        ) : confirming ? (
          <span className="flex flex-wrap items-center gap-5 font-mono text-[10px] uppercase tracking-[0.16em] text-dawn md:text-[11px]">
            remove this key and its reviews?
            <button
              type="button"
              onClick={onRemove}
              disabled={removing}
              className="rounded-[8px] border border-dawn px-5 py-2.5 transition-colors duration-300 hover:bg-dawn hover:text-ground disabled:cursor-wait"
            >
              {removing ? "removing" : "yes, remove"}
            </button>
            <button
              type="button"
              onClick={onAskRemove}
              className="text-bone/40 transition-colors duration-300 hover:text-bone"
            >
              keep it
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={onAskRemove}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-bone/35 transition-colors duration-300 hover:text-dawn md:text-[11px]"
          >
            remove
          </button>
        )}
      </div>
    </div>
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
