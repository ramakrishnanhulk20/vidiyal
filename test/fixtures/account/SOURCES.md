# Where these fixtures come from

They stand in for one real Bitget account read through Agent Hub. No read-only tenant
key exists yet, so nothing here is a recording: every file is written by hand against a
pinned request schema. This says exactly what each one is based on, so the next person
can check them against a real account the day a key arrives.

## What is pinned, and what is not

`docs/dev/account-schemas.md` was generated from the SDK itself and it pins the request
side: the tool names, the actions and every parameter name. It carries no response
bodies. So the call shapes in `src/ingest/account.ts` and `src/vendor/tenant/` are exact,
and every response field below is read through a list of candidate names. A name that is
not found reads as null, never as zero.

## account-assets.json, account-settings.json, positions.json

Copied unchanged from `kaaval/test/tenant/fixtures/`, where their own SOURCES.md explains
each field. They are the three sections `account_overview` answers with, which is what the
connection check and the equity curve read.

## fills-page-1.json, fills-page-2.json, fills-page-3.json

Three pages of `order` action `fills`, the verb documented as GET `/api/v3/trade/fills`
with `category`, `startTime`, `endTime`, `limit` and `cursor`. Pages are small so the
cursor walk is visible in a test; a real page holds up to 100 rows.

- `tradeId`, `orderId`, `symbol`, `side`, `price`, `qty`, `amount`, `cTime` are the UTA v3
  names, and the reader accepts alternatives for each.
- `feeDetail` is the list form Bitget uses on some product lines, with the fee written
  negative, which is why the reader stores fees positive.
- The prices are inside the window of `test/fixtures/candles-tsla-15m.json`, so a review
  built from these fills is graded against recorded candles rather than invented ones.

## financial-records.json

`funds_records` action `financial`, GET `/api/v3/account/financial-records`. A transfer in
and a funding fee, each with `billId`, `amount` and `cTime`, and neither carrying a running
balance: that is the shape that makes the equity curve walk backwards from the equity the
account reports now.
