import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewBundle } from "../../src/ask/types.js";
import { graded, LEDGER_SOURCE } from "../support/records.js";

// Where the gate's instrument list comes from when the desk has no engine folder to read:
// the universe file inside the published record. It does not cover the disk path, which
// needs the engine's state folder beside the app, and it does not cover the gate itself,
// whose every test reads the live Bitget market. fetch is replaced with a map of URLs to
// bodies, so what is proven is which URL is asked for and what is built from the answer.

const BASE = "https://record.test";

const UNIVERSE = {
  entries: [
    {
      rToken: { symbol: "RNVDAUSDT", category: "SPOT" },
      perp: { symbol: "NVDAUSDT", category: "USDT-FUTURES" },
      underlying: "NVDA",
      volume24hUsdt: 1_000_000,
    },
  ],
  hedges: [{ symbol: "BTCUSDT", category: "USDT-FUTURES" }],
  builtTs: Date.UTC(2026, 8, 11, 8, 17, 15),
};

function bundle(): ReviewBundle {
  return {
    source: LEDGER_SOURCE,
    range: { fromTs: 0, toTs: 0 },
    graded: [graded({ symbol: "RMUUSDT", category: "SPOT" })],
    patterns: [],
    checklist: [],
    equityCurve: [],
  };
}

let asked: string[] = [];

function serve(bodies: Record<string, unknown>): void {
  asked = [];
  vi.stubGlobal("fetch", (url: string) => {
    asked.push(String(url));
    const body = bodies[String(url)];
    return Promise.resolve(
      body === undefined
        ? { ok: false, status: 404, json: () => Promise.reject(new Error("not found")) }
        : { ok: true, status: 200, json: () => Promise.resolve(body) },
    );
  });
}

const { symbolChoices } = await import("../../web/lib/idea.js");

beforeEach(() => {
  process.env["VIDIYAL_RECORD_URL"] = BASE;
});

afterEach(() => {
  delete process.env["VIDIYAL_RECORD_URL"];
  vi.unstubAllGlobals();
});

describe("the instrument list read from the published record", () => {
  it("asks the record for the universe and offers the token, its perpetual and the hedge legs", async () => {
    serve({ [`${BASE}/kaaval/state/universe.json`]: UNIVERSE });

    const choices = await symbolChoices(bundle());

    expect(asked).toEqual([`${BASE}/kaaval/state/universe.json`]);
    expect(choices.traded.map((option) => option.symbol)).toEqual(["RMUUSDT"]);
    expect(choices.universe).toEqual([
      { value: "SPOT|RNVDAUSDT", symbol: "RNVDAUSDT", category: "SPOT", label: "NVDA, tokenized stock" },
      { value: "USDT-FUTURES|NVDAUSDT", symbol: "NVDAUSDT", category: "USDT-FUTURES", label: "NVDA, perpetual" },
      { value: "USDT-FUTURES|BTCUSDT", symbol: "BTCUSDT", category: "USDT-FUTURES", label: "hedge leg" },
    ]);
    expect(choices.note).toBe("the universe the engine behind this record built on 11 SEP 2026, 1 instruments");
  });

  it("says the record has no universe yet rather than offering a list typed here", async () => {
    serve({});

    const choices = await symbolChoices(bundle());

    expect(choices.universe).toEqual([]);
    expect(choices.traded.map((option) => option.symbol)).toEqual(["RMUUSDT"]);
    expect(choices.note).toBe(
      `no universe file at ${BASE}/kaaval/state/universe.json, so the list is only what this record has traded`,
    );
  });
});
