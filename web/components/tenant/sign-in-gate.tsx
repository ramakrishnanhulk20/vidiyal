"use client";

// Copied from kaaval/web/components/tenant/SignInGate.tsx on 2026-09-14; edit there first.
// Only the palette and the wording are different.

import { usePrivy } from "@privy-io/react-auth";
import { Label } from "@/components/editorial";

/**
 * Nothing on an account screen renders until Privy has answered who this is.
 *
 * The three states are all shown rather than guessed at: still starting up, signed out,
 * and signed in. The token itself is never rendered and never put in a link.
 */
export function SignInGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, logout, user } = usePrivy();

  if (!ready) {
    return (
      <p className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-bone/40 md:text-[11px]">
        <span aria-hidden className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-dawn" />
        starting sign-in
      </p>
    );
  }

  if (!authenticated) {
    return (
      <div className="border-t border-bone/15 pt-10">
        <p className="max-w-[54ch] font-body text-[1.05rem] font-light leading-[1.6] text-bone/70">
          Sign in first, with a code sent to your email. We keep your sign-in and your key, and
          nothing else about you.
        </p>
        <button
          type="button"
          onClick={() => {
            login();
          }}
          className="mt-8 rounded-[8px] border border-bone/35 px-7 py-3.5 font-mono text-[11px] uppercase tracking-[0.2em] text-bone transition-colors duration-300 hover:border-bone hover:bg-bone hover:text-ground"
        >
          sign in
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-y border-bone/12 py-4">
        <Label className="min-w-0 break-all">signed in as {who(user)}</Label>
        <button
          type="button"
          onClick={() => {
            void logout();
          }}
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-bone/40 transition-colors duration-300 hover:text-dawn md:text-[11px]"
        >
          sign out
        </button>
      </div>
      <div className="mt-12">{children}</div>
    </div>
  );
}

/** The friendliest name Privy has for this trader, and never the DID on its own if better exists. */
function who(user: ReturnType<typeof usePrivy>["user"]): string {
  if (!user) return "this browser";
  return (
    user.email?.address ??
    user.google?.email ??
    (user.twitter?.username === undefined || user.twitter.username === null
      ? undefined
      : `@${user.twitter.username}`) ??
    user.id
  );
}
