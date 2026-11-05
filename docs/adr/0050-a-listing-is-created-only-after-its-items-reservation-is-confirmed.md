# ADR-0050 — A listing is created only after its item's reservation is confirmed

Status: accepted
Date: 2026-11-05
Scope: `game-server/marketplace-service` (`CreateListingUC`, the `item.reserved` consumer,
`ReconcileReservationsUC`, `HasLiveListing`), `game-server/items-service` (`ConfirmReservation`,
the release of a confirmed reservation, the reservation reconciler's backstop)
Builds on: [ADR-0009](0009-idempotency-belongs-to-the-caller.md) (the caller-minted id is the
idempotency key; here, the listing id items mints at reserve) · FS-NXP1W Req 24a (writes fenced
on `listing_id`) and Req 34 (the stale-reservation reconciler)

## Context

Recorded without adversarial review. Decided by the user on 2026-11-05, after a read-only audit
of the listing-creation flow.

Listing an item crosses two services through one asynchronous event:

1. items `ReserveItem` moves the item AVAILABLE → LISTED under a freshly minted `listing_id`,
   stamps `reserved_at = NOW()`, and writes `item.reserved` to its outbox in the same
   transaction.
2. marketplace consumes the event and inserts the listing as ACTIVE.
3. The stale-reservation reconciler is the safety net for a lost event. Every 5 minutes it
   finds LISTED items whose `reserved_at` is older than 10 minutes, asks marketplace whether a
   live listing exists, and then either confirms the reservation (`reserved_at = NULL`) or
   cancels it (item → AVAILABLE).

Step 2 never checks that the reservation still stands, and nothing confirms it at creation. So
an event that is **late** rather than lost creates a listing over an item the reconciler has
already handed back:

- The reconciler cancels at minute 10. The item is AVAILABLE again.
- The event arrives at minute 15. marketplace inserts an ACTIVE listing.
- Players bid on it and their gold is held, while the seller equips the item, takes it into a
  run, or relists it.
- Settlement's `FreezeItem` is fenced on `listing_id`, so the item is never duplicated. The
  listing fails at settlement instead, and every bidder's gold stays held until then.

A late event needs no outage. items' outbox publishes 20 events per minute and is not woken on
reserve, so a burst of listings alone builds a backlog longer than 10 minutes.

Two further defects compound it:

- `HasLiveListing` fences by **item**, not listing. The reconciler can confirm reservation L2
  because an unrelated listing L1 on the same item is live.
- The consumer acks every unique violation as a duplicate. That includes
  `idx_one_active_listing_per_item` for a *different* listing id.

Chained (L1 cancelled, seller relists as L2, both events late), the item ends LISTED under a
listing that does not exist. The reconciler no longer sees it, and the seller cannot use it
again without a hand-edited row.

Two facts about items' rows make a fence possible:

- `listing_id` is minted per reserve, so "LISTED and `listing_id` = L" means the item is reserved
  for exactly listing L.
- Only two writes clear `reserved_at`: confirm, which keeps the item LISTED, and cancel, which
  also moves it to AVAILABLE. Cancel matches only while `reserved_at IS NOT NULL`. So once
  confirm has run, cancel can no longer take the item. The two are serialised on the item's
  row.

## Decision

**marketplace creates a listing only after items confirms that the item is still reserved for
that listing. Confirmation is an idempotent conditional write, not a read.**

1. **Validate, then confirm, then insert.**
   - Validate the listing terms first (`NewListing`). A refused event is dead-lettered without
     confirming, so its reservation stays visible to the reconciler, which cancels it as today.
   - Then call `ConfirmReservation(itemID, listingID)`.
   - Only if that succeeds, insert the listing. If it matches nothing, the item is no longer
     reserved for this listing (it was cancelled, or it was relisted under another id). The
     consumer acks and drops the event.
2. **Confirm is idempotent.** It matches `id = item AND listing_id = L AND status = 'LISTED'` and
   sets `reserved_at = NULL`. It no longer requires `reserved_at IS NOT NULL`. A redelivered
   event after a crash, a lost reply or a transient insert failure confirms again and succeeds.
   Cancel keeps its `reserved_at IS NOT NULL` condition, so a confirmed item stays out of the
   reconciler's reach. Confirm also stamps `updated_at = NOW()` for the backstop's grace period
   (rule 5).
3. **Only a primary-key conflict is a replay.** Inserting a listing whose id already exists is
   success. Any other unique violation is dead-lettered and logged as an error, never acked as a
   duplicate. A violation of the one-active-listing-per-item index in particular means data
   drift or a bug.
4. **Release a confirmed item only on a definite failure.** If the insert is definitively
   refused after a successful confirm, the consumer releases the item back to its seller before
   dead-lettering. This is the TCC Cancel; the release is fenced on `listing_id` and LISTED. If
   the insert's outcome is unknown (an ambiguous COMMIT), the consumer never releases: it
   requeues, and the retry either inserts or meets the existing row as a replay. Releasing on an
   unknown outcome would recreate the defect this ADR removes. This follows PlaceBid's rule for
   holds.
5. **Two backstops, both fenced by listing.**
   - The reservation reconciler checks the listing by **listing id**, not item id.
   - A second sweep covers an item that is confirmed but has no listing: LISTED,
     `reserved_at IS NULL`, confirmed more than a grace period ago (by `updated_at`), and no
     listing with that id exists in marketplace. It releases that item. The grace period
     protects a consumer that has confirmed but not yet inserted.

## Consequences

- **A late event can no longer list an item it doesn't own.** The event can arrive at any delay,
  and the reconciler can run at any time; the confirm/cancel pair on the item's row lets exactly
  one of them win. The outcome is either a LISTED item with a listing, or an AVAILABLE item with
  none.
- **The relist chain is closed.** A late L1 cannot confirm against an item now held by L2, and
  L2 is never silently acked away.
- **Most items no longer keep a stale `reserved_at`.** It is cleared at creation, so no item
  carries one through settlement, return or transfer. Clearing it in those statements too is a
  hygiene follow-up, not part of this decision.
- **Cost: one more cross-service call per listing.** It reuses the existing `ConfirmReservation`
  RPC, so no proto change is needed. That RPC is still tokenless (the service-credential
  stopgap).
- **Cost: a new items operation and a new sweep.** These are "release a confirmed reservation"
  and the confirmed-without-listing backstop. The backstop needs marketplace to answer "does
  listing L exist" by listing id.
- **No migration.** `updated_at` provides the backstop's age. A dedicated `confirmed_at` column
  would be clearer and remains open if `updated_at` proves too noisy.
- **Not decided here, but needed alongside:** waking items' outbox on reserve and draining it, so
  late events become rare; and making the `item.reserved` consumer fail loudly on a bad
  declare/bind, reconnect, survive a panic and back off on transient errors. These reduce how
  often the fence is exercised; they do not replace it.
- **Rejected:**
  - *Read the item's status before inserting.* A read fences nothing: the reconciler can cancel
    between the read and the insert. "LISTED" alone is also wrong after a relist; the listing id
    must match.
  - *Insert first, confirm after, delete the listing on failure.* The listing is visible and
    takes bids before the confirm, and deleting a listing that may already hold bids is a worse
    compensation than releasing an item.
  - *Insert into a hidden "reserving" status and activate after confirm.* This closes the window
    too, but needs a new listing status, a migration and FSM changes, for no gain over
    confirm-first.
  - *Lengthen the reconciler's 10-minute grace.* This only moves the window; any event later than
    the grace still creates the defect.
