import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { BitgetContext } from "../../src/vendor/bitget/client.js";
import type { Category } from "../../src/review/types.js";

/**
 * A stand-in for one trader's private Bitget surface: account_overview, order and
 * funds_records. Shaped after kaaval/test/tenant/fake-tenant.ts, with the fill pages and
 * the cursor added, because the account reader here pages and Kaaval's planner does not.
 *
 * It records every call, which is how these tests prove a review never writes: the
 * assertion is on the calls the code actually made, not on a promise that it would not.
 * The order tool behaves like the SDK's safety layer, so anything that is not a read or a
 * dry run throws the way a read-only surface does.
 */

export type Row = Record<string, unknown>;

export interface FakeAccountSpec {
  /** Fill pages per product line, served in order and walked with the cursor. */
  fillPages?: Partial<Record<Category, Row[][]>>;
  financial?: Row[];
  assets?: unknown;
  positions?: Row[];
  settings?: Row;
  /** Sections that come back ok:false, the shape a wrong key produces. */
  sectionErrors?: Record<string, string>;
  /** Thrown by account_overview before any section runs, for the transport failures. */
  throws?: unknown;
}

export interface FakeAccount extends BitgetContext {
  calls: Array<{ tool: string; args: Record<string, unknown> }>;
}

export const assetsFixture = fixture<unknown>("account-assets.json");
export const positionsFixture = fixture<Row[]>("positions.json");
export const settingsFixture = fixture<Row>("account-settings.json");
export const financialFixture = fixture<{ list: Row[] }>("financial-records.json").list;

/** The three pages of the same instrument, in the order Bitget would serve them. */
export const fillPagesFixture: Row[][] = [
  fixture<{ list: Row[] }>("fills-page-1.json").list,
  fixture<{ list: Row[] }>("fills-page-2.json").list,
  fixture<{ list: Row[] }>("fills-page-3.json").list,
];

export function fakeAccount(spec: FakeAccountSpec = {}): FakeAccount {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const assets = spec.assets ?? assetsFixture;
  const positions = spec.positions ?? positionsFixture;
  const settings = spec.settings ?? settingsFixture;
  const financial = spec.financial ?? financialFixture;
  const fillPages = spec.fillPages ?? { "USDT-FUTURES": fillPagesFixture, SPOT: [] };
  const errors = spec.sectionErrors ?? {};

  const section = (key: string, data: unknown): Record<string, unknown> =>
    errors[key] === undefined ? { ok: true, data } : { ok: false, error: errors[key] };

  const overview = {
    name: "account_overview",
    method: "GET",
    path: "(composite)",
    handler: async (args: Record<string, unknown>) => {
      calls.push({ tool: "account_overview", args });
      if (spec.throws !== undefined) throw spec.throws;
      const data: Record<string, unknown> = {
        assets: section("assets", assets),
        settings: section("settings", settings),
        fundingAssets: section("fundingAssets", []),
      };
      if (args["category"] !== undefined) data["positions"] = section("positions", positions);
      return { endpoint: "(composite) account_overview", requestTime: "0", data };
    },
  };

  const order = {
    name: "order",
    method: "POST",
    path: "(composite)",
    handler: async (args: Record<string, unknown>) => {
      calls.push({ tool: "order", args });
      if (args["action"] === "fills") {
        const pages = fillPages[String(args["category"]) as Category] ?? [];
        return {
          endpoint: "(composite) order",
          requestTime: "0",
          data: { list: pageAfter(pages, args["cursor"]) },
        };
      }
      if (args["dryRun"] !== true) {
        throw new Error("readOnly mode: this surface refuses every write");
      }
      const { dryRun: _dryRun, action: _action, ...rest } = args;
      return {
        endpoint: "(composite) order",
        requestTime: "0",
        data: { dryRun: true, riskLevel: "write", wouldSend: rest },
      };
    },
  };

  const funds = {
    name: "funds_records",
    method: "GET",
    path: "(composite)",
    handler: async (args: Record<string, unknown>) => {
      calls.push({ tool: "funds_records", args });
      const inWindow = financial.filter((row) => {
        const ts = Number(row["cTime"]);
        return ts >= Number(args["startTime"]) && ts <= Number(args["endTime"]);
      });
      return {
        endpoint: "(composite) funds_records",
        requestTime: "0",
        data: { list: args["cursor"] === undefined ? inWindow : [] },
      };
    },
  };

  return {
    config: {},
    client: {},
    tools: new Map<string, unknown>([
      ["account_overview", overview],
      ["order", order],
      ["funds_records", funds],
    ]),
    calls,
  };
}

/**
 * The page that follows the row the cursor names, which is how Bitget's own cursor works:
 * the caller sends back a value off the last row it received. An unknown cursor is the end
 * of the walk, so a reader that never sends the cursor would stop after one page and a
 * reader that sends a stale one cannot loop.
 *
 * Any of the id fields on that last row is accepted, because the response schema is not
 * pinned anywhere and the SDK's own paginator reads the first of them that is present.
 */
function pageAfter(pages: Row[][], cursor: unknown): Row[] {
  if (cursor === undefined) return pages[0] ?? [];
  const index = pages.findIndex((page) => {
    const last = page[page.length - 1];
    if (last === undefined) return false;
    return CURSOR_NAMES.some((name) => last[name] !== undefined && String(last[name]) === String(cursor));
  });
  return index === -1 ? [] : (pages[index + 1] ?? []);
}

/** The same list, in the same order, as the SDK's CURSOR_KEYS. */
const CURSOR_NAMES = ["endId", "cursor", "orderId", "id", "tradeId", "billId"];

/** The value a reader walking these pages sends back after the given page. */
export function cursorAfter(page: number): string {
  const rows = fillPagesFixture[page]!;
  const last = rows[rows.length - 1]!;
  const name = CURSOR_NAMES.find((candidate) => last[candidate] !== undefined)!;
  return String(last[name]);
}

/**
 * Every call that would have changed something on Bitget. A place, cancel, modify or
 * close that is not a dry run is a write; every read verb and every dry run is not.
 */
export function writeCalls(account: FakeAccount): Array<{ tool: string; args: Record<string, unknown> }> {
  const writeActions = new Set([
    "place",
    "cancel",
    "modify",
    "cancelAll",
    "countdownCancel",
    "close",
    "closeAll",
  ]);
  return account.calls.filter((call) => {
    const action = String(call.args["action"] ?? "");
    return writeActions.has(action) && call.args["dryRun"] !== true;
  });
}

export function fixture<T>(name: string): T {
  const path = fileURLToPath(new URL(`../fixtures/account/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
