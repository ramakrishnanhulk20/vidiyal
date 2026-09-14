import {
  BitgetRestClient,
  buildTools,
  loadConfig,
  safeInvoke,
  type ToolContext,
  type ToolSpec,
} from "@bitget-ai/bitget-agent-sdk";
import type { BitgetContext } from "../vendor/bitget/client.js";
import { estimateCost } from "../vendor/bitget/cost.js";
import { divergence } from "../vendor/bitget/divergence.js";
import { nyseClock } from "../vendor/bitget/hours.js";
import { getInstrument, getTicker } from "../vendor/bitget/market.js";
import type { ChecklistItem, Idea, IdeaCheck, RoundTrip } from "../review/types.js";

export interface DeskState {
  recentTrips: RoundTrip[];
  equity: number;
  netExposureUsdt: number;
  now?: Date;
}

const HALF_HOUR_MS = 30 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const WEEK_MS = 7 * DAY_MS;
const WEEKEND_NET_SHARE = 0.4;
const GAP_PCT = 1;
const TURNOVER_MULTIPLE = 5;
const CONCENTRATION_SHARE = 0.5;
const COST_LIMIT_BPS = 20;

/** The rulebook stop distances, from kaaval/docs/rulebook.md under Loss limits. */
const STOP_PCT = { SPOT: 3, "USDT-FUTURES": 2 } as const;

/**
 * A new idea held against the checklist the review produced, then previewed.
 *
 * Every test reads the live market through the same Bitget calls the review used, so an
 * item passes on what the market is doing now, not on what it was doing when the trade
 * that taught us the lesson was made. Nothing here places an order: the only write verb
 * touched is the dry run, which the SDK answers with the request it would have sent.
 */
export async function checkIdea(
  ctx: BitgetContext,
  idea: Idea,
  items: ChecklistItem[],
  state: DeskState,
): Promise<IdeaCheck> {
  if (!Number.isFinite(idea.notionalUsdt) || idea.notionalUsdt <= 0) {
    throw new RangeError(`checkIdea ${idea.symbol}: notionalUsdt must be above zero`);
  }
  if (!Number.isFinite(state.equity) || state.equity <= 0) {
    throw new RangeError(`checkIdea ${idea.symbol}: equity must be above zero to size anything`);
  }

  const now = state.now ?? new Date();
  const ticker = await getTicker(ctx, idea.category, idea.symbol);
  const results: IdeaCheck["results"] = [];

  for (const item of items) {
    results.push({ item, ...(await runTest(ctx, item, idea, state, now, ticker.last)) });
  }

  const pass = results.every((result) => result.pass);
  if (!pass) {
    return {
      idea,
      results,
      pass,
      dryRun: null,
      dryRunNote: `${results.filter((r) => !r.pass).length} of ${results.length} checklist items failed, so no order was built`,
    };
  }

  const preview = await previewOrder(ctx, idea, ticker.last);
  return { idea, results, pass, dryRun: preview.request, dryRunNote: preview.note };
}

async function runTest(
  ctx: BitgetContext,
  item: ChecklistItem,
  idea: Idea,
  state: DeskState,
  now: Date,
  last: number,
): Promise<{ pass: boolean; observed: string }> {
  const openHere = state.recentTrips.filter(
    (trip) => trip.exitTs === null && trip.symbol === idea.symbol && trip.category === idea.category,
  );

  switch (item.test) {
    case "no-reentry-after-loss": {
      const recentLoss = state.recentTrips.find(
        (trip) =>
          trip.symbol === idea.symbol &&
          trip.exitTs !== null &&
          trip.grossPnl !== null &&
          trip.grossPnl < 0 &&
          now.getTime() - trip.exitTs <= HALF_HOUR_MS,
      );
      if (!recentLoss) {
        return { pass: true, observed: `no loss closed in ${idea.symbol} in the last 30 minutes` };
      }
      const minutes = (now.getTime() - recentLoss.exitTs!) / 60_000;
      return {
        pass: false,
        observed: `${recentLoss.id} lost ${Math.abs(recentLoss.grossPnl!).toFixed(2)} USDT ${minutes.toFixed(1)} minutes ago`,
      };
    }

    case "weekend-exposure-under-40": {
      const clock = nyseClock(now);
      const shutFor = clock.nextRegularOpen - now.getTime();
      if (shutFor <= DAY_MS) {
        return {
          pass: true,
          observed: `the regular session opens in ${(shutFor / 3_600_000).toFixed(1)} hours, so this is not a weekend carry`,
        };
      }
      const after = Math.abs(state.netExposureUsdt) + idea.notionalUsdt;
      const share = after / state.equity;
      return {
        pass: share < WEEKEND_NET_SHARE,
        observed: `net exposure would be ${after.toFixed(2)} USDT on ${state.equity.toFixed(2)} USDT of equity, ${(share * 100).toFixed(1)} percent, with the market shut for ${(shutFor / 3_600_000).toFixed(1)} hours`,
      };
    }

    case "divergence-under-1pct": {
      // Divergence is the gap between a price that trades around the clock and the last
      // regular US close. While the regular session is open there is no gap to measure:
      // the two prices are the same tape, and Bitget re-anchors the token to it. The
      // item stands down rather than passing on a number that means nothing.
      if (nyseClock(now).regularSessionOpen) {
        return { pass: true, observed: "regular session open, divergence not applicable" };
      }
      const gap = await divergence(ctx, idea.category, idea.symbol, now);
      return {
        pass: Math.abs(gap.pct) <= GAP_PCT,
        observed: `${idea.symbol} is ${gap.pct.toFixed(2)} percent from the ${new Date(gap.anchorTs).toISOString()} anchor candle close of ${gap.anchorPrice}`,
      };
    }

    case "weekly-turnover-under-5x": {
      const since = now.getTime() - WEEK_MS;
      const turnover = state.recentTrips
        .filter((trip) => trip.entryTs >= since)
        .reduce(
          (sum, trip) =>
            sum + trip.qty * trip.entryPrice + (trip.exitPrice === null ? 0 : trip.qty * trip.exitPrice),
          0,
        );
      const after = turnover + idea.notionalUsdt;
      return {
        pass: after <= TURNOVER_MULTIPLE * state.equity,
        observed: `${after.toFixed(2)} USDT traded in the last 7 days including this order, ${(after / state.equity).toFixed(2)} times the ${state.equity.toFixed(2)} USDT equity`,
      };
    }

    case "no-stale-loser-open": {
      const stale = openHere.find(
        (trip) =>
          now.getTime() - trip.entryTs > DAY_MS &&
          (trip.side === "long" ? last < trip.entryPrice : last > trip.entryPrice),
      );
      if (!stale) {
        return { pass: true, observed: `no position in ${idea.symbol} is both a day old and under water` };
      }
      return {
        pass: false,
        observed: `${stale.id} has been open ${((now.getTime() - stale.entryTs) / DAY_MS).toFixed(1)} days at ${stale.entryPrice} against ${last} now`,
      };
    }

    case "symbol-under-half-exposure": {
      const here = openHere.reduce((sum, trip) => sum + trip.qty * trip.entryPrice, 0) + idea.notionalUsdt;
      const everywhere =
        state.recentTrips
          .filter((trip) => trip.exitTs === null)
          .reduce((sum, trip) => sum + trip.qty * trip.entryPrice, 0) + idea.notionalUsdt;
      const share = everywhere > 0 ? here / everywhere : 1;
      return {
        pass: share <= CONCENTRATION_SHARE,
        observed: `${idea.symbol} would be ${here.toFixed(2)} USDT of ${everywhere.toFixed(2)} USDT open exposure, ${(share * 100).toFixed(1)} percent`,
      };
    }

    case "cost-under-20-bps": {
      const cost = await estimateCost(ctx, {
        category: idea.category,
        symbol: idea.symbol,
        side: idea.side,
        notionalUsdt: idea.notionalUsdt,
        now,
      });
      const total = Math.abs(cost.totalBps);
      const caveats = cost.warnings.length > 0 ? `; ${cost.warnings.join("; ")}` : "";
      return {
        pass: total <= COST_LIMIT_BPS,
        observed: `${total.toFixed(1)} bps to get in and hold a day: ${cost.impactBps.toFixed(1)} impact, ${cost.feeBps.toFixed(1)} fee, ${cost.fundingBpsPerDay === null ? "no funding" : `${cost.fundingBpsPerDay.toFixed(1)} funding`}${caveats}`,
      };
    }

    case "stop-not-already-crossed": {
      const pct = STOP_PCT[idea.category];
      const crossed = openHere.find((trip) => {
        const stop =
          trip.side === "long" ? trip.entryPrice * (1 - pct / 100) : trip.entryPrice * (1 + pct / 100);
        return trip.side === "long" ? last <= stop : last >= stop;
      });
      if (!crossed) {
        return { pass: true, observed: `no open ${idea.symbol} position is past its ${pct} percent stop at ${last}` };
      }
      return {
        pass: false,
        observed: `${crossed.id} entered at ${crossed.entryPrice} and the price is ${last}, already through its ${pct} percent stop`,
      };
    }

    default:
      return {
        pass: false,
        observed: "this item has no automatic test, so it needs a human before the order goes out",
      };
  }
}

/**
 * The exact request Bitget would receive, produced by the SDK dry run.
 *
 * The context is built here rather than taken from the caller so the read-only context
 * the rest of Vidiyal uses can never be the one holding a write verb. dryRun is set on
 * the call itself, so even a context with credentials would not place this order.
 */
async function previewOrder(
  ctx: BitgetContext,
  idea: Idea,
  last: number,
): Promise<{ request: Record<string, unknown> | null; note: string }> {
  const instrument = await getInstrument(ctx, idea.category, idea.symbol);
  const quoteSized = idea.category === "SPOT" && idea.side === "buy";
  const qty = quoteSized
    ? idea.notionalUsdt.toFixed(2)
    : (idea.notionalUsdt / last).toFixed(instrument.quantityPrecision);

  const args: Record<string, unknown> = {
    action: "place",
    category: idea.category,
    symbol: idea.symbol,
    side: idea.side,
    orderType: "market",
    qty,
    dryRun: true,
  };
  const sizing = quoteSized
    ? `${qty} USDT of quote, which is how Bitget sizes a SPOT market buy`
    : `${qty} ${instrument.baseCoin} at the last price of ${last}`;

  try {
    const config = loadConfig({ modules: "all", readOnly: false, paperTrading: false });
    const client = new BitgetRestClient(config);
    const tools = buildTools(config);
    const order = tools.find((tool) => tool.name === "order");
    if (!order) {
      throw new Error("the SDK built no order tool");
    }
    const res = await safeInvoke(order as ToolSpec, args, { config, client } as ToolContext);
    if (!res.ok) {
      throw new Error(JSON.stringify(res));
    }
    return {
      request: res.data as Record<string, unknown>,
      note: `Agent Hub previewed the order without sending it: ${sizing}`,
    };
  } catch (error) {
    const { dryRun: _preview, action: _action, ...body } = args;
    return {
      request: body,
      note: `the SDK did not preview this order (${(error as Error).message.slice(0, 120)}), so the request was built from the order tool schema in docs/dev/account-schemas.md: ${sizing}`,
    };
  }
}
