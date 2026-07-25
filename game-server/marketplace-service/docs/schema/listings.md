# Schema — `listings` (marketplace-service)

**Status:** ⏳ PLANNED (target design). Lives in marketplace-service's own database.

The **Listing/Auction aggregate root** — a sale. Owns its bids.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | UUID | **PK.** |
| `seller_id` | UUID | The selling player. |
| `item_id` | UUID | The item under sale. |
| `buyout_price` | BIGINT NULL | Set → buyout available. |
| `starting_bid` | BIGINT NULL | Set → auction. |
| `expires_at` | TIMESTAMPTZ | Listing end. |
| `status` | TEXT | `ACTIVE` / `SOLD` / `CANCELLED` / `EXPIRED` / `PENDING_SETTLEMENT`. |
| `idempotency_key` | UUID NULL | For idempotent listing creation. |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Listing kind is implicit** in which price columns are set:
`starting_bid` only → auction; `buyout_price` only → fixed-price; both → hybrid.

**Keys / constraints:** `PK(id)`.

**References:**
- `seller_id` → **Member** (auth-service): **logical / soft reference** — cross-service,
  **unenforced**.
- `item_id` → **ItemInstance** (Stash / items-service): **logical / soft reference** —
  cross-service, **unenforced**. Item escrow (`ItemInstance.status`) is owned by Stash.
