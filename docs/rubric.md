# The Vidiyal rubric

Every round-trip trade gets five scores from 0 to 5 and a letter. The first four are computed
by pure functions from the trade and the market around it, so they are the same every time.
The fifth reads the trader's own reasoning and is the only one a model touches. Weights and
thresholds are the defaults in `review/grade.ts`; a change is recorded with the review it
applies to.

## The five scores

| Score | Question | How it is measured |
|---|---|---|
| Entry context | Was this a sane moment to enter? | Divergence of the 24/7 price from the last regular close at entry (under 0.5 percent scores 5, over 2 percent scores 0); spread at entry against the instrument's usual spread; whether the entry fell inside Bitget's own re-anchoring window after the open; whether a scheduled event was minutes away without being named in the rationale |
| Sizing | Was the size proportionate? | Notional against equity at entry (an agent is held to its rulebook caps; a person is held to their own median size over the period, with 3 times the median scoring 0); whether the order would have consumed more than a quarter of the visible book |
| Exit discipline | Did the exit follow a plan? | A stop existed and was honoured (agents); the loser was not held longer than the winners' median holding time; the position was not added to while under water; the exit happened before the open when divergence was high on a weekend entry |
| Cost drag | How much did friction eat? | Fees, slippage against the mid at entry, and funding on perps, as a share of gross profit or loss; under 10 percent scores 5, over 50 percent scores 0; a trade whose gross was smaller than its costs scores 0 |
| Reasoning | Did the stated thesis and the outcome belong to the same world? | For an agent, the rationale in the ledger; for a person, the note they left, if any. A model grades against a fixed rubric: the thesis names a cause, the cause was observable at entry, the exit matched the thesis's horizon, and the outcome is not claimed as skill when the thesis was wrong. No note scores 2, never 0, because silence is not a mistake |

Weights: entry 25, sizing 20, exit 25, cost 15, reasoning 15. Letter: A at 85 and above, B at
70, C at 55, D at 40, E below.

## Patterns

A pattern is a detector over the whole trade table. Each one returns the trades that prove it,
so a card on the desk is never a claim without evidence.

| Pattern | Fires when |
|---|---|
| Revenge trading | A new entry in the same instrument within 30 minutes of a losing exit, at a larger size than the loser |
| Weekend overexposure | Net exposure entering a weekend above 40 percent of equity, or any unhedged rToken position above 10 percent |
| Chasing the gap | Entries while divergence exceeded 1 percent, more than once |
| Overtrading | Turnover above 5 times equity in a week with cost drag above 30 percent of gross |
| Holding losers | Median holding time of losers above twice that of winners |
| Concentration | One instrument above half of total exposure for more than a day |
| Fee bleed | Fees plus slippage plus funding above 20 percent of gross over the period |
| Ignored stops | An agent's position that crossed its stop price and stayed open for more than one tick |
| Added while under water | A fill that increases a position whose mark at that moment is worse than its average entry, judged across all fills, not inside one round trip |

## The checklist

Every pattern that fired becomes one checklist item with a test that can be run against the
live market and the account before a new order: "no entries while divergence exceeds 1
percent", "no re-entry within 30 minutes of a loss in the same name", "net exposure into a
weekend under 40 percent". An idea passes only when every item passes, and a pass produces the
Agent Hub dry-run request, not an order. The trader decides; Vidiyal only says what it saw.

## What the rubric does not do

It does not predict. It does not know whether a trade was lucky. It grades process, and it says
so on every surface, because a good process can lose and a bad one can win for a while.

## Answers

A question about a review is answered in three steps, and only the last one is allowed to be a
model. Retrieval picks the trades whose symbol, side, grade letter, pattern or time words the
question names, and falls back to the five worst trades by score. The evidence table is then
built from those trades alone: one row per fact, each row carrying the round trip id it belongs
to, the grade, the result, the costs, every rubric line and every pattern line that names the
trade. The narrative is written from that table, either by the model or, with no model, by the
table itself.

Then the check that makes the answer worth reading. Every number in the narrative is pulled out
and matched by value against the numbers in the table. A number that is in the answer and not in
the table means the model made it up: it is reported in `uncitedNumbers`, and the written answer
is thrown away and replaced by the paragraph the table wrote for itself. A citation to a trade
id the table does not hold is treated the same way. So a Vidiyal answer can be clumsy English,
but every number in it belongs to a trade that a signed record can produce.
