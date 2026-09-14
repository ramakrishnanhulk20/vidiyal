import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DeskState } from "../../src/checklist/gate.js";
import type { ReviewBundle } from "../../src/ask/types.js";
import type { Category } from "../../src/review/types.js";
import { engineRoot, recordUrl } from "./desk";
import { utcDay } from "./format";

export interface SymbolOption {
  value: string;
  symbol: string;
  category: Category;
  label: string;
}

export interface SymbolChoices {
  traded: SymbolOption[];
  universe: SymbolOption[];
  note: string;
}

/**
 * The account as the gate has to see it: every round trip this review holds, the equity
 * the record last marked, and what is still open.
 *
 * The gate's own tests do the windowing, so every trip is handed over rather than a
 * recent slice of them: a test that asks about the last 30 minutes and a test that asks
 * about the last 7 days cannot both be served by one cut made here.
 */
export function deskState(bundle: ReviewBundle): DeskState {
  const recentTrips = bundle.graded.map((graded) => graded.trade);
  const open = recentTrips.filter((trip) => trip.exitTs === null);
  return {
    recentTrips,
    equity: bundle.equityCurve.at(-1)?.equity ?? 0,
    netExposureUsdt: open.reduce(
      (sum, trip) => sum + (trip.side === "long" ? 1 : -1) * trip.qty * trip.entryPrice,
      0,
    ),
  };
}

export function openExposureUsdt(bundle: ReviewBundle): number {
  return bundle.graded
    .filter((graded) => graded.trade.exitTs === null)
    .reduce((sum, graded) => sum + graded.trade.qty * graded.trade.entryPrice, 0);
}

interface UniverseFile {
  entries: Array<{
    rToken: { symbol: string; category: string };
    perp: { symbol: string; category: string } | null;
    underlying: string;
    volume24hUsdt: number;
  }>;
  hedges: Array<{ symbol: string; category: string }>;
  builtTs: number;
}

/**
 * What an idea may be typed about: the instruments this record already traded, and the
 * list the engine that wrote the record last built for itself.
 *
 * Both come off disk. Nothing here is a list kept by the web app, because a symbol the
 * desk offers that the engine does not trade is a promise the record cannot keep.
 */
export async function symbolChoices(bundle: ReviewBundle): Promise<SymbolChoices> {
  const traded = new Map<string, SymbolOption>();
  for (const { trade } of bundle.graded) {
    const option = toOption(trade.symbol, trade.category, "traded in this review");
    traded.set(option.value, option);
  }

  const universe = new Map<string, SymbolOption>();
  const read = await readUniverse(bundle);
  for (const entry of read.file?.entries ?? []) {
    const token = toOption(entry.rToken.symbol, "SPOT", `${entry.underlying}, tokenized stock`);
    universe.set(token.value, token);
    if (entry.perp) {
      const perp = toOption(entry.perp.symbol, "USDT-FUTURES", `${entry.underlying}, perpetual`);
      universe.set(perp.value, perp);
    }
  }
  for (const hedge of read.file?.hedges ?? []) {
    const option = toOption(hedge.symbol, "USDT-FUTURES", "hedge leg");
    universe.set(option.value, option);
  }
  for (const key of traded.keys()) universe.delete(key);

  return {
    traded: [...traded.values()],
    universe: [...universe.values()],
    note: read.note,
  };
}

function toOption(symbol: string, category: string, label: string): SymbolOption {
  return {
    value: `${category}|${symbol}`,
    symbol,
    category: category as Category,
    label,
  };
}

interface UniverseRead {
  file: UniverseFile | null;
  note: string;
}

/** The same minute of cache the bundles get, so the two reads of a page view agree. */
const REVALIDATE_SECONDS = 60;

/**
 * The universe the engine built.
 *
 * Two places hold the same file and the desk reads whichever it can reach: on the machine
 * beside the engine it sits next to the ledger the bundle names, and on a hosted deploy it
 * is part of the published record, which is the only one a Vercel deploy can see. A record
 * from a Bitget account has no such file at all.
 *
 * Nothing here throws. A missing universe is a smaller list and a note that says so, not a
 * dead gate: the reader can still hold an idea against anything the record has traded.
 */
async function readUniverse(bundle: ReviewBundle): Promise<UniverseRead> {
  if (bundle.source.kind !== "ledger") {
    return {
      file: null,
      note: "this record is a Bitget account, which keeps no universe file, so the list is what the account has traded",
    };
  }

  const base = recordUrl();
  if (base !== null) return await fetchUniverse(`${base}/kaaval/state/universe.json`);

  const path = resolve(engineRoot(), bundle.source.dir, "../universe.json");
  try {
    return found(JSON.parse(readFileSync(path, "utf8")) as UniverseFile);
  } catch {
    return missing(path);
  }
}

async function fetchUniverse(url: string): Promise<UniverseRead> {
  try {
    const response = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } } as RequestInit);
    if (!response.ok) return missing(url);
    return found((await response.json()) as UniverseFile);
  } catch {
    return missing(url);
  }
}

function found(file: UniverseFile): UniverseRead {
  return {
    file,
    note: `the universe the engine behind this record built on ${utcDay(file.builtTs)}, ${file.entries.length} instruments`,
  };
}

function missing(where: string): UniverseRead {
  return {
    file: null,
    note: `no universe file at ${where}, so the list is only what this record has traded`,
  };
}
