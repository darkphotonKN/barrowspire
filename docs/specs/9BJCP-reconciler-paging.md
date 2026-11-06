# FS-9BJCP: Reconcilers page through every stale candidate

> Status: work-order · SPECIFICATION.md: `game-server/marketplace-service/SPECIFICATION.md` "### Auction lifecycle" → "Reconcilers reach every stale candidate each pass"; `game-server/wallet-service/SPECIFICATION.md` "### Holds" → "Page through stale reserved holds"; `game-server/items-service/SPECIFICATION.md` "## Marketplace reservation" → "Page through stale reservations" → this FS · Related ADRs: [ADR-0012](../adr/0012-cursors-are-opaque-sort-keys-carrying-no-identity.md) (cursor wire format), [ADR-0024](../adr/0024-a-bids-hold-is-released-by-a-temporal-workflow-not-a-grpc-call.md) (the reconciler is the backstop for a release that never started), [ADR-0050](../adr/0050-a-listing-is-created-only-after-its-items-reservation-is-confirmed.md) (the reservation reconciler fenced by listing) · Related FS: [FS-04ZB6](04ZB6-listing-confirm-at-creation.md) (the same paging rules for its backstop: no-progress guard, pass deadline, per-page lookup), FS-A3CQH (wallet hold sweep paging, on another branch), [FS-NXP1W](NXP1W-auction-settlement-saga.md) Req 34 (the stale-reservation reconciler) · Scoped and promoted 2026-11-05 under Nick's charter "reconciler paging". **[charter default]** marks a default Claude proposed and Nick approved in the charter.

## Summary

marketplace runs two reconcilers on a ticker. The stale-reservation reconciler asks items for
reservations still waiting for their listing; the hold reconciler asks wallet for reservations of
gold older than 10 minutes and releases the ones no bid claims. Each reads only the oldest 100
candidates per tick and has no cursor, so a head of candidates that fail, or that are legitimately
claimed, starves every candidate behind it for good. This feature makes both reconcilers read every
candidate on every pass, in keyset pages of 100.

## Requirements

### items-service: stale reservations page

1. **`ListStaleReserved` pages with a keyset.** **[charter default]** The request gains an optional
   `after` (opaque cursor) and a `limit`; the response gains `next`. Rows are ordered by
   `(reserved_at, id)` and the page starts strictly after `after`. `limit` ≤ 0 or > 100 is read as
   100, and today's callers, which send no limit, get 100. *Reason: a cursor lets a caller pass a
   page it could not resolve, which a fixed "oldest 100" read can never do.*
2. **`next` is set only when another row follows.** The read fetches `limit + 1` rows; `next`
   encodes the position of the last row returned, and is empty on the last page.
3. **The filter is unchanged:** LISTED, `listing_id` set, `reserved_at` set and older than
   `older_than` on items' database clock (NOW()).
4. **A malformed `after` is `InvalidArgument`**, like a missing or non-positive `older_than`.
5. **The cursor is a new `cursor.ReservedAt` shape** in `common/utils/cursor`, keyed by
   `(reserved_at, id)`, using the ADR-0012 wire format, as FS-04ZB6's `cursor.UpdatedAt` does.
   **[charter default]** *Reason: one cursor format across services; the field name says which
   column the keyset reads.*

### wallet-service: stale reserved holds page

6. **`ListStaleReservedHolds` pages with a keyset.** **[charter default]** The request gains an
   optional `after`; the response gains `next`. Rows are ordered by `(created_at, bid_id)` and the
   page starts strictly after `after`. The existing `limit` keeps its clamp to 100. *Reason: the
   same as Req 1.*
7. **`next` is set only when another row follows** (limit + 1 probe), as in Req 2.
8. **The filter is unchanged:** RESERVED and `created_at` before the caller's `reserved_before`.
   The existing partial index `idx_wallet_holds_stale` (created_at) WHERE RESERVED serves the read.
9. **A malformed `after` is `InvalidArgument`**, like a missing `reserved_before`.
10. **The cursor reuses `cursor.Cursor`** (`CreatedAt`, `ID` = the bid id). **[charter default]**
    *Reason: the keyset is exactly (created_at, id), the shape `Cursor` already has.*

### marketplace-service: both reconcilers read every page

11. **Each pass reads pages until `next` is empty.** **[charter default]** Both the stale-reservation
    reconciler and the hold reconciler start from the first page on every tick and walk forward.
    *Reason: a row that fails or is skipped stays behind the cursor, so it can no longer hide the
    rows after it.*
12. **No-progress guard.** If a page answers a `next` equal to the cursor just sent, the pass stops
    with an error rather than loop. **[charter default]** *Reason: a misbehaving server must not
    spin the reconcile goroutine (FS-04ZB6 review).*
13. **Pass deadline.** Each pass runs under a 2-minute deadline and stops between pages and between
    rows once it passes, reporting the deadline once. Each reconciler use case applies the deadline
    itself, at the top of its `Handle` (`reconcilePassTimeout`), so every pass gets it whichever
    worker runs it. *(Amended 2026-11-05, FS-9BJCP review P1; was: "The stale-reservation pass
    already runs under `reconcile.go`'s per-pass deadline; the hold reconciler's worker gains the
    same.")*
    **[charter default]** *Reason: a slow page or a slow release must not delay the next tick
    indefinitely.*
14. **Per-row failure isolation is kept.** A row whose ids don't parse, whose lookup fails, or whose
    write fails is logged and skipped; the pass goes on with the next row and the next page. A
    page read that fails ends the pass with an error; rows already handled stay handled and the
    next tick starts again from the first page.
15. **The hold reconciler asks once per page which bids claim gold.** **[charter default]** One
    query over the page's bid ids (`id = ANY($1) AND status NOT IN ('CANCELLED','FAILED')`)
    replaces the per-row `HasBidHoldingGold`; every bid id not returned is unclaimed and its hold
    is released as today (wallet `ReleaseHold`). A failed claim query releases nothing on that page
    and the pass moves to the next page. *Reason: every live auction's hold older than 10 minutes
    is a candidate on every tick, so the per-row lookup grows with the number of live bids.*
16. **Decisions are unchanged.** The stale-reservation reconciler still confirms a reservation whose
    listing is live (by listing id, FS-04ZB6) and cancels the rest; the hold reconciler still
    releases only holds no recorded bid claims; the 10-minute grace on both is unchanged.
17. **One info line per pass** with the counts handled (reconciled / released, and skipped); one
    warn or error line per failing row, as today.

### Compatibility

18. **The proto fields are additive and any deploy order is safe.** **[charter default]** An old
    items or wallet ignores `after` and returns no `next`, so a new marketplace reads one page and
    stops: exactly today's behaviour. An old marketplace sends no `after` and reads the first page,
    as it does today. *Reason: services ship as separate images.*
19. **No migration.** **[charter default]** wallet's read is already indexed. items'
    `ListStaleReserved` has no index on `reserved_at` and scans `item_instances` today; this FS
    keeps that, and only the number of passes over the result changes. *Reason: the charter
    excludes migrations; the stale-reservation set is small (unconfirmed reservations only).*

## User Stories

1. As the stale-reservation reconciler, I want to read every stale reservation on each pass, so that an orphan is cancelled even when 100 others ahead of it keep failing.
2. As the stale-reservation reconciler, I want to pass a reservation I cannot resolve, so that it does not block the rest of the pass.
3. As the hold reconciler, I want to read every stale reserved hold on each pass, so that an orphaned hold is released even behind hundreds of holds that live bids claim.
4. As the hold reconciler, I want to ask once per page which bids claim gold, so that a pass costs one query per page, not one per live bid.
5. As the hold reconciler, I want a failed claim query to release nothing, so that not knowing whether a bid exists never frees its gold.
6. As either reconciler, I want to stop when a page makes no progress, so that a misbehaving server cannot spin me.
7. As either reconciler, I want each pass bounded by a deadline, so that the next tick is never starved.
8. As either reconciler, I want a failed page read to end the pass with an error, so that the next tick retries from the first page.
9. As an operator, I want one log line per pass with the counts, so that I can see each reconciler working.
10. As items-service, I want to page stale reservations by `(reserved_at, id)`, so that ties on `reserved_at` are neither skipped nor repeated.
11. As wallet-service, I want to page stale reserved holds by `(created_at, bid_id)`, so that ties on `created_at` are neither skipped nor repeated.
12. As items-service and wallet-service, I want a malformed cursor refused as `InvalidArgument`, so that a bad position is never read as "start over".
13. As items-service and wallet-service, I want `next` only when another row follows, so that the caller can tell the last page without an extra read.
14. As the team, I want either service deployed before or after marketplace, so that rollout needs no ordering.
15. As the team, I want no migration, so that this ships with the rest of the branch.
16. As a bidder, I want my orphaned hold released within a few ticks however many auctions are live, so that my gold is not held for nothing.
17. As a seller, I want an orphaned reservation of my item cancelled within a few ticks, so that I can use or relist the item.

## Acceptance Criteria

- [ ] items `ListStaleReserved`: rows ordered by `(reserved_at, id)`; `after` starts strictly after the position; `limit` clamped to 100 (absent → 100); `next` set only when another row follows; a malformed `after` → `InvalidArgument`. Pinned against the database, including ties on `reserved_at` with no skip or repeat across pages.
- [ ] wallet `ListStaleReservedHolds`: rows ordered by `(created_at, bid_id)`; `after` starts strictly after; existing clamp kept; `next` only when another row follows; a malformed `after` → `InvalidArgument`. Pinned against the database, including ties on `created_at`.
- [ ] `cursor.ReservedAt` round-trips (encode → decode) and the empty string decodes to "no cursor".
- [ ] Stale-reservation reconciler: a pass with a full page of always-failing rows followed by one orphan cancels the orphan in the same pass.
- [ ] Hold reconciler: a pass with more than one page of claimed holds followed by one unclaimed hold releases it in the same pass, issuing one claim query per page.
- [ ] Hold reconciler: a failed claim query releases nothing on that page and the next page is still read.
- [ ] Both: a `next` equal to the cursor sent stops the pass with an error; a cancelled or expired pass context stops between pages and rows and reports it once; a failed page read ends the pass with an error after rows already handled.
- [ ] The hold reconciler runs each pass under the 2-minute deadline, applied in its use case's `Handle`. *(Amended 2026-11-05, FS-9BJCP review P1; was: "The hold reconciler's worker runs each pass under the 2-minute deadline.")*
- [ ] Old-server compatibility: a page with no `next` ends the pass after that page.
- [ ] The confirm/cancel and release decisions, the listing-id fence and the 10-minute grace are unchanged (existing tests stay green).
- [ ] Protos regenerated with the repo's target; no hand-edited `.pb.go`; only the items and wallet outputs change.

## Edge States

- **A full page of rows that always fail or are skipped, then an orphan.** The cursor moves past the failing page, so the orphan is reached in the same pass. The failing rows are retried next tick.
- **A page read fails mid-pass.** The pass ends with an error. Rows already handled stay handled; the next tick starts from the first page.
- **No-progress cursor.** A server answering the `next` it was sent stops the pass with an error (Req 12).
- **Pass deadline.** The pass stops between pages or rows when its deadline passes, reports it once, and the next tick starts again (Req 13). With very large backlogs the newest candidates are the ones not reached in that pass; they are reached on later ticks.
- **Old server ignores `after`.** It returns the first page and no `next`; the caller stops after one page, which is today's behaviour, in either deploy order (Req 18).
- **The hold reconciler reads every live auction's hold.** Every RESERVED hold older than 10 minutes is a candidate on each tick, almost all of them claimed by live bids; the per-page claim query keeps the cost at one query per 100 holds (Req 15).
- **A hold placed seconds ago.** Still excluded by the 10-minute grace (`reserved_before`), so a hold mid-write is never judged.
- **Ties.** Many reservations or holds share a timestamp (a burst of listings, many bids in one second); the `id` / `bid_id` tie-break keeps paging exact.
- **Rows change during the pass.** A reservation confirmed or cancelled, or a hold released, after its page was read is simply absent from later pages; the writes stay fenced as today, so a row acted on twice is a no-op.
- **A row whose ids don't parse.** Logged and skipped (Req 14), as today.

## API surface

gRPC only; no HTTP change.

| Op | RPC | Request | Response | Errors |
|----|-----|---------|----------|--------|
| List stale reservations (changed, items) | `ListStaleReserved` | `older_than` (Duration, > 0), `after` (optional opaque keyset position, new), `limit` (≤ 100, new; absent → 100) | `{ reservations: [ {item_id, listing_id} ], next }` (`next` new) | `InvalidArgument` for `older_than ≤ 0` or a malformed cursor; `Internal` for a DB failure |
| List stale reserved holds (changed, wallet) | `ListStaleReservedHolds` | `reserved_before` (Timestamp, required), `limit` (existing, ≤ 100), `after` (optional opaque keyset position, new) | `{ bid_ids, next }` (`next` new) | `InvalidArgument` for a missing `reserved_before` or a malformed cursor; `Internal` for a DB failure |

Both stay tokenless (`publicMethods`), as today.

## Out of Scope

- An index on `item_instances.reserved_at` (needs a migration).
- Measuring the hold reconciler's 10-minute age on wallet's clock instead of marketplace's (today's `reserved_before` is computed by the caller).
- FS-04ZB6's confirmed-reservation backstop (already paged) and FS-A3CQH's hold sweep (another branch).
- Outbox locking, `item.reserved` consumer resilience, and the service credential for these tokenless RPCs.
- Persisting a cursor across ticks.
