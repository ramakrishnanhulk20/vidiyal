"use client";

// Copied from kaaval/web/components/tenant/TenantProviders.tsx on 2026-09-14; edit there
// first. Only the palette and the wording are different.

import { PrivyProvider } from "@privy-io/react-auth";

/**
 * Sign-in for the account area, in the same dawn palette as the rest of the desk.
 *
 * No wallet is created for anybody: Privy is here to say who a trader is, nothing more.
 * The app id is public by design, and the secret that checks a token never leaves the
 * server.
 */
export function TenantProviders({ appId, children }: { appId: string; children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google", "twitter", "passkey"],
        appearance: {
          theme: "#14100d",
          accentColor: "#ff7d55",
          landingHeader: "Sign in to Vidiyal",
          showWalletLoginFirst: false,
        },
        embeddedWallets: { ethereum: { createOnLogin: "off" } },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
