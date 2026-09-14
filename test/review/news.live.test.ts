// Hits the real SEC EDGAR search, so it runs only with LIVE=1 in the environment. It
// checks that the vendored feed and the provider's window really do return a filing that
// exists, never how many or what they say. Does NOT cover GDELT, which answers 429 to a
// machine that has asked recently, or Finnhub, which needs a key.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { newsProvider } from "../../src/review/news.js";

const live = process.env["LIVE"] === "1";
const TIMEOUT_MS = 60_000;

/**
 * Tesla filed an 8-K on 2026-07-22. EDGAR's search index publishes a date and no clock
 * time, so the filing is stamped at midnight UTC and a trade at 04:00 that morning is
 * the one whose six hour window holds it.
 */
const TRADE_TS = Date.UTC(2026, 6, 22, 4, 0, 0);

describe.runIf(live)("newsProvider against the live SEC", () => {
  it(
    "finds the 8-K that was filed in the window around a trade",
    async () => {
      const cacheDir = mkdtempSync(join(tmpdir(), "vidiyal-news-"));
      const lines: string[] = [];

      const near = await newsProvider(cacheDir, (line) => lines.push(line)).eventsNear(
        TRADE_TS,
        "RTSLAUSDT",
      );

      expect(near.length).toBeGreaterThan(0);
      expect(near.some((item) => item.title.includes("8-K"))).toBe(true);
      expect(lines.join(" ")).toContain("for TSLA around");
    },
    TIMEOUT_MS,
  );
});
