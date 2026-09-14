import type { ChecklistItem, PatternHit } from "../review/types.js";

/**
 * The test each pattern turns into. The id is stable so a desk can keep a note against
 * an item across reviews, and the test name is what checklist/gate switches on.
 */
const ITEMS: Record<string, { text: string; test: string }> = {
  "revenge-trading": {
    text: "No re-entry within 30 minutes of a loss in the same name",
    test: "no-reentry-after-loss",
  },
  "weekend-overexposure": {
    text: "Net exposure into a weekend stays under 40 percent of equity",
    test: "weekend-exposure-under-40",
  },
  "chasing-the-gap": {
    text: "No entries while the price is more than 1 percent from the last regular close",
    test: "divergence-under-1pct",
  },
  overtrading: {
    text: "This week of turnover stays under 5 times equity",
    test: "weekly-turnover-under-5x",
  },
  "holding-losers": {
    text: "No adding to a name that is already a day old and under water",
    test: "no-stale-loser-open",
  },
  concentration: {
    text: "No instrument holds more than half of open exposure",
    test: "symbol-under-half-exposure",
  },
  "fee-bleed": {
    text: "The round trip costs less than 20 basis points, a fifth of a one percent move",
    test: "cost-under-20-bps",
  },
  "ignored-stops": {
    text: "No open position in this name is already past its stop",
    test: "stop-not-already-crossed",
  },
};

/**
 * One checklist item for every pattern that fired, in the order they fired.
 *
 * A pattern with no test of its own still becomes an item, marked for a human to check,
 * because dropping it would quietly shrink the checklist that the review just earned.
 */
export function itemsFromPatterns(hits: PatternHit[]): ChecklistItem[] {
  const seen = new Set<string>();
  const items: ChecklistItem[] = [];

  for (const hit of hits) {
    if (seen.has(hit.pattern)) continue;
    seen.add(hit.pattern);
    const known = ITEMS[hit.pattern];
    items.push({
      id: `check-${hit.pattern}`,
      pattern: hit.pattern,
      text: known?.text ?? `Check by hand: ${hit.description}`,
      test: known?.test ?? "by-hand",
    });
  }

  return items;
}
