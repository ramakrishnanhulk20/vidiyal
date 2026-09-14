# The judge path, the long version

Two minutes gets you the short path in the README. This page is the same walk with what each
step proves and what to look at when you want to check a claim rather than take it.

## What you need

A checkout of this repo, Node 26 (26.7.0 here), and, for the two commands that read a record, the
Kaaval repo sitting beside it. Kaaval is the trading agent whose signed ledger this desk reviews.
A ledger and its key are not in this repo, so a clone on its own can run the tests and the site
but not a fresh review.

No key is needed for anything below. Every Bitget market read is public. Without
`ANTHROPIC_API_KEY` the reasoning score is left ungraded and the evidence table writes the
answers itself, which is a normal state, not an error.

## 1. The tests

```bash
npm install
npm test
```

```
 Test Files  9 passed | 2 skipped (11)
      Tests  112 passed | 3 skipped (115)
```

This is 2026-09-12, 1.13 seconds. Nothing here touches the network: the Bitget responses are
recorded fixtures and the model is a fake. `LIVE=1 npm test` adds the two skipped files, which
call the public Bitget API and the news hosts for real.

What to look at: `test/review/grade.test.ts` for the rubric, `test/ask/answer.test.ts` for the
honesty check, `test/checklist/gate.test.ts` for the idea gate.

## 2. The review that wrote the bundle

```bash
npm run review -- --source kaaval --brain claude \
  --ledger ../kaaval/data/state/ledger \
  --pubkey ../kaaval/data/secrets/ledger-key.pub.hex \
  --out kaaval-claude
```

It verifies the hash chain and the Ed25519 signature on the ledger first and stops if either
fails, then pairs fills into round trips, rebuilds the market around each entry from live Bitget
candles, pulls news and scheduled events in the window, grades every trip, runs the nine
detectors, turns the patterns into checklist items and writes
`data/state/reviews/kaaval-claude.json`.

The bundle on the desk today, from that file: a simulated Kaaval record for brain `claude`,
2026-09-11T08:21:29Z to 2026-09-11T08:25:51Z, 5 round trips in RNVDAUSDT, RVOOUSDT, RMUUSDT and
RQQQUSDT graded four B and one C, one pattern fired (`fee-bleed`) out of nine detectors run, one
checklist item, ledger verified over 5 fills, 20 decisions and 20 equity marks, written
2026-09-12T07:39:31Z.

Flags: `--source` (only `kaaval` today, an account review needs read-only Bitget keys), `--brain`,
`--ledger`, `--pubkey`, `--from` and `--to` as ISO dates, `--out` for the bundle name.

## 3. The whole pipeline in one command

```bash
npm run proof:review
```

It runs against the demo ledger and live Bitget data, and prints every number it used: the ledger
verification, each trade with its five scores and the evidence line behind each, the detectors
that fired and the ones that did not, the checklist, one new idea held against that checklist, the
Agent Hub dry run, and one question answered over the evidence table.

The last lines of the run on 2026-09-12:

```
Idea: buy RTSLAUSDT 300 USDT
  pass  No entries while the price is more than 1 percent from the last regular close
        RTSLAUSDT is -0.34 percent from the 2026-09-11T19:45:00.000Z anchor candle close of 365.44
  pass  The round trip costs less than 20 basis points, a fifth of a one percent move
        1.0 bps to get in and hold a day: 1.0 impact, 0.0 fee, no funding; Bitget publishes no taker fee rate for RTSLAUSDT, fees are not in the total
  verdict: passes the checklist
  Agent Hub previewed the order without sending it: 300.00 USDT of quote, which is how Bitget sizes a SPOT market buy
  {"dryRun":true,"operationId":"placeOrder","method":"POST","path":"/api/v3/trade/place-order","riskLevel":"write","wouldSend":{"category":"SPOT","symbol":"RTSLAUSDT","side":"buy","orderType":"market","qty":"300.00","clientOid":"c3dff94f-418f-493e-b96f-e30b2b268563"}}

review bundle: 2 graded trades, 2 patterns, 2 checklist items, 1 equity points

Question: why did this account lose on rTSLA?
  answered by: claude-sonnet-5, checked against the evidence below
  ... the written answer and its 28 row evidence table, cut here ...
  cited refs: ledger-demo:4>ledger-demo:6, ledger-demo:4>open
  numbers with no evidence behind them: none, every number in the answer came from a trade

account review skipped: no BITGET_API_KEY
```

Two things worth noticing. `riskLevel: write` with `dryRun: true` is the SDK telling you this
would have been an order and was not sent. The last line is the proof declining to invent an
account review when no key is set, rather than showing a demo one.

## 4. The desk

```bash
cd web && npm install && npm run dev   # http://localhost:3001
```

Open the pages in this order.

On `/`, the shelf, every round trip stands on its spine, coloured by grade. The sources panel at
the bottom is the part to read first: which record this is, the range, the public key, whether the
ledger verified, and when the bundle was written. A review that will not say what it read is not
worth reading.

Open one trade at `/trades/<round trip id>`. It leads on the letter, then the five scores, each
carrying the line that produced it, for example
`cost: 0.2262 USDT of friction against a gross of 0.0491 USDT, so friction was the whole trade`.
Below that are the signed fills, the market rebuilt around the entry (divergence,
session, spread, book share, stop), the headlines the feed found in the window, and the judge's
own sentence about the trader's note. A score with no line behind it is a bug, not a design.

`/patterns` is one card per detector that fired, with the trades that prove it, and the names of
all nine detectors that ran. The ones that found nothing are named too, so you can tell a clean
record from a detector that never ran.

`/checklist` is the item each pattern became, with the test the gate will run. On this bundle
that is one item, `cost-under-20-bps`, out of the `fee-bleed` pattern.

On `/gate`, pick an instrument, side buy, 300 USDT, and hold it. Each item is tested against the
live market and the observed number is printed beside the pass or fail. A pass ends at the Agent
Hub dry run: the exact request Bitget would receive. Nothing is sent. The instrument list is the
four this review traded plus the universe the engine last built for itself, because a symbol the
desk offers that the engine does not trade is a promise the record cannot keep.

On `/ask`, type "why did this account lose on rMU?". Retrieval is a keyword filter written down
in `src/ask/answer.ts`, not a model, so you can tell why a trade is in the answer. The evidence
table under the answer is the whole world the model was given. Every number in the written answer
is then matched against that table: when one is not there, the page says the draft was thrown
away, lists the invented numbers, and shows the paragraph the table wrote instead. That is the
check worth trying to break.

## What this path does not prove

It does not review a real Bitget account: the demo record is a simulated one, and an account
review needs read-only keys. It does not grade luck, only process. And the web pages have no
tests of their own yet, so what you see on screen is proven by the engine's tests and by the
proof command, not by a browser test.
