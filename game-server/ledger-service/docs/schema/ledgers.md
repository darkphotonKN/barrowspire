# Schema — `ledgers` (ledger-service)

**Status:** 🧱 SCAFFOLD — created by
[`migrations/000001_create_ledgers_table.up.sql`](../../migrations/000001_create_ledgers_table.up.sql).
The migrations are the source of truth. DB-per-service: this table lives in ledger-service's
own database.

The **Ledger aggregate root**. It holds identity, birth facts, and the optimistic-concurrency
counter only — the structural minimum for the aggregate to be born, reconstituted, and saved.
**No domain column exists yet** because the domain is not designed; those arrive with the
migration that introduces the first real behavior.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | UUID | **PK.** Domain-generated (not DB-autogen). |
| `member_id` | UUID | The owning player. **UNIQUE** — one ledger per member. |
| `version` | INT | **Optimistic-concurrency counter**, default `0`. Bumped on every `Save`; a mismatch means a lost update — see below. |
| `created_at` | TIMESTAMPTZ | Defaults to `CURRENT_TIMESTAMP`. |
| `updated_at` | TIMESTAMPTZ | Defaults to `CURRENT_TIMESTAMP`. Stamped by the repository on write — there is **no** `updated_at` trigger on this table yet. |

**Keys / constraints:** `PK(id)`; `UNIQUE(member_id)`.

**Concurrency:** writes go through
`UPDATE ledgers SET ..., version = version + 1 WHERE id = $x AND version = $expected`.
Zero rows affected means another writer won the race, and the repository returns
`ErrConcurrentModification` so the use case can retry. This is **optimistic** locking — there
is no `SELECT FOR UPDATE` on this table.

**References:**

- `member_id` → **Member** (auth-service): **logical / soft reference** — cross-service,
  DB-per-service, **unenforced** (no FK; the members table lives in another service's DB).
