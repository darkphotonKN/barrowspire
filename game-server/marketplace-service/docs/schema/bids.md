# Schema — `bids` (marketplace-service)

**Status:** ⏳ PLANNED (target design). Lives in marketplace-service's own database.

A **Bid** — an **entity inside the Listing aggregate** (no standalone repository). Order was
collapsed into Bid via the `type` discriminator.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | UUID | **PK.** |
| `listing_id` | UUID | The listing this bid belongs to. |
| `member_id` | UUID | The bidder. |
| `type` | TEXT | `BID` \| `BUYOUT`. |
| `amount` | BIGINT | Bid amount. A `BID` must **exceed the current highest**; a `BUYOUT` must **equal the listing's `buyout_price`**. |
| `status` | TEXT | `WINNING` \| `OUTBID` \| `WON` \| `CANCELLED`. |
| `idempotency_key` | UUID NULL | For idempotent bid placement. |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Keys / constraints:** `PK(id)`.

**Indexes:** **partial unique** — unique on `listing_id` where `status = 'WINNING'` (the
single-winner invariant). Promoting a new leader demotes the prior `WINNING → OUTBID` in the
same transaction; `WON` exits the index.

**References:**
- `listing_id` → `listings(id)`: **hard FK** — same database, **enforced**.
- `member_id` → **Member** (auth-service): **logical / soft reference** — cross-service,
  **unenforced**.

**Note:** `item_id` was intentionally **dropped** — redundant, since `listing_id` already
ties the bid to the listing that owns the item.
