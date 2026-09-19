// Copied from kaaval/web/lib/tenant/env.ts on 2026-09-14; edit there first. Two of Kaaval's
// settings are left out here because Vidiyal has nothing that reads them: the plan signing
// key and the ensemble run count both belong to a plan, and this app reviews a record
// instead of planning a night.

import { z } from "zod";

/**
 * The settings this layer needs, and an honest answer about what is missing.
 *
 * Two different failures are treated differently on purpose. A value that is not set at
 * all is a host that has not been configured yet, and the screens say so in words a
 * trader can read instead of showing a stack trace. A value that is set but malformed is
 * a mistake somebody made in a deploy, and that throws the moment this module loads, so
 * it is found at boot rather than in the middle of a trader pasting their key.
 */

const nonEmpty = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is set but empty`)
    .optional();

const schema = z.object({
  NEXT_PUBLIC_PRIVY_APP_ID: nonEmpty("the Privy app id"),
  PRIVY_APP_SECRET: nonEmpty("the Privy app secret"),
  DATABASE_URL: z
    .string()
    .trim()
    .refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL must be a postgres connection string, the one the database console gives you",
    )
    .optional(),
  // Named for Kaaval and kept that way on purpose: both apps seal a trader's Bitget key
  // under the same server key, so a key connected in one can be opened by the other.
  KAAVAL_KEY_SEAL_HEX: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/, "KAAVAL_KEY_SEAL_HEX must be exactly 64 hex characters, which is 32 bytes")
    .optional(),
  ANTHROPIC_API_KEY: nonEmpty("the Anthropic key"),
  QWEN_API_KEY: nonEmpty("the Qwen key"),
});

export interface TenantEnv {
  privyAppId: string | null;
  privyAppSecret: string | null;
  databaseUrl: string | null;
  sealKeyHex: string | null;
  anthropicKey: string | null;
  qwenKey: string | null;
}

export class TenantEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantEnvError";
  }
}

/**
 * Reads the settings out of one environment, whichever one is handed in.
 *
 * source is a parameter so this can be checked against a made-up environment in a test
 * without writing to the real one, which would leak into every test that runs after it.
 */
export function parseTenantEnv(source: Record<string, string | undefined> = process.env): TenantEnv {
  const blanked: Record<string, string | undefined> = {};
  for (const key of Object.keys(schema.shape)) {
    const value = source[key];
    // An unset value and a value of "" mean the same thing to a deploy panel, so both are
    // read as "not configured" rather than one of them failing validation.
    blanked[key] = value === undefined || value.trim() === "" ? undefined : value;
  }

  const parsed = schema.safeParse(blanked);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new TenantEnvError(first ? first.message : "a setting for the account area is malformed");
  }

  const data = parsed.data;
  return {
    privyAppId: data.NEXT_PUBLIC_PRIVY_APP_ID ?? null,
    privyAppSecret: data.PRIVY_APP_SECRET ?? null,
    databaseUrl: data.DATABASE_URL ?? null,
    sealKeyHex: data.KAAVAL_KEY_SEAL_HEX ?? null,
    anthropicKey: data.ANTHROPIC_API_KEY ?? null,
    qwenKey: data.QWEN_API_KEY ?? null,
  };
}

// Validated at boot: a malformed setting throws here, before a single page renders.
parseTenantEnv();

/**
 * The settings as they are right now.
 *
 * Read every time rather than cached at import, because the answer decides what a screen
 * says about itself, and a host that gains a database should not have to be restarted
 * twice before the screens agree.
 */
export function tenantEnv(): TenantEnv {
  return parseTenantEnv();
}

export interface TenantStatus {
  /** True when a trader can sign in, connect a key and get a review on this host. */
  ready: boolean;
  signIn: boolean;
  database: boolean;
  sealing: boolean;
  /** The judge reads a trader's own note only when the model key is set. */
  models: boolean;
  missing: string[];
}

/** What is configured on this host and what is not, in the names a deploy panel uses. */
export function tenantConfigured(env: TenantEnv = tenantEnv()): TenantStatus {
  const missing: string[] = [];
  if (env.privyAppId === null) missing.push("NEXT_PUBLIC_PRIVY_APP_ID");
  if (env.privyAppSecret === null) missing.push("PRIVY_APP_SECRET");
  if (env.databaseUrl === null) missing.push("DATABASE_URL");
  if (env.sealKeyHex === null) missing.push("KAAVAL_KEY_SEAL_HEX");

  return {
    ready: missing.length === 0,
    signIn: env.privyAppId !== null && env.privyAppSecret !== null,
    database: env.databaseUrl !== null,
    sealing: env.sealKeyHex !== null,
    models: env.qwenKey !== null || env.anthropicKey !== null,
    missing,
  };
}

/** The one setting the browser is allowed to see, read the way Next inlines it. */
export function publicPrivyAppId(): string | null {
  const value = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  return value === undefined || value.trim() === "" ? null : value.trim();
}
