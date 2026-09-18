import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { newsProvider, type NewsSources } from "../../src/review/news.js";
import type { CalendarEvent, NewsItem } from "../../src/vendor/news/types.js";

// The provider's windowing, its symbol to company rule and its one-query-per-hour
// bucket, against a fake feed. It does not cover the vendored sources themselves (they
// are Kaaval's, tested there), the on-disk cache inside them, or what GDELT actually
// answers to a live query. The window test below proves the dates the provider asks for,
// not that GDELT honours a startdatetime and enddatetime pair.

const NOON = Date.UTC(2026, 8, 8, 12, 0, 0);
const HOUR = 60 * 60_000;

function newsAt(ts: number, headline: string): NewsItem {
  return { id: headline, ts, source: "sec-edgar", headline, summary: null, url: null, symbols: ["TSLAUSDT"] };
}

function eventAt(ts: number, title: string): CalendarEvent {
  return { ts, kind: "earnings", title, symbol: "TSLA", timing: "after-close" };
}

interface Ask {
  underlying: string;
  sinceTs: number;
  untilTs: number | undefined;
}

function fakeSources(
  news: NewsItem[],
  calendar: CalendarEvent[] = [],
): NewsSources & { asked: Ask[] } {
  const asked: Ask[] = [];
  return {
    asked,
    gather: async (opts) => {
      asked.push({
        underlying: opts.symbols[0]!.underlying,
        sinceTs: opts.sinceTs,
        untilTs: opts.untilTs,
      });
      return news.filter((item) => item.ts >= opts.sinceTs);
    },
    calendar: async (opts) => calendar.filter((event) => event.ts >= opts.fromTs && event.ts <= opts.toTs),
  };
}

describe("newsProvider", () => {
  it("keeps headlines from six hours before to one hour after the trade", async () => {
    const sources = fakeSources([
      newsAt(NOON - 7 * HOUR, "too old to have moved this trade"),
      newsAt(NOON - 2 * HOUR, "Tesla filed an 8-K with the SEC"),
      newsAt(NOON + 30 * 60_000, "Tesla recalls a batch"),
      newsAt(NOON + 3 * HOUR, "too late to have been read at entry"),
    ]);

    const near = await newsProvider("cache", () => {}, sources).eventsNear(NOON, "TSLAUSDT");

    expect(near.map((item) => item.title)).toEqual([
      "Tesla filed an 8-K with the SEC (sec-edgar)",
      "Tesla recalls a batch (sec-edgar)",
    ]);
  });

  it("keeps a scheduled event later the same day, which is what the rubric asks about", async () => {
    const sources = fakeSources([], [eventAt(NOON + 5 * HOUR, "TSLA reports quarterly results")]);

    const near = await newsProvider("cache", () => {}, sources).eventsNear(NOON, "TSLAUSDT");

    expect(near).toHaveLength(1);
    expect(near[0]!.ts).toBe(NOON + 5 * HOUR);
    expect(near[0]!.title).toContain("TSLA reports quarterly results");
  });

  it("asks about the company, so an rToken and its perpetual share one query", async () => {
    const sources = fakeSources([newsAt(NOON, "Tesla news")]);
    const provider = newsProvider("cache", () => {}, sources);

    await provider.eventsNear(NOON, "RTSLAUSDT");
    await provider.eventsNear(NOON + 60_000, "TSLAUSDT");

    expect(sources.asked).toHaveLength(1);
    expect(sources.asked[0]!.underlying).toBe("TSLA");
  });

  it("queries once per company per hour, because GDELT refuses anything faster", async () => {
    const sources = fakeSources([newsAt(NOON, "Tesla news")]);
    const provider = newsProvider("cache", () => {}, sources);

    await provider.eventsNear(NOON, "TSLAUSDT");
    await provider.eventsNear(NOON + 59 * 60_000, "TSLAUSDT");
    await provider.eventsNear(NOON + HOUR, "TSLAUSDT");

    expect(sources.asked.map((ask) => ask.sinceTs)).toEqual([
      NOON - 6 * HOUR,
      NOON + HOUR - 6 * HOUR,
    ]);
  });

  it("asks for the window the trade happened in, not a timespan running to now", async () => {
    const sources = fakeSources([newsAt(NOON, "Tesla news")]);

    await newsProvider("cache", () => {}, sources).eventsNear(NOON + 45 * 60_000, "TSLAUSDT");

    expect(sources.asked[0]!.sinceTs).toBe(NOON - 6 * HOUR);
    expect(sources.asked[0]!.untilTs).toBe(NOON + 2 * HOUR);
  });

  it("returns nothing rather than a guess when the feed found nothing", async () => {
    const near = await newsProvider("cache", () => {}, fakeSources([])).eventsNear(NOON, "TSLAUSDT");

    expect(near).toEqual([]);
  });
});

describe("newsProvider, the settled store", () => {
  const settledDir = (): string => mkdtempSync(join(tmpdir(), "vidiyal-settled-"));

  it("asks once ever for an hour that closed more than a day ago, across rebuilds", async () => {
    const dir = settledDir();
    const first = fakeSources([newsAt(NOON, "Tesla news")]);
    const second = fakeSources([]);

    const before = await newsProvider("cache", () => {}, first, dir).eventsNear(NOON, "TSLAUSDT");
    const after = await newsProvider("cache", () => {}, second, dir).eventsNear(NOON, "TSLAUSDT");

    expect(first.asked).toHaveLength(1);
    expect(second.asked).toHaveLength(0);
    expect(after).toEqual(before);
  });

  it("asks again for an hour that is still open, because headlines keep arriving", async () => {
    const dir = settledDir();
    const recent = Math.floor(Date.now() / HOUR) * HOUR;
    const first = fakeSources([]);
    const second = fakeSources([]);

    await newsProvider("cache", () => {}, first, dir).eventsNear(recent, "TSLAUSDT");
    await newsProvider("cache", () => {}, second, dir).eventsNear(recent, "TSLAUSDT");

    expect(second.asked).toHaveLength(1);
  });

  it("does not keep a gather in which a source was down, since nothing is not no news", async () => {
    const dir = settledDir();
    const down: NewsSources & { asked: Ask[] } = fakeSources([]);
    const gather = down.gather;
    down.gather = async (opts, log) => {
      log?.('gdelt: "TSLA" failed, skipping it (timeout)');
      return await gather(opts, log);
    };
    const second = fakeSources([newsAt(NOON, "Tesla news")]);

    await newsProvider("cache", () => {}, down, dir).eventsNear(NOON, "TSLAUSDT");
    const after = await newsProvider("cache", () => {}, second, dir).eventsNear(NOON, "TSLAUSDT");

    expect(second.asked).toHaveLength(1);
    expect(after).toHaveLength(1);
  });
});
