# FS-04ZB6: Listings created only over a confirmed reservation

> Status: work-order · SPECIFICATION.md: `game-server/marketplace-service/SPECIFICATION.md` "### Listings & bids" → "Listings created only over a confirmed reservation"; `game-server/items-service/SPECIFICATION.md` "## Marketplace reservation" → "Reservation confirm and release by listing" → this FS · Related ADRs: [ADR-0050](../adr/0050-a-listing-is-created-only-after-its-items-reservation-is-confirmed.md) (implemented here), [ADR-0009](../adr/0009-idempotency-belongs-to-the-caller.md) (the listing id items mints is the idempotency key), [ADR-0024](../adr/0024-a-bids-hold-is-released-by-a-temporal-workflow-not-a-grpc-call.md) (precedent: compensate only once a write provably did not land) · Related FS: [FS-NXP1W](NXP1W-auction-settlement-saga.md) Req 24a (writes fenced on `listing_id`), Req 34 (stale-reservation reconciler) · Vocabulary: [`items-service/CONTEXT.md`](../../game-server/items-service/CONTEXT.md) (*reservation*, *confirmed reservation*) · Promoted 2026-11-05 under Nick's charter "listing confirm-at-creation" (item A). **[charter default]** marks a default Claude proposed and Nick approved; ADR-0050 was recorded without adversarial review.

> **Amended 2026-11-05** by Nick, after the first wave of slices (I-04ZB6-1, I-04ZB6-2) and before
> the branch was merged: two owner decisions, documentation only, no code change. They continue the
> charter-default numbering.
> **(A10) A9's precondition is accepted as it stands.** items has a `BEFORE UPDATE` trigger that
> stamps `updated_at` on every UPDATE of `item_instances`, so "no other write touches a LISTED item's
> `updated_at`" holds only by the writes that exist. Besides confirm, only `SetLocationTx` can touch a
> LISTED row, and only for legacy rows worn and listed before FS-HBXZN; a future data migration on
> `item_instances` would too. Each such write only restarts the grace: it delays the backstop, never
> releases early. No `confirmed_at` column.
> **(A11) The wider exposure of tokenless `ReleaseConfirmedReservation` is accepted.** It can release
> any confirmed reservation, which is every ACTIVE listing's item, and listing and item ids are
> public. Accepted until a NetworkPolicy or a service credential closes the reservation RPCs.
> Requirements 6 and 13 are corrected in place; each says *(Amended 2026-11-05, A10/A11 …)*.

> **Amended 2026-11-05** by Nick, after code review of all three slices and before the branch was
> merged: one owner decision, documentation only, no code change. It continues the numbering.
> **(A12) Rollout order: items-service deploys before marketplace-service.** The two do not deploy
> in either order. Old items confirms but answers an empty `ConfirmReservationResponse`, which new
> marketplace reads as `confirmed = false`, so it acks and drops every `item.reserved` event: each
> item stays LISTED with `reserved_at` NULL and no listing is created. Those items come back only
> after items is upgraded, when the backstop releases them once the 10-minute grace has passed. Old
> marketplace against new items is safe: it ignores `confirmed` and never calls the new RPCs. User
> Story 18 and the Edge States are corrected in place; each says *(Amended 2026-11-05, A12 …)*.

> **Amended 2026-11-05** by Nick, after the second code review and before the branch was merged:
> one mechanism correction, with a code change. It continues the numbering.
> **(A13) A replay is detected with `ON CONFLICT (id) DO NOTHING`, not by the reported constraint
> name.** The decision of Req 8 (A5) is unchanged: only a primary-key conflict is a replay. A
> replayed listing that is still ACTIVE breaks both `listings_pkey` and
> `idx_one_active_listing_per_item`, and Postgres reports only the first unique index it checks,
> in index OID order. On a fresh schema that is the primary key, but after
> `REINDEX INDEX CONCURRENTLY listings_pkey` it is the partial index, so a redelivery after a
> successful insert read as a definite refusal and released the item under a live listing. The
> insert now carries `ON CONFLICT (id) DO NOTHING`: zero rows affected is the replay, and any other
> unique violation still maps to `ErrDuplicateResource`. Requirement 8 is corrected in place; it
> says *(Amended 2026-11-05, A13 …)*. ADR-0050 rule 3 names no mechanism and stands as written.

## Summary

A seller lists an item. items reserves it (LISTED under a fresh listing id) and emits `item.reserved`. marketplace now creates the listing **only after items confirms the item is still reserved for that listing id**. A late event therefore can no longer put an ACTIVE listing over an item the stale-reservation reconciler has already handed back. A relist chain can no longer leave an item LISTED under a listing that does not exist. A confirmed item whose listing never got created is eventually handed back to its seller.

## Requirements

### items-service

1. **Confirm is idempotent and reports its outcome.** `ConfirmReservation(item_id, listing_id)`:
   - **Matches:** the item with that id, `status = 'LISTED'` and `listing_id` = the given id, whether or not `reserved_at` is set.
   - **On a match:** it sets `reserved_at = NULL` and `updated_at = NOW()` and answers `confirmed = true`.
   - **On no match:** it changes nothing and answers `confirmed = false`.
   - Today's `reserved_at IS NOT NULL` condition is dropped. **[charter default A3]** A redelivered event must confirm again and succeed; the reconciler's existing call is unaffected.
2. **`ConfirmReservationResponse` carries `bool confirmed`.** **[charter default A2]** The gRPC handler today discards the service's result and answers an empty message, so a caller can't tell a match from a miss. The field is additive, and existing callers that ignore it keep working.
3. **Cancel is unchanged.** `CancelReservation` still matches only while `reserved_at IS NOT NULL`. So once confirm has run, the stale-reservation reconciler can never cancel that item. Confirm and cancel serialise on the item's row, and exactly one of them can take a waiting reservation (ADR-0050).
4. **Release a confirmed reservation.** New RPC `ReleaseConfirmedReservation(item_id, listing_id)`. **[charter default A4]**
   - **Matches:** `status = 'LISTED'`, `listing_id` = the given id, `reserved_at IS NULL`.
   - **On a match:** it moves the item to `AVAILABLE` with `listing_id = NULL` and answers `released = true`.
   - **On no match:** it changes nothing and answers `released = false`.
   - This is the TCC Cancel for a confirmed reservation whose listing will never exist. It never touches a waiting reservation (that is `CancelReservation`'s job) or an item past LISTED.
5. **List confirmed reservations.** New RPC `ListConfirmedReservations(older_than, after, limit)`. **[charter default A8]**
   - **Returns:** `(item_id, listing_id)` for items with `status = 'LISTED'`, `listing_id IS NOT NULL`, `reserved_at IS NULL`, and `updated_at < NOW() - older_than`. Age is measured on items' database clock.
   - **Paging:** keyset ordered by `(updated_at, id)`, so a run of entries that keep failing cannot starve the rest.
   - `older_than` must be positive; `limit` is clamped to at most 100.
6. **The three reservation RPCs stay tokenless.** `ConfirmReservation`, `ReleaseConfirmedReservation` and `ListConfirmedReservations` join `CancelReservation` and `ListStaleReserved` in `common/auth/interceptor.go` `publicMethods`, under the same stopgap note. A service credential would replace them. **[charter default A4]** *(Amended 2026-11-05, A11: accepted that tokenless `ReleaseConfirmedReservation` can release any confirmed reservation, i.e. every ACTIVE listing's item, whose ids are public, until a NetworkPolicy or service credential lands.)*

### marketplace-service: creating a listing

7. **Validate, then confirm, then insert.** **[charter default A1]** On `item.reserved`:
   1. Validate the listing terms (`NewListing`). A refused event is dead-lettered without confirming. Its reservation stays waiting, so the reconciler cancels it as today.
   2. Call `ConfirmReservation(item, listing)`.
      - `confirmed = false`: the item is no longer reserved for this listing (cancelled, relisted, or past LISTED). Ack and drop the event with an info log.
      - Confirm call fails (transport error): requeue. Nothing was decided.
   3. Insert the listing.
8. **Only a primary-key conflict is a replay.** **[charter default A5]**
   - **Conflict on `listings_pkey`** (a listing with this id already exists): success; ack.
   - **Any other unique violation**, including `idx_one_active_listing_per_item`: logged at error, the item released (Req 10), the event dead-lettered.
   - The decision is made by `ON CONFLICT (id) DO NOTHING`: zero rows affected is the replay; every remaining 23505 maps to `ErrDuplicateResource`. *(Amended 2026-11-05, A13; was: "The decision needs the violated constraint's name. Today every 23505 maps to `ErrDuplicateResource`." Postgres reports only the first unique index broken, in OID order, so the name cannot tell a replay from a collision.)*
9. **A definite failure releases; an unknown outcome retries.** **[charter default A6]** After a successful confirm, an insert failure is one of two kinds:
   - **Definite:** a domain refusal of the listing, or a non-PK unique violation.
   - **Unknown:** anything else, including an ambiguous COMMIT, a lost connection, or a timeout.
   - Only a definite failure releases the item. An unknown one is requeued, and the retry either inserts or meets the row already there as a replay. Releasing on an unknown outcome could free an item whose listing did land, which is the defect ADR-0050 removes.
10. **Release, then dead-letter.**
    - On a definite failure, call `ReleaseConfirmedReservation(item, listing)`, then dead-letter the event with an error log.
    - If the release call itself fails, requeue instead. The retry confirms (idempotent), meets the same definite failure, and releases again.
    - If the release answers `released = false`, dead-letter anyway and log it.

### marketplace-service: reconciling

11. **The stale-reservation reconciler fences by listing.** **[charter default A7]** `HasLiveListing` takes the listing id. A reservation for listing L counts as matched only if listing L itself is ACTIVE or PENDING_SETTLEMENT. Another listing on the same item no longer counts.
12. **The confirmed-without-listing backstop.** **[charter default A8]**
    - **When:** on the existing reconcile tick (every 5 min), after the stale-reservation pass.
    - **What it reads:** `ListConfirmedReservations(older_than = 10 min)`, page by page.
    - **Per entry:** check whether a listing with that id exists in **any** status.
      - None: call `ReleaseConfirmedReservation`.
      - One exists but is no longer live (EXPIRED, SOLD, CANCELLED, SETTLEMENT_FAILED): log a warning and skip. That item is stuck for a different reason and needs a human.
      - One exists and is live: nothing to do.
    - **The grace** keeps the backstop away from a consumer that has confirmed but not yet inserted.
13. **No migration.** **[charter default A9]** The confirm age is `updated_at`, stamped by confirm.
    - Precondition, to verify during implementation: no other write touches a LISTED item's `updated_at` without being a confirm.
    - If one does, it only delays the backstop. Escalate rather than add a column.
    - *(Amended 2026-11-05, A10; was: "Precondition, to verify during implementation".)* Verified and
      accepted: a `BEFORE UPDATE` trigger stamps `updated_at` on every UPDATE. Besides confirm, only
      `SetLocationTx` can touch a LISTED row, and only a legacy row worn and listed before FS-HBXZN; a
      future data migration on `item_instances` would too. Each only delays the backstop, never
      releases early. No escalation, no column.

## User Stories

1. As a seller, I want my listing to appear only while my item is really reserved for it, so that I never have an auction running over an item I can still equip.
2. As a bidder, I want every listing I can bid on to be backed by its item, so that my held gold isn't tied up in an auction that can only fail at settlement.
3. As marketplace, I want to learn whether a confirm matched, so that I can tell a live reservation from one the reconciler already cancelled.
4. As marketplace, I want confirm to succeed again on a redelivered event, so that a crash or lost reply after confirming never strands the item.
5. As items-service, I want confirm and cancel to be mutually exclusive on a waiting reservation, so that a late event and the reconciler cannot both win.
6. As the stale-reservation reconciler, I want to judge a reservation by its own listing id, so that a different live listing on the same item never confirms it.
7. As marketplace, I want a replayed event to be recognised by its listing id alone, so that I never silently drop a different listing that collided on the item.
8. As marketplace, I want to release a confirmed item only when its listing provably will not exist, so that I never free an item under a listing that did land.
9. As a seller, I want an item whose listing could not be created to come back to me, so that it isn't LISTED forever with nothing for sale.
10. As an operator, I want a non-replay unique violation logged at error and dead-lettered, so that data drift is visible instead of acked away.
11. As the backstop, I want to wait out a grace period before releasing a confirmed item, so that I don't race a consumer between its confirm and its insert.
12. As the backstop, I want to page through confirmed reservations, so that entries that keep failing cannot hide the rest.
13. As the backstop, I want to skip an item whose listing exists but ended, so that I don't hand back an item whose state needs a human.
14. As a seller who relisted, I want a late event for my old listing to be dropped, so that my new listing keeps the item.
15. As items-service, I want release to touch only a confirmed reservation for the given listing, so that it never undoes a waiting reservation or an item past LISTED.
16. As a caller of the reservation RPCs, I want them reachable without a member token, as the reconciler's already are, so that a background consumer can use them (until a service credential exists).
17. As marketplace, I want a transport failure on confirm or release to requeue the event, so that a momentary outage never decides the reservation's fate.
18. As a maintainer, I want the reconciler's existing confirm call to keep working against the changed RPC, so that items-service can deploy first while the old marketplace still runs. *(Amended 2026-11-05, A12; was: "so that the two can deploy in either order". items deploys first; a new marketplace against an old items drops every event, see Edge States.)*

## Acceptance Criteria

### items-service

- [ ] Confirm on a waiting reservation (LISTED, same listing id, `reserved_at` set): `confirmed = true`, `reserved_at` becomes NULL, and `updated_at` is stamped.
- [ ] Confirm repeated on an already confirmed reservation (same listing id): `confirmed = true`, the item still LISTED.
- [ ] Confirm with a different listing id, on an AVAILABLE item, or on a PENDING_SETTLEMENT item: `confirmed = false`, and nothing changes.
- [ ] Cancel after confirm: matches nothing, and the item stays LISTED.
- [ ] Confirm after cancel: `confirmed = false`, and the item stays AVAILABLE.
- [ ] Release on a confirmed reservation for the same listing id: the item is AVAILABLE with listing id NULL, `released = true`.
- [ ] Release on a waiting reservation (`reserved_at` set), with another listing id, or on an item not LISTED: `released = false`, and nothing changes.
- [ ] `ListConfirmedReservations` returns only LISTED, listing-id-set, `reserved_at` NULL items older than `older_than`, ordered by `(updated_at, id)`, paged by keyset without skipping or repeating. It refuses `older_than ≤ 0`. Pinned against a database.
- [ ] `ConfirmReservationResponse.confirmed` is generated from `items.proto`, not hand-edited. The two new RPCs are generated too.
- [ ] The three RPCs are reachable without a token (`publicMethods`).

### marketplace-service

- [ ] An event whose terms fail validation is dead-lettered, and confirm is never called.
- [ ] An event whose confirm answers `confirmed = false` is acked, and no listing is inserted.
- [ ] An event whose confirm succeeds inserts an ACTIVE listing.
- [ ] A redelivered event after a successful insert: confirm succeeds, the insert meets `listings_pkey`, the event is acked, and there is still one listing.
- [ ] A redelivered event after confirm but before insert: the listing is inserted.
- [ ] An insert that violates `idx_one_active_listing_per_item`: `ReleaseConfirmedReservation` is called, the event is dead-lettered, and an error is logged. It is never acked as a duplicate.
- [ ] An insert with an unknown outcome: the event is requeued, and release is **not** called.
- [ ] A confirm or release transport failure: the event is requeued.
- [ ] The stale-reservation reconciler confirms reservation L only when listing L is ACTIVE or PENDING_SETTLEMENT, and another live listing on the same item does not count. Otherwise it cancels as today.
- [ ] The backstop:
  - releases a confirmed reservation older than 10 min whose listing id exists nowhere;
  - leaves one whose listing is live;
  - warns and skips one whose listing exists but ended;
  - never sees a confirmation younger than 10 min.
- [ ] The full suites pass in items-service, marketplace-service and common; generated proto files are verified as regenerations.

## Edge States

- **Late event after cancel.** The reconciler cancelled at minute 10 and the event arrives at minute 15. Confirm answers `false`, and the event is dropped. The item stays with its seller, and no listing exists.
- **Relist chain (L1/L2).** L1 is cancelled, the seller relists as L2, and both events arrive late.
  - L1's confirm answers `false` (the item is under L2), so L1 is dropped.
  - L2 confirms and inserts.
  - If L1 had somehow been inserted before this FS, L2's insert meets `idx_one_active_listing_per_item`: release L2's confirmed item, dead-letter, error log.
- **Redelivery after confirm.** A crash, lost reply or transient insert failure after confirm. The retry confirms again (`true`) and inserts, or meets `listings_pkey` as a replay.
- **Ambiguous insert COMMIT.** The outcome is unknown: requeue and never release. The retry either inserts or finds the row and acks.
- **Definite insert refusal after confirm.** Release the item, then dead-letter. If release fails, requeue and redo.
- **Confirm and reconciler cancel at the same instant.** They serialise on the item row, and exactly one wins. Confirm first: the cancel matches nothing. Cancel first: the confirm answers `false`.
- **Backstop grace race.** A consumer confirmed less than 10 min ago and hasn't inserted yet. The backstop doesn't list it, because `updated_at` is too recent.
- **Backstop and insert land together after the grace.** The consumer stalled more than 10 min between confirm and insert (very unlikely).
  - The backstop sees no listing and releases.
  - The consumer's insert then succeeds over an AVAILABLE item, which is the defect again.
  - Accepted as residual: it needs a stall longer than the grace. Recorded, not engineered away.
- **Legacy LISTED rows with `reserved_at` NULL** (from before the column existed). Their listings exist, so the backstop leaves them. A ghost among them, with no listing at all, is released, which is the right outcome.
- **A stale event while the item is PENDING_SETTLEMENT.** Confirm answers `false` (the item is no longer LISTED), and the event is dropped. The listing already exists and settles normally.
- **The listing exists but ended while the item is still LISTED** (e.g. a failed ReturnItem). The backstop warns and skips; a human decides.
- **marketplace is down between confirm and insert.** The event stays unacked and is redelivered. Same as redelivery after confirm.
- **Rollout: items deployed before marketplace** *(Amended 2026-11-05, A12; new edge state)*. Old marketplace against new items is safe: it ignores `confirmed`, and its reconciler's confirm call still works.
- **Rollout: new marketplace against old items** *(Amended 2026-11-05, A12; new edge state)*. Not a supported order.
  - Old items confirms but answers an empty `ConfirmReservationResponse`, which reads as `confirmed = false`.
  - Every `item.reserved` event is acked and dropped. Each item stays LISTED with `reserved_at` NULL, and no listing is created.
  - Once items is upgraded, the backstop releases those items after the 10-minute grace.

## API surface

gRPC (items-service, `common/api/proto/items/items.proto`); no HTTP change.

| Op | RPC | Request | Response | Errors |
|----|-----|---------|----------|--------|
| Confirm a reservation (changed) | `ConfirmReservation` | `item_id`, `listing_id` (both required uuids) | `{ confirmed: bool }`, new field | `InvalidArgument` for a malformed id; `Internal` for a DB failure |
| Release a confirmed reservation (new) | `ReleaseConfirmedReservation` | `item_id`, `listing_id` (both required uuids) | `{ released: bool }` | `InvalidArgument` for a malformed id; `Internal` for a DB failure |
| List confirmed reservations (new) | `ListConfirmedReservations` | `older_than` (Duration, > 0), `after` (optional opaque keyset position), `limit` (≤ 100) | `{ reservations: [ {item_id, listing_id} ], next }` | `InvalidArgument` for `older_than ≤ 0` or a malformed cursor; `Internal` for a DB failure |

All three are tokenless (`publicMethods`), like the existing reservation RPCs.

## Out of Scope

- `item.reserved` consumer resilience: failing loudly on declare/bind, reconnecting, panic recovery, backoff (charter item B, deferred).
- items outbox `Wake`, drain, and row locking or leases for multi-replica publishing (deferred; outbox to be handled separately).
- Clearing `reserved_at` in `ReturnItem`, `TransferItem` and `UnfreezeItem` (hygiene follow-up, ADR-0050).
- LISTED rows with `listing_id` NULL (legacy, not swept).
- A service credential for the tokenless reservation RPCs.
- Settlement, wallet, the HTTP contract, the client, and migrations.
