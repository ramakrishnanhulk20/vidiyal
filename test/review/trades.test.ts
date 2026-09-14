import { describe, expect, it } from "vitest";
import { attachEquity, pairRoundTrips } from "../../src/review/trades.js";
import { fill } from "../support/records.js";

// FIFO pairing over hand-built fill lists. It does not cover reading a real ledger or a
// real account, funding costs (no record here carries any), or the market context around
// a trade: those live in ingest and in context.

describe("pairRoundTrips", () => {
  it("pairs one buy and one sell into a closed long", () => {
    const buy = fill({ side: "buy", qty: 2, price: 100, feeUsdt: 0.2, ts: 1_000 });
    const sell = fill({ side: "sell", qty: 2, price: 110, feeUsdt: 0.22, ts: 2_000 });

    const { trips, skipped } = pairRoundTrips([buy, sell]);

    expect(skipped).toEqual([]);
    expect(trips).toHaveLength(1);
    const trade = trips[0]!;
    expect(trade.side).toBe("long");
    expect(trade.qty).toBe(2);
    expect(trade.entryTs).toBe(1_000);
    expect(trade.exitTs).toBe(2_000);
    expect(trade.grossPnl).toBeCloseTo(20, 10);
    expect(trade.feesUsdt).toBeCloseTo(0.42, 10);
    expect(trade.fills.map((f) => f.id)).toEqual([buy.id, sell.id]);
  });

  it("splits one entry across two exits and keeps the costs whole", () => {
    const buy = fill({ side: "buy", qty: 4, price: 100, feeUsdt: 0.4, ts: 1_000 });
    const first = fill({ side: "sell", qty: 1, price: 105, feeUsdt: 0.105, ts: 2_000 });
    const second = fill({ side: "sell", qty: 3, price: 90, feeUsdt: 0.27, ts: 3_000 });

    const { trips } = pairRoundTrips([buy, first, second]);

    expect(trips).toHaveLength(2);
    expect(trips[0]!.qty).toBe(1);
    expect(trips[0]!.grossPnl).toBeCloseTo(5, 10);
    expect(trips[1]!.qty).toBe(3);
    expect(trips[1]!.grossPnl).toBeCloseTo(-30, 10);
    const feesPaired = trips.reduce((sum, t) => sum + t.feesUsdt, 0);
    expect(feesPaired).toBeCloseTo(0.4 + 0.105 + 0.27, 10);
  });

  it("closes the long and opens a short when a futures sell overshoots", () => {
    const buy = fill({ side: "buy", qty: 1.5, price: 100, ts: 1_000 });
    const sell = fill({ side: "sell", qty: 2, price: 104, ts: 2_000 });

    const { trips } = pairRoundTrips([buy, sell]);

    expect(trips).toHaveLength(2);
    const closed = trips.find((t) => t.exitTs !== null)!;
    expect(closed.side).toBe("long");
    expect(closed.qty).toBe(1.5);
    expect(closed.grossPnl).toBeCloseTo(6, 10);
    const flipped = trips.find((t) => t.exitTs === null)!;
    expect(flipped.side).toBe("short");
    expect(flipped.qty).toBeCloseTo(0.5, 10);
    expect(flipped.entryPrice).toBe(104);
  });

  it("leaves what was never closed as an open trip with no result", () => {
    const buy = fill({ side: "buy", qty: 1.5, price: 364.2, feeUsdt: 0.33, ts: 1_000 });
    const sell = fill({ side: "sell", qty: 0.4, price: 364.32, feeUsdt: 0.03, ts: 2_000 });

    const { trips } = pairRoundTrips([buy, sell]);

    const open = trips.find((t) => t.exitTs === null)!;
    expect(open.qty).toBeCloseTo(1.1, 10);
    expect(open.exitPrice).toBeNull();
    expect(open.grossPnl).toBeNull();
    expect(open.feesUsdt).toBeCloseTo((0.33 * 1.1) / 1.5, 10);
  });

  it("skips a SPOT sell with no earlier buy and says which fill it was", () => {
    const sell = fill({ side: "sell", qty: 5, price: 20, category: "SPOT", symbol: "RTSLAUSDT" });

    const { trips, skipped } = pairRoundTrips([sell]);

    expect(trips).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toContain(sell.id);
    expect(skipped[0]).toContain("no earlier buy");
  });

  it("keeps two symbols apart", () => {
    const buyOne = fill({ side: "buy", qty: 1, price: 100, symbol: "TSLAUSDT", ts: 1_000 });
    const buyTwo = fill({ side: "buy", qty: 1, price: 200, symbol: "NVDAUSDT", ts: 1_100 });
    const sellTwo = fill({ side: "sell", qty: 1, price: 210, symbol: "NVDAUSDT", ts: 1_200 });

    const { trips } = pairRoundTrips([buyOne, buyTwo, sellTwo]);

    expect(trips.filter((t) => t.symbol === "NVDAUSDT")[0]!.grossPnl).toBeCloseTo(10, 10);
    expect(trips.filter((t) => t.symbol === "TSLAUSDT")[0]!.exitTs).toBeNull();
  });
});

describe("attachEquity", () => {
  it("uses the newest mark at or before the entry and nothing later", () => {
    const buy = fill({ side: "buy", qty: 1, price: 100, ts: 5_000 });
    const { trips } = pairRoundTrips([buy]);

    const withEquity = attachEquity(trips, [
      { ts: 1_000, equity: 9_000 },
      { ts: 4_999, equity: 9_500 },
      { ts: 6_000, equity: 12_000 },
    ]);

    expect(withEquity[0]!.equityAtEntry).toBe(9_500);
  });

  it("leaves equity null when every mark is later than the entry", () => {
    const buy = fill({ side: "buy", qty: 1, price: 100, ts: 5_000 });
    const { trips } = pairRoundTrips([buy]);

    expect(attachEquity(trips, [{ ts: 9_000, equity: 9_000 }])[0]!.equityAtEntry).toBeNull();
  });
});
