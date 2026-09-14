// Hits the real Bitget public API, so it runs only with LIVE=1 in the environment. It
// checks shapes and the pass or fail wiring, never values: divergence and spreads move,
// and a test that asserts a number here is a test that fails at random. Does NOT cover:
// private account reads, order placement, or the review pipeline that feeds the items.
import { describe, expect, it } from "vitest";
import { checkIdea } from "../../src/checklist/gate.js";
import { itemsFromPatterns } from "../../src/checklist/items.js";
import { createBitget } from "../../src/vendor/bitget/client.js";
import type { Idea, PatternHit } from "../../src/review/types.js";

const live = process.env["LIVE"] === "1";
const TIMEOUT_MS = 60_000;

const IDEA: Idea = {
  category: "SPOT",
  symbol: "RTSLAUSDT",
  side: "buy",
  notionalUsdt: 300,
  note: "live shape check",
};

const HITS: PatternHit[] = [
  { pattern: "chasing-the-gap", description: "", trades: [], evidence: [] },
  { pattern: "fee-bleed", description: "", trades: [], evidence: [] },
  { pattern: "weekend-overexposure", description: "", trades: [], evidence: [] },
];

describe.runIf(live)("checkIdea against the live market", () => {
  const ctx = createBitget();

  it(
    "runs every item against Bitget and reports what it saw",
    async () => {
      const items = itemsFromPatterns(HITS);
      const check = await checkIdea(ctx, IDEA, items, {
        recentTrips: [],
        equity: 10_000,
        netExposureUsdt: 0,
      });

      expect(check.results).toHaveLength(items.length);
      for (const result of check.results) {
        expect(typeof result.pass).toBe("boolean");
        expect(result.observed.length).toBeGreaterThan(10);
      }
      expect(check.pass).toBe(check.results.every((r) => r.pass));
      if (check.pass) {
        expect(check.dryRun).not.toBeNull();
        expect(JSON.stringify(check.dryRun)).toContain("RTSLAUSDT");
      } else {
        expect(check.dryRun).toBeNull();
      }
    },
    TIMEOUT_MS,
  );

  it(
    "previews the order through the Agent Hub SDK when the checklist is empty",
    async () => {
      const check = await checkIdea(ctx, IDEA, [], { recentTrips: [], equity: 10_000, netExposureUsdt: 0 });

      expect(check.pass).toBe(true);
      expect(JSON.stringify(check.dryRun)).toContain("RTSLAUSDT");
      expect(check.dryRunNote.length).toBeGreaterThan(10);
    },
    TIMEOUT_MS,
  );
});
