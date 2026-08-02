# SPECIFICATION — marketplace-service

<!-- migrating to thin format: one line per capability, → FS-NNNN pointers -->

Living spec. Describes **behavior, entities, states, invariants, and contracts** — not
code or file paths. Everything is marked ✅ DONE vs ⏳ PLANNED. Per-table detail lives in
[`docs/schema/`](docs/schema/). Cross-service architecture context: [`/docs/refactor_plan.md`](../../docs/refactor_plan.md).

## Purpose

marketplace-service owns **listings, auctions, bids, and buyout**, and **ORCHESTRATES the
marketplace sagas** — the flagship saga surface of the game. It coordinates cross-service
flows with wallet-service (a participant, for holds) and the Stash/items context (for item
escrow).

## Domain Terms

- **Listing / Auction** — the sale; the aggregate root.
- **Bid** — an entity inside the Listing aggregate; carries a `type` discriminator
  (BID | BUYOUT). Order was collapsed into Bid — there is no separate Order concept.
- **Buyout** — an immediate purchase at the listing's `buyout_price`, expressed as a
  BUYOUT-type bid.
- **WINNING** — the current live leading bid (at most one per listing).
- **Fee** — the marketplace's cut of seller proceeds; a tunable gold sink.

## Aggregates & Entities

- **Listing/Auction is the aggregate root.**
- **Bid is an entity INSIDE the Listing aggregate** — no standalone Bid aggregate or
  repository. Bids are loaded and mutated through their Listing.
- **Order collapsed into Bid** via a `type` discriminator (BID | BUYOUT) — a buyout is just
  a bid that settles immediately.

## Bid

- **Type**: BID | BUYOUT.
- **Statuses**: WINNING / OUTBID / WON / CANCELLED. (No ACTIVE — WINNING is the live leader;
  WON is the settled terminal winner.)
- **Invariants**: a BID must **exceed the current highest** bid; a BUYOUT amount must
  **equal the listing's `buyout_price`**.

## Single-Winner Invariant (DB-enforced)

- At most one bid per listing may be WINNING, enforced by a **partial unique index**
  (unique on listing where status = WINNING).
- Promoting a new leader **demotes the prior WINNING → OUTBID in the same transaction**.
- Settlement flips WINNING → WON, which **exits the index** (freeing the slot).

## Listing

- **Statuses**: ACTIVE / SOLD / CANCELLED / EXPIRED / PENDING_SETTLEMENT.
- **Listing kind is implicitly encoded** by which of `buyout_price` / `starting_bid` are set
  — documented explicitly so it isn't a hidden landmine:
  - `starting_bid` only → **auction**
  - `buyout_price` only → **fixed-price**
  - both → **hybrid** (bid up, or buy now)

## Item Escrow (cross-service dependency — owned by Stash)

- The item-side "can't be in two places" lock is `ItemInstance.status` ∈
  AVAILABLE / LISTED / IN_ESCROW, **owned by the Stash / items context, not marketplace.**
  Marketplace depends on it during listing and settlement but does not own it.

## Core Flows

### BidPlaced saga (orchestrated)
Marketplace creates a Bid (pending) → publishes **BidInitiated** → wallet-service places a
hold → publishes **HoldCreated / HoldFailed** → Marketplace sets the Bid **WINNING**
(demoting the prior winner) or **FAILED**. Participants: **Marketplace (orchestrator)** +
**wallet (holds)**.

### Buyout
A BUYOUT bid at `buyout_price` **self-settles immediately**: Listing → PENDING_SETTLEMENT →
SOLD.

### Auction settlement
**Timeout-driven** — a scheduled **AuctionEnded** plus an **hourly reconciliation** safety
net. On settle: commit the winner's hold, transfer the item via Stash, credit the seller
minus fee.

### Cancel / Outbid
Both reduce to the **same compensation primitive: release the hold.**

## Consistency Guarantees

- No double-spend.
- No double-sell.
- Exactly-once settlement.
- No lost updates.
- Umbrella — **no value leaks**: every item and every unit of gold is always in exactly one
  place (a wallet, a hold, or in-transit).

## Fee

- Seller proceeds = winning amount − a **marketplace fee (default 5%)**, framed as a
  **tunable gold sink (economic policy)**, not revenue.

## API Surface

All **write** endpoints require an **`Idempotency-Key` header**. (Cancel is naturally
idempotent and needs no key.)

| Method & path | Behavior | Result |
| ------------- | -------- | ------ |
| `POST /marketplace/listings` | create a listing | 201 |
| `POST /marketplace/listings/:id/bids` | place a bid; payload carries `type=BID\|BUYOUT` | 201 |
| `POST /marketplace/listings/:id/bids/:bid_id/cancel` | cancel a bid (release hold) | 200 |
| `POST /marketplace/listings/:id/cancel` | cancel a listing | 200 |
| `GET /members/:id/bids` | a member's bids | `[]Bid` |
| `GET /members/:id/listings` | a member's listings | `[]Listing` |
| `GET /marketplace/listings?term=&max_price=&sort=` | search; returns listings with **price + time-left** (not raw items) | `[]Listing` |

## Data Model

Per-table detail (fields, keys, states, constraints, references) lives in `docs/schema/`:
- [`docs/schema/listings.md`](docs/schema/listings.md)
- [`docs/schema/bids.md`](docs/schema/bids.md)

## Capabilities

### Listings & bids

- [ ] Listing domain
- [ ] Bid domain
- [ ] Buyout (immediate self-settlement)

### Auction lifecycle

- [ ] BidPlaced saga orchestration
- [ ] Auction settlement
- [ ] Auction timeouts and reconciliation

### Surface

- [ ] gRPC endpoints (none exposed yet)
