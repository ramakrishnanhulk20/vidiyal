import { describe, expect, it } from "vitest";
import { bitgetAccountReader, clipToHistory, MAX_HISTORY_MS } from "../../src/ingest/account.js";
import { AccountReviewError, reviewAccount } from "../../src/review/account-review.js";
import { NoNewsFeed } from "../../src/review/context.js";
import { SilentJudge } from "../../src/review/judge.js";
import type { BitgetCredentials } from "../../src/vendor/tenant/credentials.js";
import { fakeBitget, fixtureData } from "../support/fake-bitget.js";
import { cursorAfter, fakeAccount, writeCalls } from "./fake-account.js";

// A review of one trader's own account, driven through a stand-in Bitget built from the
// fixtures in test/fixtures/account. It covers the connection check failing, the cursor
// walk, the 90 day clip, the bundle that comes out and the promise that nothing is
// written. It does NOT cover a live Bitget account (no read-only key exists yet), the
// news feed or a real reasoning judge, both of which are replaced here, and it does not
// check that the fixtures still match what Bitget serves now.

const RAW_CANDLES = fixtureData<unknown[]>("candles-tsla-15m.json");
const RAW_FUNDING = fixtureData<{ resultList: Array<Record<string, string>> }>("funding-btcusdt.json");

/** Obviously not a real key: a secrets sweep should never have to stop and look. */
const CREDS: BitgetCredentials = {
  apiKey: "fixture-api-key",
  secretKey: "fixture-secret-key",
  passphrase: "fixture-passphrase",
};

const ACCOUNT_ID = "fixture-account";

/** The window the fixture fills and the recorded candles both sit in. */
const RANGE = { fromTs: 1_788_400_000_000, toTs: 1_788_600_000_000 };

function market() {
  return fakeBitget({ candlesHistory: () => RAW_CANDLES, fundingRateHistory: () => RAW_FUNDING });
}

function input(over: { surface: ReturnType<typeof fakeAccount>; range?: { fromTs: number; toTs: number }; log?: (line: string) => void }) {
  return {
    creds: CREDS,
    accountId: ACCOUNT_ID,
    range: over.range ?? RANGE,
    cacheDir: "test-news-cache",
    judge: new SilentJudge(),
    news: new NoNewsFeed(),
    log: over.log ?? (() => {}),
    surface: over.surface,
    market: market(),
  };
}

describe("reviewAccount", () => {
  it("refuses before it reads anything when Bitget will not answer for the key", async () => {
    const surface = fakeAccount({ sectionErrors: { assets: "40001 apikey does not exist" } });

    await expect(reviewAccount(input({ surface }))).rejects.toBeInstanceOf(AccountReviewError);
    await expect(reviewAccount(input({ surface }))).rejects.toThrow(/does not recognise that API key/);
    expect(surface.calls.every((call) => call.tool === "account_overview")).toBe(true);
  });

  it("pages the fill history with the cursor until Bitget runs out of rows", async () => {
    const surface = fakeAccount();
    const fills = await bitgetAccountReader(surface, ACCOUNT_ID).fills(RANGE);

    // The first call carries no cursor and each one after it carries the id off the last
    // row of the page before, which is the walk Bitget documents.
    const sent = surface.calls.filter(
      (call) => call.args["action"] === "fills" && call.args["category"] === "USDT-FUTURES",
    );
    expect(sent.map((call) => call.args["cursor"])).toEqual([
      undefined,
      cursorAfter(0),
      cursorAfter(1),
      cursorAfter(2),
    ]);
    expect(fills).toHaveLength(5);
    expect(fills.map((fill) => fill.id)).toEqual([
      `${ACCOUNT_ID}:1201000001`,
      `${ACCOUNT_ID}:1201000002`,
      `${ACCOUNT_ID}:1201000003`,
      `${ACCOUNT_ID}:1201000004`,
      `${ACCOUNT_ID}:1201000005`,
    ]);
    // The fee comes back positive out of a feeDetail list that writes it negative.
    expect(fills[0]!.feeUsdt).toBeCloseTo(0.4574, 10);
  });

  it("clips a year long request to the 90 days Bitget serves and says so", async () => {
    const now = Date.now();
    const asked = { fromTs: now - 365 * 24 * 60 * 60 * 1000, toTs: now };
    const lines: string[] = [];

    const result = await reviewAccount(input({ surface: fakeAccount(), range: asked, log: (line) => lines.push(line) }));

    expect(result.bundle.range.fromTs).toBeGreaterThanOrEqual(now - MAX_HISTORY_MS);
    expect(result.bundle.range.fromTs - (now - MAX_HISTORY_MS)).toBeLessThan(60_000);
    expect(lines.some((line) => line.includes("90 days"))).toBe(true);
    // The same five fills are served for each 30 day window, and each one is counted once.
    expect(result.fills).toBe(5);
    expect(clipToHistory(asked, now).clipped).toBe(true);
    expect(clipToHistory({ fromTs: now - 1000, toTs: now }, now).clipped).toBe(false);
  });

  it("builds a graded bundle from the account's own fills", async () => {
    const surface = fakeAccount();

    const result = await reviewAccount(input({ surface }));
    const { bundle } = result;

    expect(bundle.source).toEqual({ kind: "account", accountId: ACCOUNT_ID });
    expect(result.readOnly).toBe(true);
    expect(result.fills).toBe(5);
    expect(result.skipped).toEqual([]);
    expect(bundle.graded).toHaveLength(3);

    const first = bundle.graded[0]!;
    expect(first.trade.symbol).toBe("TSLAUSDT");
    expect(first.trade.grossPnl).toBeCloseTo(-13.32, 6);
    expect(first.scores.total).toBeGreaterThan(0);
    expect(first.scores.evidence.length).toBeGreaterThan(0);
    // No recorded book exists for an account, so the two book fields stay null and the
    // rubric skips them rather than guessing.
    expect(first.context.spreadAtEntryBps).toBeNull();
    expect(first.context.bookShareAtEntry).toBeNull();
    expect(first.scores.evidence.some((line) => line.includes("median size"))).toBe(true);

    expect(bundle.graded.at(-1)!.trade.exitTs).toBeNull();
    expect(bundle.equityCurve.length).toBeGreaterThan(0);
    expect(bundle.checklist.length).toBe(bundle.patterns.length);
  });

  it("never sends a write to Bitget while reviewing", async () => {
    const surface = fakeAccount();

    await reviewAccount(input({ surface }));

    expect(writeCalls(surface)).toEqual([]);
    expect(surface.calls.map((call) => String(call.args["action"] ?? "overview")).sort()).not.toContain("place");
    expect(new Set(surface.calls.map((call) => call.tool))).toEqual(
      new Set(["account_overview", "order", "funds_records"]),
    );
  });
});
