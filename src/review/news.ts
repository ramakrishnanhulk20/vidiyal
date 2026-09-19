import { join } from "node:path";
import { readCache, requestHash, writeCache } from "../vendor/news/cache.js";
import { gatherCalendar, gatherNews } from "../vendor/news/feed.js";
import type { NewsProvider } from "./context.js";

/**
 * The window around an entry that counts as news for it. Six hours back catches the
 * overnight story a trade was reacting to, one hour forward catches the headline that
 * landed while the position was being built.
 */
const BEFORE_MS = 6 * 60 * 60 * 1000;
const AFTER_MS = 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * A bucket whose window closed more than a day ago cannot gain a headline, so its answer
 * is kept on disk and a rebuild pays only for the trades that are new. Before this every
 * rebuild asked GDELT again for every hour ever traded, at eight seconds a question: a
 * record of 47 round trips took nine minutes and the watchdog ended the rebuild before
 * the second brain was reached.
 */
const SETTLED_AFTER_MS = DAY_MS;
const SETTLED_TTL_MS = 365 * DAY_MS;

const REAL_SOURCES: NewsSources = { gather: gatherNews, calendar: gatherCalendar };

/**
 * The two feed functions the provider calls. They are injectable so a test can prove the
 * windowing and the pacing without touching SEC, GDELT or Finnhub.
 */
export interface NewsSources {
  gather: typeof gatherNews;
  calendar: typeof gatherCalendar;
}

interface Gathered {
  news: Array<{ ts: number; title: string }>;
  calendar: Array<{ ts: number; title: string }>;
}

/**
 * Real news and scheduled events around a past trade.
 *
 * Sources are the vendored Kaaval feed: SEC EDGAR and GDELT always, because neither
 * needs a key, and Finnhub for company news and both calendars when FINNHUB_API_KEY is
 * set. A source that is missing or refuses is skipped inside the feed and written to the
 * log, so a review never stops because a news host is down and never invents an event.
 *
 * Every gather is bucketed to the hour of the trade and held in memory for the life of
 * the process, so a record with twelve trips in the same name and the same hour costs
 * one query per source rather than twelve. That bucket is what keeps GDELT to at most
 * one query per underlying per hour: it answers 429 to anything faster and the vendored
 * client then has to sit out twenty seconds.
 *
 * The gather is given the end of the window as well as the start, so GDELT is asked for
 * the hours the trade happened in. Asked instead for a timespan running to now, a trade
 * from last month would come back as last month of headlines sorted newest first, and
 * the day that mattered would never be reached.
 */
export function newsProvider(
  cacheDir: string,
  log: (line: string) => void,
  sources: NewsSources = REAL_SOURCES,
  // Injected sources are a test's, and a test that did not ask for the store must not
  // find another test's answers in it.
  settledDir: string | null = sources === REAL_SOURCES ? join(cacheDir, "settled-buckets") : null,
): NewsProvider {
  const buckets = new Map<string, Promise<Gathered>>();

  const load = async (underlying: string, symbol: string, bucketTs: number): Promise<Gathered> => {
    const settled = Date.now() - (bucketTs + HOUR_MS + AFTER_MS) > SETTLED_AFTER_MS;
    if (settledDir === null || !settled) return await gatherBucket(underlying, symbol, bucketTs, log);

    // Which keyed sources were present is part of the key, so adding a key later asks again
    // instead of serving an answer that was gathered without it.
    const request = {
      underlying,
      bucketTs,
      finnhub: Boolean(process.env["FINNHUB_API_KEY"]),
      asknews: Boolean(process.env["ASKNEWS_API_KEY"]) && process.env["ASKNEWS_HISTORICAL"] === "1",
    };
    const store = { dir: settledDir, ttlMs: SETTLED_TTL_MS };
    const hash = requestHash(request);
    const kept = readCache<Gathered>(store, hash);
    if (kept !== null) return kept;

    // A source that was down answers with nothing, which is not the same as no news. Only
    // a gather every source answered is kept.
    let refused = false;
    const fresh = await gatherBucket(underlying, symbol, bucketTs, (line) => {
      if (line.includes(" failed, skipping")) refused = true;
      log(line);
    });
    if (!refused) writeCache(store, hash, request, fresh);
    return fresh;
  };

  const gatherBucket = async (
    underlying: string,
    symbol: string,
    bucketTs: number,
    log: (line: string) => void,
  ): Promise<Gathered> => {
    const dayStart = Math.floor(bucketTs / DAY_MS) * DAY_MS;
    const [news, calendar] = await Promise.all([
      sources.gather(
        {
          symbols: [{ symbol, underlying }],
          sinceTs: bucketTs - BEFORE_MS,
          // The bucket is an hour wide, so a trade at the end of it still needs its full
          // hour forward inside the window this one query covers.
          untilTs: bucketTs + HOUR_MS + AFTER_MS,
          cacheDir,
        },
        log,
      ),
      sources.calendar({ underlyings: [underlying], fromTs: dayStart, toTs: dayStart + DAY_MS, cacheDir }, log),
    ]);
    log(
      `news: ${news.length} headlines and ${calendar.length} scheduled events for ${underlying} around ${new Date(bucketTs).toISOString()}`,
    );
    return {
      news: news.map((item) => ({ ts: item.ts, title: `${item.headline} (${item.source})` })),
      calendar: calendar.map((event) => ({ ts: event.ts, title: `${event.title} (${event.kind}, ${event.timing})` })),
    };
  };

  return {
    async eventsNear(ts: number, symbol: string): Promise<Array<{ ts: number; title: string }>> {
      const underlying = underlyingOf(symbol);
      const bucketTs = Math.floor(ts / HOUR_MS) * HOUR_MS;
      const key = `${underlying}:${bucketTs}`;
      let pending = buckets.get(key);
      if (!pending) {
        pending = load(underlying, symbol, bucketTs);
        buckets.set(key, pending);
      }

      const gathered = await pending;
      const dayStart = Math.floor(ts / DAY_MS) * DAY_MS;
      return [
        ...gathered.news.filter((item) => item.ts >= ts - BEFORE_MS && item.ts <= ts + AFTER_MS),
        ...gathered.calendar.filter((item) => item.ts >= dayStart && item.ts < dayStart + DAY_MS),
      ].sort((a, b) => a.ts - b.ts);
    },
  };
}

/**
 * The company behind a Bitget symbol. TSLAUSDT and RTSLAUSDT are both Tesla, so both
 * ask the same question of the same sources and share one bucket.
 *
 * The r prefix is stripped on any two to six letter base, which is Bitget's tokenized
 * stock naming. A real ticker that itself begins with R and is listed without the
 * prefix would be read one letter short here; the stock desk this reviews trades
 * rTokens and their perpetuals, where the rule holds.
 */
function underlyingOf(symbol: string): string {
  const base = symbol.toUpperCase().replace(/USDT$/, "");
  return /^R[A-Z]{2,6}$/.test(base) ? base.slice(1) : base;
}
