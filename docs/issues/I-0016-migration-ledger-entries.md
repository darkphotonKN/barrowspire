---
id: I-0016
status: open
implements: FS-0003
blocked_by: [I-0014]
labels: [ready-for-agent]
title: "FS-0003 slice 3: migration files — create ledger_entries, drop ledgers"
---
Implements FS-0003 §Data model, §Requirements 6, 9-10, 17

**Author: agent**

## What to Build

Transcribe slice 1's decided DDL into `migrations/000002_*.up.sql` and `.down.sql`. Numbering
follows the existing `000001_create_ledgers_table.*`.

**Up** — create `ledger_entries` per FS-0003 §Data model: the `amount_positive` and
`direction_valid` CHECK constraints (§Req 6, ADR-0008), `created_at` defaulted by the database
(§Req 10), the two lookup indexes, and the unique index that enforces idempotency (§Req 13).
Then `DROP TABLE ledgers` (§Req 17).

**Down** — drop `ledger_entries` and recreate `ledgers` exactly as `000001` defined it, so the
migration is genuinely reversible.

Take the DDL from slice 1 as decided. **If slice 1 resolved open question 2 by adding a
`ledger_transactions` table, this migration creates it too** — check I-0014's recorded answers
before writing, rather than assuming the FS §Data model block is current.

## Acceptance Criteria

- [ ] `000002_*.up.sql` and `000002_*.down.sql` exist and match slice 1's DDL
- [ ] Up creates `ledger_entries` with both CHECK constraints and all three indexes
- [ ] Up drops `ledgers`
- [ ] Down drops `ledger_entries` and recreates `ledgers` as `000001` defined it
- [ ] Migrate up then down then up against a real database — clean each time
- [ ] A row with `amount <= 0` is rejected by the database, demonstrated
- [ ] A row with `direction` outside `('DEBIT','CREDIT')` is rejected, demonstrated

## Blocked By

I-0014 — the DDL is decided there, including whether open question 2 adds a second table.

## Spec Reference

FS-0003 §Data model, §Requirements 6 (amount > 0), 9–10 (append-only, DB-set `created_at`),
13 (unique index), 17 (drop `ledgers`). Governed by ADR-0007, ADR-0008.

## Notes

Per-column documentation belongs in `game-server/ledger-service/docs/schema/ledger_entries.md`,
replacing the existing `ledgers.md`.
