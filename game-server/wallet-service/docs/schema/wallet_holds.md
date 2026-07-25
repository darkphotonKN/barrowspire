# Schema — `wallet_holds` (wallet-service)

**Status:** ⏳ PLANNED (target design). Lives in wallet-service's own database.

A **WalletHold** — a reservation of gold. It is an **entity inside the Account aggregate**
(no repository of its own; persisted together with its account in one transaction).

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | UUID | **PK.** |
| `account_id` | UUID | Owning account. |
| `bid_id` | UUID | The bid this hold backs. |
| `transaction_id` | UUID | **UNIQUE** — idempotency key; correlates the hold to its saga/bid. A redelivered PlaceHold no-ops. |
| `amount` | BIGINT | Reserved gold. Invariant: `amount > 0`. |
| `status` | TEXT | Hold FSM: `RESERVED` (birth) → `COMMITTED` \| `RELEASED` (terminal). **No EXPIRED.** |
| `expires_at` | TIMESTAMPTZ | Expiry fact; a background sweeper RELEASES holds past this. |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Keys / constraints:** `PK(id)`; `UNIQUE(transaction_id)`.

**Indexes:** `(account_id, status)` — for efficiently summing an account's active/RESERVED
holds when enforcing the lifetime invariant.

**References:**
- `account_id` → `accounts(id)`: **hard FK** — same database, **enforced**.
- `bid_id` → **bids** (marketplace-service): **logical / soft reference** — cross-service,
  **unenforced**.
