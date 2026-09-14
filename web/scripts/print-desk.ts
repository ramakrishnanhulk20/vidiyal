import { loadReview, toDesk } from "../lib/desk";

async function main(): Promise<void> {
  const desk = toDesk(await loadReview());
  console.log(`source:       ${desk.sourceLine}`);
  console.log(`range:        ${desk.rangeLine}`);
  console.log(`count:        ${desk.countLine}`);
  console.log(`verification: ${desk.verificationLine}`);
  for (const spine of desk.spines) {
    console.log(
      `  ${spine.ticker.padEnd(7)} ${spine.side.padEnd(5)} ${spine.letter} ${spine.total.toFixed(1).padStart(5)}  ${spine.entryLabel} to ${spine.exitLabel}`,
    );
  }
}

void main();
