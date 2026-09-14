import { loadReview } from "../lib/desk";
import { kaavalUrl, readCheck, readGate, readLesson, readNight, readScores } from "../lib/story";

/**
 * Every beat of the landing story, printed from the same readers the page uses. Run it
 * with the react-server condition so the server-only marker the engine helper carries
 * resolves to its empty build:
 *
 *   node --import tsx --conditions react-server scripts/print-story.mts
 */
async function main(): Promise<void> {
  const record = await loadReview();

  const night = await readNight(record);
  console.log("BEAT 2, three in the morning");
  if (night === null) {
    console.log("  this review holds no graded trade");
  } else {
    console.log(`  trade      ${night.id}  ${night.ticker} ${night.side}`);
    console.log(`  entry      ${night.etClock} ${night.etMeridiem} ET  (${night.etDayLine})`);
    console.log(`  utc        ${night.utcLine}`);
    console.log(`  session    ${night.session}, ${night.sessionWords}, out of hours: ${night.outOfHours}`);
    console.log(`  to open    ${night.toOpenLine}`);
    console.log(`  grade      ${night.letter} ${night.total.toFixed(1)}`);
  }

  const scores = night === null ? null : await readScores(record, night.id);
  console.log("\nBEAT 3, five scores, one trade");
  if (scores === null) {
    console.log("  no trade to walk");
  } else {
    console.log(`  ${scores.entryLine}`);
    for (const row of scores.rows) {
      console.log(`  ${row.label.padEnd(15)} ${row.value.toFixed(2)}/5  ${row.weight} of 100`);
      for (const line of row.lines) console.log(`      ${line}`);
    }
    console.log(`  letter     ${scores.letter} ${scores.total.toFixed(1)} of 100, ${scores.meaning}`);
  }

  const lesson = await readLesson(record);
  console.log("\nBEAT 4, the same mistake twice");
  console.log(`  pattern    ${lesson.title}`);
  console.log(`  says       ${lesson.pattern?.description ?? "nothing fired"}`);
  for (const line of lesson.pattern?.evidence ?? []) console.log(`      ${line}`);
  console.log(`  trades     ${lesson.trades.map((spine) => spine.id).join(", ")}`);
  console.log(`  item       ${lesson.item?.text ?? "no item"}  [test ${lesson.item?.test ?? "none"}]`);
  console.log(`  detectors  ${lesson.detectorsRun} ran`);

  const gate = await readGate(record);
  console.log(`  gate mode  ${gate.mode}`);
  if (gate.ok) {
    console.log(`  idea       ${gate.idea.side} ${gate.idea.notionalUsdt} USDT of ${gate.idea.symbol} on ${gate.idea.category}`);
    console.log(`  verdict    ${gate.check.pass ? "it passes" : "it does not pass"}, ${gate.check.results.filter((r) => r.pass).length} of ${gate.check.results.length} items passed, ${gate.checkedLine}`);
    for (const result of gate.check.results) {
      console.log(`      ${result.pass ? "pass" : "fail"}  ${result.item.text}`);
      console.log(`            ${result.observed}`);
    }
    console.log(`  dry run    ${gate.check.dryRunNote}`);
  } else {
    console.log(`  verdict    the gate did not run: ${gate.problem}`);
    console.log(`             ${gate.next}`);
  }

  const check = await readCheck(record);
  console.log("\nBEAT 5, the check that makes it worth reading");
  if (check === null) {
    console.log("  no trade to ask about");
  } else {
    console.log(`  question   ${check.question}`);
    console.log(`  model      ${check.model ?? "none, the evidence table wrote it"}`);
    console.log(`  answer     ${check.answer.narrative}`);
    console.log(`  cited      ${check.answer.citedRefs.join(", ")}`);
    console.log(`  uncited    ${check.answer.uncitedNumbers.length === 0 ? "empty" : check.answer.uncitedNumbers.join(", ")}`);
    console.log(`  rows       ${check.answer.evidence.length}`);
    for (const row of check.answer.evidence.slice(0, 8)) {
      console.log(`      ${row.ref} | ${row.fact} | ${row.value}`);
    }
  }

  console.log("\nBEAT 7, the sister line");
  console.log(`  kaaval     ${kaavalUrl()}`);
}

void main();
