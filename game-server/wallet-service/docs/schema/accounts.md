# Schema — `accounts` (wallet-service)

**Status:** ⏳ PLANNED (target design). DB-per-service: this table lives in wallet-service's
own database.

The **Account aggregate root** — a player's gold wallet. Loaded together with its holds as a
single unit; the row is locked with `SELECT FOR UPDATE` when a hold is placed.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | UUID | **PK.** Domain-generated (not DB-autogen). |
| `member_id` | UUID | The owning player. Consider **UNIQUE** (one account per member). |
| `gold` | BIGINT | Current balance. Invariant: `gold ≥ 0`. |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Keys / constraints:** `PK(id)`; recommended `UNIQUE(member_id)`.

**References:**
- `member_id` → **Member** (auth-service): **logical / soft reference** — cross-service,
  DB-per-service, **unenforced** (no FK; the members table lives in another service's DB).

**Notes:** `available` (= `balance − Σ active holds`) is **computed at read time, never
stored** here.
