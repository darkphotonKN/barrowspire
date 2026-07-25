# Schema — `accounts` (wallet-service)

**Status:** ✅ SHIPPED — created by
[`migrations/000001_create_accounts_table.up.sql`](../../migrations/000001_create_accounts_table.up.sql)
and amended by
[`000003_add_accounts_updated_at_trigger.up.sql`](../../migrations/000003_add_accounts_updated_at_trigger.up.sql).
The migrations are the source of truth. DB-per-service: this table lives in wallet-service's
own database.

The **Account aggregate root** — a player's gold wallet. Loaded together with its holds as a
single unit.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | UUID | **PK.** Domain-generated (not DB-autogen). |
| `member_id` | UUID | The owning player. **UNIQUE** — one account per member. |
| `gold` | BIGINT | Current balance, default `0`. A new account is always born at 0. |
| `version` | INT | **Optimistic-concurrency counter**, default `0`. Bumped on every `Save`; a mismatch means a lost update — see below. |
| `created_at` | TIMESTAMPTZ | Defaults to `CURRENT_TIMESTAMP`. |
| `updated_at` | TIMESTAMPTZ | Defaults to `CURRENT_TIMESTAMP`, and auto-updated on every UPDATE by the `accounts_updated_at` trigger. |

**Keys / constraints:** `PK(id)`; `UNIQUE(member_id)`.

**Concurrency:** writes go through
`UPDATE accounts SET ..., version = version + 1 WHERE id = $x AND version = $expected`.
Zero rows affected means another writer won the race, and the repository returns
`ErrConcurrentModification` so the use case can retry. This is **optimistic** locking — there
is no `SELECT FOR UPDATE` on this table.

**Triggers:** `accounts_updated_at` (BEFORE UPDATE) calls `update_wallet_updated_at()` to stamp
`updated_at`. Note the equivalent trigger does **not** exist on `wallet_hold`.

**References:**

- `member_id` → **Member** (auth-service): **logical / soft reference** — cross-service,
  DB-per-service, **unenforced** (no FK; the members table lives in another service's DB).

**Notes:** `available` (= `gold − Σ RESERVED holds`) is **computed at read time, never
stored** here.

**Invariant note:** `gold ≥ 0` is a stated domain invariant, but nothing enforces it today —
there is no DB `CHECK`, and no code path debits `gold` yet.
