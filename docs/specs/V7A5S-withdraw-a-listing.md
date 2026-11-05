# FS-V7A5S: Withdraw a listing

> Status: work-order · SPECIFICATION.md: `game-server/marketplace-service/SPECIFICATION.md` "### Listings & bids" → "Withdraw a listing"; `game-server/api-gateway/SPECIFICATION.md` "### Marketplace" → "Withdraw a listing"; `game-client/SPECIFICATION.md` "### Marketplace" → "Withdraw my listing" → this FS · Related ADRs: [ADR-0051](../adr/0051-a-listing-may-be-withdrawn-with-live-bids-except-in-its-final-30-minutes.md) (this decision), [ADR-0024](../adr/0024-a-bids-hold-is-released-by-a-temporal-workflow-not-a-grpc-call.md) (durable release by workflow), [ADR-0028](../adr/0028-a-withdrawn-leader-is-replaced-by-the-next-highest-bid.md) (bid withdrawal rules), ADR-0048 (final-30-minute leader lock; on an unmerged branch) · Related FS: [FS-NXP1W](NXP1W-auction-settlement-saga.md) Req 3 (AcceptBid), Req 12 (pre-pivot rollback) and its Edge State "Listing withdrawn before 0a runs", [FS-49Z37](49Z37-marketplace-sale-actions.md) (the seller block), [FS-EYQ8K](EYQ8K-my-bids.md) (My bids), [FS-8EGFA](8EGFA-marketplace-web-page.md) (My listings, the "Withdrawn" status label)

> Every decision marked **[charter default]** was proposed by Claude and approved by Nick in the
> charter "listing withdraw + listing limits" on 2026-11-05 (item A as revised: withdrawal is
> allowed with bids). None were run through challenge-me. Gaps the charter left open and the
> agent filled are marked **(agent default)**.

> **Amended 2026-11-05** by Nick, while slice 2 was being built: withdrawing a listing is **not**
> email-gated. FS-V6SFK Req 30 keeps withdraw-bid, accept and reads open to unverified members
> because a gate never traps someone in a commitment they already made, and a withdrawal only
> exits a commitment. Req 11, the transport acceptance criterion, the gRPC and HTTP rows of
> §API surface are corrected in place; each says *(Amended 2026-11-05, …; was: …)*.

> **Amended 2026-11-05** by Nick, after code review: a failed workflow start **no longer answers
> success**. The use case keeps the CANCELLED write and returns a transient error (503); the
> client keeps the confirm open and the seller's retry, a Req 4 repeat, starts the workflow again.
> A backstop on marketplace's reconcile tick (re)starts the workflow for every listing CANCELLED
> in the last 24 hours, which also covers a crash between the commit and the start. Req 8, Req 16,
> the use-case acceptance criterion, the Edge State "Workflow start fails" and the §API surface
> HTTP row (which also gains the row-lock `409 · CONFLICT`) are corrected in place; each says
> *(Amended 2026-11-05, …; was: …)*.

> **Amended 2026-11-05** by Nick, after the backstop was built: the backstop's **24-hour window
> is replaced by a per-listing "workflow started" marker**, `listings.withdrawal_started_at`.
> The withdrawal's write leaves it NULL; it is set (fenced) once the start lands or the starter
> answers already-started, and the backstop starts exactly the CANCELLED listings still NULL,
> however old. Why: with no window no outage is too long; the candidate set is normally empty,
> so a tick makes no RPC per historical withdrawal; and the decision lives in marketplace's own
> table rather than depending on Temporal's history retention. Only "started" is recorded, not
> "finished": once started, the workflow's uncapped retries finish it. **This amendment adds a
> migration** (`000011_listing_withdrawal_started_at`: the column and a partial index for the
> backstop's read), which the original Out of Scope excluded. Req 8, the backstop acceptance
> criterion, the Edge States "Workflow start fails" and "Crash between the CANCELLED commit and
> the start", and Out of Scope are corrected in place; each says
> *(Amended 2026-11-05, …; was: the 24-hour window …)*.

## Summary

A seller can take their own listing down. While the auction is open, not bought out and not
ended, the seller withdraws it: the listing becomes CANCELLED, every bid still holding gold
becomes LOST, and a durable workflow returns the item to the seller and gives every bidder their
gold back. A listing with live bids cannot be withdrawn in its final 30 minutes. The whole path
is wired: marketplace gRPC, an HTTP route, and a Withdraw action for the seller in the web
client, plus wording that tells a bidder their auction was withdrawn rather than lost.

## Requirements

### A. Who may withdraw, and when (marketplace domain)

1. **Only the seller.** A withdrawal by any other member is refused with `ErrNotSeller`
   (existing; PermissionDenied). The seller is the authenticated caller, never a request field.
   The seller check comes first, so a non-seller learns nothing about the listing's state.
   [charter default A1]
2. **Only an open auction.** The listing must be ACTIVE, before `endsAt`, and not bought out —
   the same rule `AcceptsBidAt` already states for a bid change. Bought out → the existing
   `ErrListingNotAcceptingBids`; past its end → `ErrListingExpired`; any other status →
   `ErrListingNotAcceptingBids`. [charter default A1]
3. **The final 30 minutes, when contested.** A listing with at least one *live bid* (PENDING,
   WINNING or OUTBID) cannot be withdrawn from `endsAt − 30 min` (inclusive) to its end: refused
   with a new domain error `ErrListingWithdrawLocked`. A listing without live bids can be withdrawn
   up to its end. The window is a constant (`ListingWithdrawLock = 30 * time.Minute`), tuning not
   contract, closed at its start like ADR-0048's. [charter default A2]
4. **Repeating is success.** A withdrawal by the seller of a listing already CANCELLED returns
   success and changes nothing. (Any other non-ACTIVE status is refused per Req 2.)
   [charter default A6]

### B. The write (marketplace)

5. **One locked write.** Under the listing's row lock (`repo.Update`, the `SELECT … FOR UPDATE`
   path, not the OCC `Save` path the unwired use case uses today), the aggregate applies Reqs 1–4,
   then moves the listing ACTIVE → CANCELLED and every live bid → LOST. CANCELLED and FAILED bids
   are left alone; LOST is reused, no new status and no migration. [charter default A3]
6. **The domain owns it.** A new aggregate verb (e.g. `Listing.Withdraw(memberID, now)`) holds
   the rules; the existing `Listing.Cancel` may be reused for the status move. The existing
   unwired `WithdrawListingUC` is rewritten to call it through `repo.Update`, then start the
   workflow (Req 7). (agent default: rewrite in place rather than add a second use case)
7. **Side effects by workflow, after the commit.** On a successful write (including the Req 4
   repeat) the use case starts the Temporal workflow `withdraw-listing-{listingId}`
   (`REJECT_DUPLICATE`; "already started" is success), hosted on marketplace's task queue like
   `releasehold`. Its input is the listing id, the item id and every bid id on the listing
   (statuses unfiltered, as settlement step 0a passes them). It runs two activities, retries
   uncapped (no ScheduleToClose, unlimited attempts), as `releasehold`'s policy:
   - items `ReturnItem{ItemID, ListingID}` — returns the item to its seller, fenced on the listing
     id (existing NB1 activity, unchanged);
   - wallet `ReleaseAllHolds{ListingID, BidIDs}` — releases every hold, skipping a bid it holds
     nothing for (existing rollback activity, unchanged).
   The two are independent; order is not significant. [charter default A4]
8. **A failed start is reported, never rolled back.** The start runs on a context detached
   from the request's cancellation with a short timeout. If it fails, the CANCELLED write stays
   (it is committed and is the truth) and the use case returns a transient error, so the call
   answers `503 · SERVICE_UNAVAILABLE`. The seller's retry is a Req 4 repeat on a CANCELLED
   listing, which succeeds and starts the workflow again. **Started marker:** the CANCELLED write
   leaves `listings.withdrawal_started_at` NULL. Once `withdraw-listing-{id}` starts, or the
   starter answers already-started, the use case marks it with a fenced update
   (`SET withdrawal_started_at = NOW() WHERE id = $1 AND status = 'CANCELLED' AND
   withdrawal_started_at IS NULL`); a failed mark is logged only and the call still succeeds,
   because the backstop's next start is a `REJECT_DUPLICATE` no-op that marks it then. Only
   "started" is recorded, never "finished": once started, uncapped retries finish it.
   **Backstop:** on marketplace's existing reconcile tick, a pass starts `withdraw-listing-{id}`
   for every CANCELLED listing whose `withdrawal_started_at` is NULL, with no time window,
   paging all of them (keyset on `(updated_at, id)`, served by a partial index on exactly those
   rows), with the same input Req 7 builds, and marks each start that lands; a failed start
   stays unmarked for the next tick. This also covers a crash between the CANCELLED commit and
   the start, however long ago. A failing start or mark does not stop the others, a failing pass
   does not stop the tick's other passes, and the pass is bounded by its own deadline.
   *(Amended 2026-11-05, Nick: no window means no outage is too long, the normally empty
   candidate set means no per-tick RPC per historical withdrawal, and the decision no longer
   depends on Temporal's history retention; adds migration 000011; was: the 24-hour window, "a
   pass (re)starts `withdraw-listing-{id}` for every listing CANCELLED within the last 24 hours
   (by `updated_at`), paging all of them (keyset), with the same input Req 7 builds;
   `REJECT_DUPLICATE` makes a start of a running or finished workflow a harmless no-op.")*
   *(Amended 2026-11-05, Nick: a success that hides an unstarted workflow leaves the item LISTED
   and the gold held with nothing to tell the seller; was: "**Starting the workflow never fails
   the withdrawal.** The start runs on a context detached from the request's cancellation with a
   short timeout; a failed start is logged and the call still answers success (the listing is
   withdrawn). A seller's repeated withdrawal re-starts it (Req 4), so retrying the call is the
   recovery. (agent default, mirrors ADR-0024's 'start, never wait')")*

### C. Interaction with other flows

9. **Bids and buyouts after a withdrawal** are refused by the existing rules (the listing is no
   longer ACTIVE). Withdrawal and a concurrent bid, buyout or bid withdrawal serialize on the
   listing row lock; whichever commits second sees the first.
10. **Settlement.** The expiry poller selects only ACTIVE listings, so it never starts one for a
    withdrawn listing. If AcceptBid already started a settlement and the withdrawal commits before
    step 0a, 0a meets a non-ACTIVE listing and takes FS-NXP1W Req 12's pre-pivot rollback, which
    leaves CANCELLED in place (MarkSettlementFailed changes only PENDING_SETTLEMENT); its releases
    and LoseAllBids overlap the withdraw workflow idempotently. Once 0a has frozen the listing,
    withdrawal is refused (Req 2). No settlement code changes. [charter default A5]

### D. Transport

11. **gRPC.** A new `WithdrawListing(WithdrawListingRequest{listing_id}) returns
    (WithdrawListingResponse{})` on `MarketplaceService`. The caller is the authenticated member
    (`MemberIDFromCtx`, as WithdrawBid and AcceptBid); an unverified email does not refuse it.
    *(Amended 2026-11-05, Nick: a withdrawal only exits a commitment, so it stays open to unverified
    members per FS-V6SFK Req 30; was: "The caller must be a verified member, the same gate ListItem
    uses (`verifiedCaller`). (agent default: listing and withdrawing are the seller's own actions
    and share a gate)")* Error mapping in `mapError`: `ErrNotSeller` →
    PermissionDenied; `ErrListingWithdrawLocked` → the registered refusal `LISTING_WITHDRAW_LOCKED`
    (FailedPrecondition + ErrorInfo reason, the ITEM_WORN mechanism); `ErrListingExpired` /
    `ErrListingNotAcceptingBids` → FailedPrecondition (existing); not found → NotFound.
12. **errcode.** `LISTING_WITHDRAW_LOCKED` is added to `common/errcode` and registered so the
    gateway passes it through as the problem code.
13. **HTTP.** `DELETE /api/marketplace/listings/{listing_id}` as a typed operation, `204` on
    success; contract regenerated (`make openapi && make client`). [charter default A6]

### E. Client

14. **The seller's Withdraw action.** On the seller's own listing (the seller block in the
    listing detail, and the My listings row), a **Withdraw** action appears while the listing is
    ACTIVE, not ended and not bought out. It is hidden in the final 30 minutes when the listing has
    bids (the server still decides; Req 3). [charter default A7]
15. **Confirm first.** Withdraw opens a confirm. With no bids it says the item returns to the
    seller. With bids it names the count and says every bidder gets their gold back. Confirming
    sends the DELETE; on success the listing is re-read and shows "Withdrawn" (the existing
    `listingStatusLabel` copy). [charter default A7]
16. **Refusals.** `400 · LISTING_WITHDRAW_LOCKED` → "Too late to withdraw — this auction has bids
    and ends within 30 minutes." `400 · FAILED_PRECONDITION` → the listing is re-read and the
    message says it can no longer be withdrawn. `403` → the server's prose. `503` / no answer →
    the confirm stays open with a message that the withdrawal did not finish and can be tried
    again, and its confirm button retries; the listing is not re-read into a state that hides
    the action. *(Amended 2026-11-05, Nick, with Req 8; was: "`503` / no answer → the existing
    unreachable copy.")* (agent default for exact copy)
17. **A bidder sees the withdrawal.** In My bids, a bid whose listing is CANCELLED shows
    "Withdrawn by seller" instead of "Lost", and says the gold was returned. Other LOST bids are
    unchanged. [charter default A7]
18. **No notifications.** Nothing is pushed or mailed to bidders. [charter default A8]

## User Stories

1. As a seller, I want to take my listing down, so that I can keep or relist my item.
2. As a seller who set the wrong end date, I want to withdraw the listing, so that my item isn't locked until then.
3. As a seller, I want my item back in my inventory after withdrawing, without doing anything else.
4. As a seller, I want to withdraw even after someone bid, so that a single bid can't trap my item.
5. As a seller, I want to see how many bids will be cancelled before I confirm.
6. As a bidder, I want my gold back automatically when the seller withdraws.
7. As a bidder, I want My bids to say the seller withdrew, so I don't think I lost the auction.
8. As a bidder near the end of an auction, I want the seller unable to pull it out from under me in the last 30 minutes.
9. As a seller, I want to be told clearly when it's too late to withdraw.
10. As a member who is not the seller, I want to be unable to withdraw someone else's listing.
11. As a seller, I want a repeated withdraw (a double click, a retried request) to be harmless.
12. As the marketplace, I want the item return and the gold release to finish even if a service restarts mid-way.
13. As the marketplace, I want a withdrawal and a concurrent bid or buyout to resolve as exactly one of them.
14. As the settlement saga, I want a withdrawal that lands before I freeze the listing to roll me back cleanly.
15. As a buyer who bought out a listing, I want the seller unable to withdraw it afterwards.
16. As an operator, I want a withdrawal recorded as CANCELLED, never overwritten by a later settlement step.
17. As a client developer, I want the refusal codes to be switchable, not prose.

## Acceptance Criteria

Domain (table-driven, `domain/listing`):
- [ ] The seller withdraws an ACTIVE listing with no bids at any time before its end: listing CANCELLED.
- [ ] With live bids, 31 min before the end: CANCELLED, every PENDING/WINNING/OUTBID bid LOST, CANCELLED/FAILED bids unchanged.
- [ ] With live bids at exactly `endsAt − 30 min` and later: `ErrListingWithdrawLocked`, nothing changes.
- [ ] Without live bids (only CANCELLED/FAILED bids) inside the final 30 min: allowed.
- [ ] Non-seller: `ErrNotSeller`, checked before any state rule, nothing changes.
- [ ] Bought out: `ErrListingNotAcceptingBids`; past the end: `ErrListingExpired`; PENDING_SETTLEMENT / SOLD / EXPIRED / SETTLEMENT_FAILED: refused, nothing changes.
- [ ] Already CANCELLED, by the seller: success, nothing changes.

Use case / workflow:
- [ ] The write goes through `repo.Update` (row lock); a refusal starts no workflow.
- [ ] A success starts `withdraw-listing-{listingId}` once with the item id and every bid id; an already-started workflow is success; a failed start keeps the CANCELLED write and returns a transient error, and a repeat then succeeds and starts the workflow. *(Amended 2026-11-05; was: "a failed start still answers success and is logged.")*
- [ ] A started (or already-started) withdrawal is marked `withdrawal_started_at` by a fenced update that never touches an ACTIVE or already-marked listing; a failed start leaves it unmarked; a failed mark does not fail the withdrawal. *(Added 2026-11-05 with the started marker, Req 8.)*
- [ ] The reconcile tick's backstop pass starts the workflow for every CANCELLED listing not marked started, of any age, across every page, and marks each start that lands; a marked listing is never started again; one failed start or mark does not stop the others, and a failing pass does not stop the tick's other passes. DB-backed tests cover the query, the fence, a crash-shaped never-started withdrawal and a started one. *(Added 2026-11-05 with Req 8.)* *(Amended 2026-11-05, started marker; was: the 24-hour window, "for every listing CANCELLED in the last 24 hours".)*
- [ ] The workflow runs `ReturnItem` and `ReleaseAllHolds` with uncapped retry; a workflow test (Temporal test env) shows both scheduled with the right inputs and a retried activity eventually succeeding.

Transport:
- [ ] gRPC: PermissionDenied for a non-seller; FailedPrecondition with reason `LISTING_WITHDRAW_LOCKED` for the lock; FailedPrecondition for ended / not accepting; NotFound for an unknown listing; an unverified seller can still withdraw. *(Amended 2026-11-05; was: "unverified caller refused like ListItem.")*
- [ ] HTTP: `DELETE /api/marketplace/listings/{listing_id}` → 204 / 403 / 404 / `400 · LISTING_WITHDRAW_LOCKED` / `400 · FAILED_PRECONDITION`; documented in the operation; `openapi.yaml` and `schema.d.ts` regenerated.

Client:
- [ ] Withdraw shows for the seller only while withdrawable; hidden in the final 30 min with bids.
- [ ] The confirm names the bid count when there are bids.
- [ ] Each refusal maps to its copy; a success re-reads the listing.
- [ ] My bids shows "Withdrawn by seller" for a bid on a CANCELLED listing; other LOST bids still read "Lost".

## Edge States

- **Double click / retried request.** The second call meets CANCELLED and succeeds (Req 4); the workflow start dedups on its id.
- **Workflow start fails (Temporal down).** The listing is CANCELLED and the call answers 503; the client keeps the confirm open, and the seller's retry (a repeat) starts the workflow. Until a start lands the item stays LISTED and holds stay RESERVED; the hold reconciler does not release them (a LOST bid counts as claimed). If the seller never retries, the reconcile tick's backstop starts it within one tick of Temporal being reachable again, however long the outage, because the listing stays unmarked until a start lands (Req 8). *(Amended 2026-11-05, started marker; was: the 24-hour window, "…within one tick while Temporal is reachable, for up to 24 hours after the withdrawal".)* *(Amended 2026-11-05; was: "The listing is CANCELLED but the item stays LISTED and holds stay RESERVED until a repeated withdrawal starts the workflow. The hold reconciler does not release them: a LOST bid counts as claimed. Accepted; the seller's retry is the recovery (Req 8).")*
- **Crash between the CANCELLED commit and the start.** The seller sees no answer and may retry (a repeat); otherwise the backstop starts the workflow on its next tick, since the listing was never marked started, whatever its age (Req 8). *(Added 2026-11-05.)* *(Amended 2026-11-05, started marker; was: the 24-hour window bounded how old a crashed withdrawal the backstop would still reach.)*
- **Started, but the mark failed** (DB blip after the start). The withdrawal answers success; the listing stays a backstop candidate, and the next tick's start is a `REJECT_DUPLICATE` no-op that marks it (Req 8). *(Added 2026-11-05 with the started marker.)*
- **`ReturnItem` fails non-retryably** (item not LISTED under this listing id). The workflow fails; the item stays where it is. Visible only in Temporal, like `releasehold` (ADR-0051).
- **AcceptBid then withdraw before 0a.** Pre-pivot rollback; CANCELLED kept; a settlement exception is raised (ADR-0051 consequence).
- **Withdraw racing a buyout.** Serialized by the row lock: if the buyout lands first, the withdrawal is refused (bought out); if the withdrawal lands first, the buyout is refused and its hold released by the buyout use case.
- **Withdraw racing a bid's write.** Serialized; a bid recorded first becomes LOST and its hold is in the workflow's bid list; a bid arriving after is refused and its hold released by PlaceBid.
- **A bid recorded between the read of the bid list and the workflow start.** Impossible: the bid list is read under the same lock as the write.
- **Exactly at the 30-minute boundary with bids.** Locked (closed at its start).
- **Only FAILED / CANCELLED bids exist.** Not live; no lock; their holds were never held or already released.
- **Listing already ended but not yet frozen.** `ErrListingExpired`; settlement will run normally.

## API surface

### gRPC (marketplace.proto)

| RPC | Request | Response | Errors |
|---|---|---|---|
| `WithdrawListing` (new) | `listing_id` | empty | NotFound · PermissionDenied (not seller) · FailedPrecondition (reason `LISTING_WITHDRAW_LOCKED`; plain for ended / not accepting) · InvalidArgument (bad id) · Unauthenticated (no identity). *(Amended 2026-11-05, not email-gated; was: "…reason `EMAIL_UNVERIFIED` for an unverified caller…")* |

### HTTP (api-gateway)

| Method · Path | Request | Success | Errors |
|---|---|---|---|
| `DELETE /api/marketplace/listings/{listing_id}` | no body; seller from the token | `204` | `401 · UNAUTHENTICATED` · `403 · FORBIDDEN` (not the seller) · `404 · NOT_FOUND` · `400 · LISTING_WITHDRAW_LOCKED` · `400 · FAILED_PRECONDITION` (ended, bought out, not ACTIVE) · `409 · CONFLICT` (the listing's row lock timed out; somebody else is writing it) · `422 · VALIDATION_FAILED` (malformed id) · `503 · SERVICE_UNAVAILABLE` (marketplace unreachable, or the listing was withdrawn but its workflow could not be started; retrying is safe). *(Amended 2026-11-05, not email-gated; was: also "`400 · EMAIL_UNVERIFIED` (unverified caller, as on create-listing)")* *(Amended 2026-11-05, with Req 8: adds `409 · CONFLICT` and the 503 after a failed start; was: no 409, and 503 for an unreachable marketplace only.)* |

### errcode

| Code | Meaning |
|---|---|
| `LISTING_WITHDRAW_LOCKED` (new) | The listing has live bids and is in its final 30 minutes. |

## Out of Scope

- Notifying bidders (no auction notifications exist).
- A listing fee or withdrawal penalty.
- Withdrawing after settlement has frozen the listing.
- Operator tooling for a failed withdraw workflow.
- Listing duration bounds and the 20-listing cap (FS-XEDFF).
- Any change to settlement, wallet code, or items `ReturnItem`. *(Amended 2026-11-05, started marker: migration 000011 adds `listings.withdrawal_started_at` and its partial index; was: "…, or migrations.")*
