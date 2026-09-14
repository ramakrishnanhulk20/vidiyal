import "dotenv/config";
import { resolve } from "node:path";
import { reviewAll } from "./review.js";

/** Kaaval sits next to this repo and its ledger grows every fifteen minutes. */
const DEFAULT_LEDGER_DIR = resolve(process.cwd(), "../kaaval/data/state/ledger");
const DEFAULT_PUBLIC_KEY_FILE = resolve(process.cwd(), "../kaaval/data/secrets/ledger-key.pub.hex");

const DEFAULT_MINUTES = 60;

/**
 * How long one rebuild may take before the loop treats itself as hung.
 *
 * A full rebuild of both brains measured under a minute, and the slowest part is the news
 * feed waiting on SEC or GDELT. Ten minutes is silence, not slowness, and a promise that
 * is already stuck cannot be cancelled from here, so the honest recovery is to exit and
 * let pm2 start a clean process. Code 2 says the watchdog did it and not a clean stop.
 */
const WATCHDOG_MS = 10 * 60_000;

function log(line: string): void {
  console.log(`${new Date().toISOString()} ${line}`);
}

function env(name: string): string | null {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? null : value.trim();
}

function minutes(): number {
  const raw = Number(env("VIDIYAL_REVIEW_MINUTES") ?? DEFAULT_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MINUTES;
}

/**
 * Where the public half of the ledger key is read from.
 *
 * null hands the choice to the review, which prefers KAAVAL_LEDGER_PUBLIC_KEY_HEX when it
 * is set. Only when it is not does the file path matter, and then the record has to say
 * which file it trusted, so the path is named here rather than left to a default nobody
 * can see in the log.
 */
function publicKeyFile(): string | null {
  if (env("KAAVAL_LEDGER_PUBLIC_KEY_HEX") !== null) return null;
  return env("KAAVAL_LEDGER_PUBLIC_KEY_FILE") ?? DEFAULT_PUBLIC_KEY_FILE;
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => {
    setTimeout(done, ms);
  });
}

/**
 * Wait for the lines already logged to leave the process. pm2 hands this loop a pipe for
 * stdout and a write to a pipe finishes later, so exiting straight away can take the
 * watchdog's own message with it. A second is the most this waits.
 */
function flushOutput(graceMs = 1_000): Promise<void> {
  return new Promise((done) => {
    let left = 2;
    const step = (): void => {
      left -= 1;
      if (left === 0) done();
    };
    setTimeout(done, graceMs).unref();
    process.stdout.write("", step);
    process.stderr.write("", step);
  });
}

async function watch<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const overrun = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      log(`watchdog: ${Math.round(timeoutMs / 1000)} seconds without a rebuild, exiting for pm2`);
      void flushOutput().then(() => {
        process.exit(2);
        reject(new Error("watchdog: the rebuild overran its budget"));
      });
    }, timeoutMs);
  });

  try {
    return await Promise.race([work, overrun]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * One rebuild of every brain in the ledger.
 *
 * A rebuild that throws does not end the loop. Bitget, SEC or the model can all be down
 * for an hour, and the bundles already on the shelf are still true: they say when they
 * were generated, so a reader can see for themselves that the shelf has gone stale. The
 * error goes to the log and the next cycle looks again.
 */
async function cycle(ledger: string): Promise<void> {
  const startedAt = Date.now();
  try {
    const manifest = await watch(
      reviewAll({ ledger, pubkey: publicKeyFile(), log }),
      WATCHDOG_MS,
    );
    const graded = manifest.reviews.reduce((sum, review) => sum + review.graded, 0);
    log(
      `rebuilt ${manifest.reviews.length} reviews, ${graded} graded round trips, in ${((Date.now() - startedAt) / 1000).toFixed(1)} seconds`,
    );
  } catch (error) {
    log(`rebuild failed, the loop continues: ${(error as Error).message}`);
  }
}

/**
 * The review loop: Kaaval's ledger grows every fifteen minutes, and this is what keeps
 * the desk's shelf level with it.
 *
 *   --once   one rebuild, then exit
 */
async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const ledger = env("KAAVAL_LEDGER_DIR") ?? DEFAULT_LEDGER_DIR;
  const every = minutes();
  log(`review loop starting: ledger ${ledger}, every ${every} minutes${once ? ", one cycle only" : ""}`);

  for (;;) {
    await cycle(ledger);
    if (once) return;
    log(`next rebuild in ${every} minutes`);
    await sleep(every * 60_000);
  }
}

main().catch((error: unknown) => {
  log(`the review loop stopped: ${(error as Error).message}`);
  process.exitCode = 1;
});
