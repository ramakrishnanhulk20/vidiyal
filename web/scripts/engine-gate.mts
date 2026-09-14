import "dotenv/config";
import { checkIdea, type DeskState } from "../../src/checklist/gate.js";
import type { ChecklistItem, Idea } from "../../src/review/types.js";
import { createBitget } from "../../src/vendor/bitget/client.js";

interface Payload {
  idea: Idea;
  items: ChecklistItem[];
  state: DeskState;
}

/**
 * One idea held against the checklist, run in the engine's own process.
 *
 * The desk calls this rather than importing the engine, for two reasons that both
 * matter: the engine is TypeScript with Node resolution that the web bundler does not
 * share, and the keys the Bitget SDK reads stay in this process and never enter the
 * server that renders pages. Everything the engine logs goes to stderr so stdout holds
 * the result and nothing else.
 */
console.log = (...args: unknown[]) => console.error(...args);

async function readPayload(): Promise<Payload> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Payload;
}

async function main(): Promise<void> {
  const payload = await readPayload();
  const check = await checkIdea(createBitget(), payload.idea, payload.items, payload.state);
  process.stdout.write(JSON.stringify(check));
}

void main();
