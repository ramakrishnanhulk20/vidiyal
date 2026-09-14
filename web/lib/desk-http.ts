import type { ReviewRecord } from "./desk";

/**
 * How long a published bundle may be reused before the desk asks the origin again.
 *
 * The publisher copies the record every fifteen minutes and the review loop rebuilds it
 * every hour, so a minute of cache is never the reason a number is stale, and it keeps a
 * page view from costing a round trip to the origin for every screen a reader opens.
 */
const REVALIDATE_SECONDS = 60;

/**
 * Next's own cache hint. It is set through an assertion because the property belongs to
 * Next's RequestInit and not to the plain one the engine's tests compile against.
 */
const CACHE_FOR_A_MINUTE = { next: { revalidate: REVALIDATE_SECONDS } } as RequestInit;

async function readJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, CACHE_FOR_A_MINUTE);
  } catch (cause) {
    throw new Error(`the published record at ${url} could not be reached`, { cause });
  }
  if (!res.ok) {
    throw new Error(`the published record at ${url} answered ${res.status}`);
  }
  try {
    return (await res.json()) as T;
  } catch (cause) {
    throw new Error(`the published record at ${url} is not the JSON the desk expects`, { cause });
  }
}

/**
 * The manifest as Kaaval's publisher writes it, which is the only shape ever served.
 *
 * It is not the manifest scripts/review.ts writes beside the bundles. The publisher
 * rebuilds its own from the files it copied, so an entry is named by its file name rather
 * than its review name, the time it was written is an ISO string rather than a number,
 * the source is flattened to "kind:brain", and the review script's own manifest.json is
 * copied across with the bundles and so appears as a row here. kaaval/scripts/
 * publish-record.ts is the source of truth for all four.
 */
export interface PublishedManifest {
  generatedAt: string;
  reviews: Array<{
    name: string;
    source: string | null;
    range: { fromTs: number | null; toTs: number | null } | null;
    graded: number;
    generatedAt: number | null;
  }>;
}

/** Everything the published record holds, in the order the publisher last wrote it. */
export async function fetchManifest(base: string): Promise<PublishedManifest> {
  return await readJson<PublishedManifest>(`${base}/vidiyal/manifest.json`);
}

/**
 * The review names a reader may ask for. The publisher names each row by its file, so the
 * suffix comes off, and the review script's own manifest travels with the bundles and is
 * not one of them.
 */
export function reviewNames(manifest: PublishedManifest): string[] {
  return manifest.reviews
    .map((review) => review.name.replace(/\.json$/, ""))
    .filter((name) => name !== "manifest");
}

/**
 * One review bundle read over HTTP instead of off the disk.
 *
 * A bundle that will not load is an error and never an empty screen, the same rule the
 * file path follows. The manifest is only read when that happens, so the normal page view
 * costs one request: a reader who asked for a name nobody published gets told which names
 * exist and when they were generated, rather than a blank shelf.
 */
export async function fetchReview(base: string, name: string): Promise<ReviewRecord> {
  const url = `${base}/vidiyal/reviews/${encodeURIComponent(name)}.json`;
  try {
    return await readJson<ReviewRecord>(url);
  } catch (cause) {
    throw new Error(`${(cause as Error).message}. ${await published(base)}`, { cause });
  }
}

async function published(base: string): Promise<string> {
  try {
    const manifest = await fetchManifest(base);
    const names = reviewNames(manifest).join(", ");
    return names === ""
      ? `the manifest lists no reviews yet, so the publisher has not copied one over`
      : `the manifest lists ${names}, published ${manifest.generatedAt}`;
  } catch {
    return `there is no manifest at ${base}/vidiyal/manifest.json either, so check VIDIYAL_RECORD_URL`;
  }
}
