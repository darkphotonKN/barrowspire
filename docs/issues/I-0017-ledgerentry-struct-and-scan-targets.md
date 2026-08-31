---
id: I-0017
status: done
implements: FS-0003
blocked_by: [I-0014]
labels: [ready-for-agent]
title: "FS-0003 slice 4: LedgerEntry struct, sqlx tags, scan targets"
---
Implements FS-0003 §Data model, §Requirements 6, 8, 15

**Author: agent**

## What to Build

The persistence-facing type for `ledger_entries`: struct fields, `db:` tags matching the column
names from slice 1's DDL exactly, and the scan targets slice 6's repository bodies read into.

Follow `wallet-service`'s equivalent types for tag style, UUID handling, and timestamp
handling.

Shape notes from the FS that the type must respect:

- `amount` is **unsigned in meaning** — `int64` with the positivity invariant held by the DB
  CHECK and the service layer, never by making the field unsigned in Go (§Req 6, ADR-0008).
- `direction` is a closed set. Whether it is a `string` or a domain value type follows slice 1's
  answer to **open question 3** — check I-0014 before choosing.
- `account_id` is a plain UUID with no foreign key and no join target. It is a soft reference to
  `wallet-service.accounts.id` (§Req 15) — this service holds no account records.
- If slice 1 resolved **open question 2** with a `ledger_transactions` table, the
  transaction-level fields (`reason`, `reference_type`, `reference_id`) move off this struct
  onto a second one. Check I-0014's recorded answer first.

## Acceptance Criteria

- [ ] Struct fields and `db:` tags match the migration's columns one-for-one
- [ ] Tag style, UUID and timestamp handling match `wallet-service`'s equivalent types
- [ ] Scan targets round-trip: insert a row, scan it back, fields equal what went in
- [ ] No foreign-key relationship or join to any account type
- [ ] `make lint` green

## Blocked By

I-0014 — column names, the direction representation, and the open-question-2 table split are
all decided there.

## Spec Reference

FS-0003 §Data model, §Requirements 6 (amount), 8 (currency per leg), 15 (`account_id` is a soft
reference). Governed by ADR-0008.

## Notes

Data shape only — no queries, no transaction handling. Those are slice 6 (I-0019).
