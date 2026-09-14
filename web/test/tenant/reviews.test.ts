import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReviewBundle } from "../../../src/ask/types";
import { AccountReviewError, type AccountReviewResult } from "../../../src/review/account-review";
import type { checkConnection } from "../../../src/vendor/tenant/credentials";
import { upsertUser } from "../../lib/tenant/auth";
import { connect } from "../../lib/tenant/connections";
import { getReview, listReviews, reviewNow, type AccountReviewRunner } from "../../lib/tenant/reviews";
import { freshDatabase, TEST_SEAL_KEY, type Harness } from "./harness";

// Reviewing a connected account: what is stored, what is handed back twice, what is refused,
// and what a trader is told when Bitget will not answer. It does not cover the engine itself.
// reviewAccount is replaced here, so nothing in this file reads Bitget, grades a trade or
// calls a model: the pairing, the rubric and the detectors have their own tests beside the
// engine. It also does not cover the ten minute and one hour windows expiring, because both
// are measured by the database clock and a test that waited for them would take an hour.

const USER = "did:privy:trader-one";

const KEY = {
  label: "my main account",
  apiKey: "bg-api-key-000001",
  secretKey: "bg-secret-key-000001",
  passphrase: "bg-passphrase-1",
};

/** The sentence Bitget's classic-mode refusal turns into, seen live on 14 September 2026. */
const CLASSIC =
  "This Bitget account is in Classic mode. Vidiyal reads through the Unified Trading Account API, so switch the account to UTA in the Bitget app (Assets, Unified Trading Account, upgrade), create the read-only key again, and connect once more.";

function accepts(uid: string): typeof checkConnection {
  return async () => ({ ok: true, uid, equityUsdt: 1000, positions: 1, checkedAt: Date.UTC(2026, 8, 14) });
}

function bundle(accountId: string): ReviewBundle {
  return {
    source: { kind: "account", accountId },
    range: { fromTs: Date.UTC(2026, 5, 16), toTs: Date.UTC(2026, 8, 14) },
    graded: [],
    patterns: [],
    checklist: [],
    equityCurve: [{ ts: Date.UTC(2026, 8, 14), equity: 1000 }],
  };
}

/** A stand-in engine that answers at once and counts how many times it was asked. */
function fakeEngine(): { run: AccountReviewRunner; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    run: async (input): Promise<AccountReviewResult> => {
      calls += 1;
      return {
        bundle: bundle(input.accountId),
        check: { ok: true, uid: input.accountId, equityUsdt: 1000, positions: 1, checkedAt: Date.now() },
        fills: 12,
        skipped: [],
        generatedAt: Date.now(),
        readOnly: true,
      };
    },
  };
}

async function connectKey(uid: string): Promise<string> {
  const result = await connect(USER, { ...KEY, label: `key ${uid}` }, { check: accepts(uid) });
  if (!result.ok) throw new Error(`the key should have been stored: ${result.reason}`);
  return result.connectionId;
}

describe("reviewNow", () => {
  let harness: Harness;

  beforeEach(async () => {
    process.env.KAAVAL_KEY_SEAL_HEX = TEST_SEAL_KEY;
    harness = await freshDatabase();
    await upsertUser(harness.db, USER);
  });

  afterEach(async () => {
    await harness.close();
    delete process.env.KAAVAL_KEY_SEAL_HEX;
  });

  it("stores the bundle whole, with an audit line, and reads it back as the desk sees it", async () => {
    const connectionId = await connectKey("8812345");
    const engine = fakeEngine();

    const outcome = await reviewNow(USER, connectionId, undefined, { run: engine.run });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error(outcome.reason);

    const stored = await getReview(USER, outcome.reviewId);
    expect(stored?.record.bundle.source).toEqual({ kind: "account", accountId: "8812345" });
    expect(stored?.record.verification.fills).toBe(12);
    expect(stored?.record.detectorsRun?.length).toBeGreaterThan(0);
    expect(stored?.uid).toBe("8812345");

    const listed = await listReviews(USER);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.trips).toBe(0);
    expect(JSON.stringify(listed)).not.toContain(KEY.secretKey);

    const audits = await harness.db.query<{ kind: string }>("select kind from audit order by id");
    expect(audits.rows.map((entry) => entry.kind)).toEqual(["connection.created", "review.created"]);
  });

  it("hands back the review it already has rather than reading Bitget twice", async () => {
    const connectionId = await connectKey("8812345");
    const engine = fakeEngine();

    const first = await reviewNow(USER, connectionId, undefined, { run: engine.run });
    const second = await reviewNow(USER, connectionId, undefined, { run: engine.run });

    if (!first.ok || !second.ok) throw new Error("both should have answered with a review");
    expect(second.reviewId).toBe(first.reviewId);
    expect(second.reused).toBe(true);
    expect(engine.calls()).toBe(1);

    const { rows } = await harness.db.query("select id from reviews");
    expect(rows).toHaveLength(1);
  });

  it("stops at six reviews in an hour and says when the next one is free", async () => {
    const engine = fakeEngine();
    for (let i = 0; i < 6; i += 1) {
      const connectionId = await connectKey(`88123${String(i)}`);
      const done = await reviewNow(USER, connectionId, undefined, { run: engine.run });
      expect(done.ok).toBe(true);
    }

    const seventh = await connectKey("8812399");
    const refused = await reviewNow(USER, seventh, undefined, { run: engine.run });

    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("the seventh review should have been refused");
    expect(refused.reason).toMatch(/6 reviews in an hour/);
    expect(refused.next).toMatch(/free in about/);
    expect(refused.retryAfterMs).toBeGreaterThan(0);
    expect(engine.calls()).toBe(6);
  });

  it("passes on the Classic mode refusal in Bitget's own terms, and stores nothing", async () => {
    const connectionId = await connectKey("8812345");
    const run: AccountReviewRunner = async () => {
      throw new AccountReviewError(CLASSIC, false);
    };

    const outcome = await reviewNow(USER, connectionId, undefined, { run });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("a classic-mode account cannot be reviewed");
    expect(outcome.reason).toBe(CLASSIC);
    expect(outcome.next).toMatch(/connect again once the upgrade is done/);
    expect(outcome.retryAfterMs).toBeNull();

    const { rows } = await harness.db.query("select id from reviews");
    expect(rows).toHaveLength(0);
  });

  it("refuses a connection that is not this trader's, without running the engine", async () => {
    const connectionId = await connectKey("8812345");
    const engine = fakeEngine();

    const outcome = await reviewNow("did:privy:trader-two", connectionId, undefined, { run: engine.run });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("another trader's key is not reviewable");
    expect(outcome.reason).toMatch(/not on your account/);
    expect(engine.calls()).toBe(0);
  });

  it("refuses a range that runs backwards before it opens a key", async () => {
    const connectionId = await connectKey("8812345");
    const engine = fakeEngine();
    const backwards = { fromTs: Date.UTC(2026, 8, 14), toTs: Date.UTC(2026, 5, 16) };

    const outcome = await reviewNow(USER, connectionId, backwards, { run: engine.run });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("that range cannot be reviewed");
    expect(outcome.reason).toMatch(/after its end/);
    expect(engine.calls()).toBe(0);
  });
});
