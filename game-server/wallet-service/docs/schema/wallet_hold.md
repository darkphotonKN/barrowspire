# Schema — `wallet_hold` (wallet-service)

**Status:** ✅ SHIPPED — created by
[`migrations/000002_create_wallet_hold_table.up.sql`](../../migrations/000002_create_wallet_hold_table.up.sql),
which is the source of truth for this table. Lives in wallet-service's own database.

> Note the table is singular (`wallet_hold`), unlike `accounts`.

A **WalletHold** — a reservation of gold. It is an **entity inside the Account aggregate**
(no repository of its own; persisted together with its account in one transaction).

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | UUID | **PK.** Domain-generated. |
| `account_id` | UUID | Owning account. |
| `bid_id` | UUID | The bid this hold backs, and the **idempotency key** — see below. |
| `amount` | BIGINT | Reserved gold. Invariant `amount > 0` is enforced in the domain (`newWalletHold`); there is **no DB CHECK** on it. |
| `status` | TEXT | Hold FSM: `RESERVED` (birth) → `COMMITTED` \| `RELEASED` (terminal). **No EXPIRED.** A `CHECK` constraint enforces the three values, **uppercase**. |
| `expiry_date` | TIMESTAMPTZ | Expiry fact; a background sweeper RELEASES holds past this. Set to birth + 1 hour (`holdDuration`). |
| `created_at` | TIMESTAMPTZ | Defaults to `CURRENT_TIMESTAMP`. |
| `updated_at` | TIMESTAMPTZ | Defaults to `CURRENT_TIMESTAMP`. No auto-update trigger on this table (unlike `accounts`) — the domain sets it. |

**Keys / constraints:**

- `PK(id)`
- `UNIQUE(bid_id)` — the idempotency key. One hold per bid, so a redelivered PlaceHold for
  the same bid cannot double-reserve. (An earlier draft of this design called this column
  `transaction_id`; the shipped table uses `bid_id` for both the reference and the key.)
- `CHECK (status IN ('RESERVED', 'COMMITTED', 'RELEASED'))` — values are **uppercase**; the
  Go constants in `domain/account/wallet_hold.go` must match exactly.
- `FOREIGN KEY (account_id) REFERENCES accounts(id)`

**Indexes:**

- `idx_wallet_hold_sweep` — partial index on `(expiry_date) WHERE status = 'RESERVED'`, for
  the expiry sweeper. ⏳ The sweeper itself is not implemented yet.
- `wallet_hold_bid_id_key` — the unique constraint's implicit index, which also serves the
  "does a hold already exist for this bid?" lookup.
- There is **no** `(account_id, status)` index. Summing an account's RESERVED holds currently
  scans by `account_id`; worth adding if that read becomes hot.

**References:**

- `account_id` → `accounts(id)`: **hard FK** — same database, **enforced**.
- `bid_id` → **bids** (marketplace-service): **logical / soft reference** — cross-service,
  **unenforced**.
