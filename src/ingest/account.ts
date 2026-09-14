import { invoke, type BitgetContext } from "../vendor/bitget/client.js";
import {
  availableUsdt,
  optNum,
  pick,
  readOverview,
  reportedEquityUsdt,
  usdtRow,
  type Row,
} from "../vendor/tenant/overview.js";
import type { Category, FillRecord, Source } from "../review/types.js";

/** Both ends in milliseconds, fromTs before toTs. */
export interface AccountRange {
  fromTs: number;
  toTs: number;
}

export interface AccountReader {
  fills(range: AccountRange): Promise<FillRecord[]>;
  equityCurve(range: AccountRange): Promise<Array<{ ts: number; equity: number }>>;
}

/** The two Bitget product lines Vidiyal grades. Every read is made once per line. */
const CATEGORIES: Category[] = ["SPOT", "USDT-FUTURES"];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How far back Bitget will answer at all, and how wide one call may be. Both numbers are
 * from docs/dev/account-schemas.md, order action fills: "The access window is 90 days"
 * and "The time range between startTime and endTime must not exceed 30 days".
 */
export const MAX_HISTORY_MS = 90 * DAY_MS;
export const MAX_WINDOW_MS = 30 * DAY_MS;

/** "Limit per page Default:100. Maximum:100", same doc. */
const PAGE_LIMIT = 100;

/**
 * A stop for a cursor that never ends. A hundred pages of a hundred rows is ten thousand
 * fills inside one 30 day window, far past any account we expect, and hitting it is said
 * out loud rather than silently returning a short history.
 */
const MAX_PAGES_PER_WINDOW = 100;

/**
 * Where the next page's cursor is read from, in the order the SDK's own paginator reads
 * them (CURSOR_KEYS in @bitget-ai/bitget-agent-sdk lib/index.js): the value comes off the
 * last row of the page. The schema doc pins the request side only, so the response names
 * are candidates rather than one fixed field.
 */
const CURSOR_NAMES = ["endId", "cursor", "orderId", "id", "tradeId", "billId"];

/** Some responses carry the next cursor on the wrapper instead of on the last row. */
const WRAPPER_CURSOR_NAMES = ["nextCursor", "cursor", "endId", "nextId"];

/**
 * The range Bitget can actually answer for, and whether anything was cut off it.
 *
 * A trader asking for a year gets the 90 days Bitget serves rather than an error, and the
 * caller is told so it can say which 90 days the review covers. Nothing is moved forward:
 * a range that ends in the past is left alone.
 */
export function clipToHistory(
  range: AccountRange,
  now: number = Date.now(),
): { range: AccountRange; clipped: boolean } {
  const earliest = now - MAX_HISTORY_MS;
  if (range.fromTs >= earliest) return { range, clipped: false };
  return { range: { fromTs: earliest, toTs: range.toTs }, clipped: true };
}

/** The 30 day calls one range becomes, in order, the last one ending at toTs. */
export function splitWindows(range: AccountRange): AccountRange[] {
  if (!Number.isFinite(range.fromTs) || !Number.isFinite(range.toTs) || range.fromTs >= range.toTs) {
    throw new RangeError("account range needs fromTs before toTs, both in milliseconds");
  }
  const windows: AccountRange[] = [];
  for (let start = range.fromTs; start < range.toTs; start += MAX_WINDOW_MS) {
    windows.push({ fromTs: start, toTs: Math.min(start + MAX_WINDOW_MS, range.toTs) });
  }
  return windows;
}

/**
 * A read-only view of one real Bitget account, in the same shape as a Kaaval ledger.
 *
 * Every call here is a read verb from docs/dev/account-schemas.md: order fills, and
 * account_overview plus funds_records for the equity curve. No write verb is reachable
 * from this file, and the context handed in should be built read-only so that stays
 * true. Credentials belong to the context, never to an argument here.
 *
 * Paging is done here rather than through the SDK's fetchAll flag on purpose: fetchAll
 * stops after 5 pages or 500 rows and only says so in a truncated flag on the envelope,
 * which would quietly turn a busy month into a short one.
 */
export function bitgetAccountReader(
  ctx: BitgetContext,
  accountId: string,
  opts: { log?: (line: string) => void } = {},
): AccountReader {
  const source: Source = { kind: "account", accountId };
  const log = opts.log ?? (() => {});

  return {
    async fills(range) {
      // Bitget treats both ends of a window as inclusive and a cursor page can repeat a
      // row, so fills are collected by trade id: the same execution read twice would
      // otherwise pair into a round trip that never happened.
      const byId = new Map<string, FillRecord>();
      for (const category of CATEGORIES) {
        for (const window of splitWindows(range)) {
          const rows = await readPages(
            ctx,
            "order",
            {
              action: "fills",
              category,
              startTime: String(window.fromTs),
              endTime: String(window.toTs),
            },
            log,
          );
          for (const row of rows) {
            const record = toFillRecord(row, category, source);
            byId.set(record.id, record);
          }
        }
      }
      return [...byId.values()].sort((a, b) => a.ts - b.ts);
    },

    async equityCurve(range) {
      const snapshot = await readOverview(ctx);
      const now = Math.min(Date.now(), range.toTs);
      // The account's own reported equity first, exactly as the connection check reads
      // it. Free USDT is the fallback only when the account holds USDT at all, because a
      // zero from an absent row would be an invented starting point for the whole curve.
      const equityNow = reportedEquityUsdt(snapshot) ?? (usdtRow(snapshot) === null ? null : availableUsdt(snapshot));
      if (equityNow === null) {
        throw new TypeError("account_overview carried no total equity, so no curve can be built");
      }

      const bills: Array<{ ts: number; amount: number; balance: number | null }> = [];
      const seen = new Set<string>();
      for (const category of CATEGORIES) {
        for (const window of splitWindows(range)) {
          const rows = await readPages(
            ctx,
            "funds_records",
            {
              action: "financial",
              category,
              startTime: String(window.fromTs),
              endTime: String(window.toTs),
            },
            log,
          );
          for (const row of rows) {
            const ts = optNum(row, ["cTime", "ts", "uTime"]);
            const amount = optNum(row, ["amount", "size", "change"]);
            if (ts === null || amount === null) continue;
            const id = String(pick(row, CURSOR_NAMES) ?? `${ts}:${amount}`);
            if (seen.has(id)) continue;
            seen.add(id);
            bills.push({
              ts,
              amount,
              balance: optNum(row, ["balance", "balanceAfter", "totalBalance"]),
            });
          }
        }
      }
      bills.sort((a, b) => a.ts - b.ts);

      // Bitget publishes a balance on some record types and only a change on others.
      // Where the balance is published it is used as it stands; where it is not, the
      // curve is walked backwards from the equity the account reports right now,
      // undoing each recorded change. Both paths are arithmetic over recorded numbers.
      const points: Array<{ ts: number; equity: number }> = [{ ts: now, equity: equityNow }];
      let running = equityNow;
      for (let index = bills.length - 1; index >= 0; index -= 1) {
        const bill = bills[index]!;
        running = bill.balance ?? running - bill.amount;
        points.push({ ts: bill.ts, equity: running });
      }
      points.sort((a, b) => a.ts - b.ts);
      return points;
    },
  };
}

/**
 * One read verb followed to the end of its cursor.
 *
 * The walk stops on an empty page, on a page that carries no cursor, and on a cursor that
 * repeats the one already used, which is what a server that ignores the parameter does.
 */
async function readPages(
  ctx: BitgetContext,
  tool: string,
  args: Record<string, unknown>,
  log: (line: string) => void,
): Promise<Row[]> {
  const out: Row[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES_PER_WINDOW; page += 1) {
    const sent: Record<string, unknown> = { ...args, limit: String(PAGE_LIMIT) };
    if (cursor !== undefined) sent["cursor"] = cursor;
    const payload = await invoke(ctx, tool, sent);
    const rows = asRows(payload);
    if (rows.length === 0) return out;
    out.push(...rows);

    const next = cursorOf(payload, rows);
    if (next === undefined || next === cursor) return out;
    cursor = next;
  }

  log(
    `${tool} ${String(args["action"])}: stopped after ${MAX_PAGES_PER_WINDOW} pages of ${PAGE_LIMIT}, so this window is cut short`,
  );
  return out;
}

function cursorOf(payload: unknown, rows: Row[]): string | undefined {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const wrapper = pick(payload as Row, WRAPPER_CURSOR_NAMES);
    if (wrapper !== undefined) return String(wrapper);
  }
  const last = rows[rows.length - 1];
  if (last === undefined) return undefined;
  const value = pick(last, CURSOR_NAMES);
  return value === undefined ? undefined : String(value);
}

function asRows(payload: unknown): Row[] {
  if (Array.isArray(payload)) return payload as Row[];
  if (payload && typeof payload === "object") {
    for (const key of ["list", "fills", "orderList", "rows", "items", "data"]) {
      const value = (payload as Row)[key];
      if (Array.isArray(value)) return value as Row[];
    }
  }
  throw new TypeError("expected a list of rows from the Bitget account read");
}

function num(row: Row, names: string[], where: string): number {
  const value = optNum(row, names);
  if (value === null) {
    throw new TypeError(`${where}: none of ${names.join(", ")} holds a number`);
  }
  return value;
}

/**
 * Bitget spells the same fill differently across its two REST generations, so every
 * lookup names the v3 UTA field first and the older one after. A missing field throws
 * rather than defaulting, because a zero price would quietly become a graded trade.
 */
function toFillRecord(row: Row, category: Category, source: Source): FillRecord {
  const symbol = String(pick(row, ["symbol", "instId", "instrument"]) ?? "");
  const where = `fill ${symbol || "with no symbol"}`;
  const tradeId = String(pick(row, ["tradeId", "fillId", "id"]) ?? "");
  if (symbol === "" || tradeId === "") {
    throw new TypeError(`${where}: the row carries no symbol or no trade id`);
  }
  const side = String(pick(row, ["side"]) ?? "").toLowerCase();
  if (side !== "buy" && side !== "sell") {
    throw new TypeError(`${where}: side came back as ${side || "nothing"}`);
  }
  const price = num(row, ["price", "fillPrice", "priceAvg"], where);
  const qty = num(row, ["qty", "baseVolume", "fillQuantity", "size"], where);
  const notional = optNum(row, ["amount", "quoteVolume", "fillAmount", "value"]) ?? price * qty;
  const accountTag = source.kind === "account" ? source.accountId : "account";

  return {
    id: `${accountTag}:${tradeId}`,
    source,
    ts: num(row, ["cTime", "ts", "uTime", "fillTime"], where),
    category,
    symbol,
    side,
    qty,
    price,
    notionalUsdt: notional,
    feeUsdt: readFee(row),
    slippageBps: null,
    bookHash: null,
    decisionId: String(pick(row, ["orderId"]) ?? "") || null,
    rationale: null,
    note: (pick(row, ["clientOid"]) as string | undefined) ?? null,
  };
}

/**
 * Bitget reports a fee as a negative number and, on some product lines, inside a
 * feeDetail object or list. Fees are stored positive here so cost drag is a sum, not
 * a subtraction that changes sign with the product line.
 */
function readFee(row: Row): number {
  const direct = optNum(row, ["fee", "totalFee", "feeUsdt"]);
  if (direct !== null) return Math.abs(direct);

  const detail = row["feeDetail"];
  const list = Array.isArray(detail) ? detail : detail ? [detail] : [];
  let total = 0;
  for (const part of list) {
    if (part && typeof part === "object") {
      total += Math.abs(optNum(part as Row, ["totalFee", "fee", "deduction"]) ?? 0);
    }
  }
  return total;
}
