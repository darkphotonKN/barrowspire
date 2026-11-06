---
id: I-V7A5S-1
status: done
implements: FS-V7A5S
blocked_by: []
labels: [ready-for-agent]
title: "FS-V7A5S slice 1: the seller withdraws a listing over gRPC; a workflow returns the item and every hold (marketplace-service)"
---
Implements FS-V7A5S §Requirements 1–12, §API surface (gRPC, errcode), §Edge States

## What to Build

A seller can withdraw their listing through marketplace gRPC, end to end on the server.

- **Domain.** A `Listing` verb (e.g. `Withdraw(memberID, now)`) applying Reqs 1–4 in order: seller first (`ErrNotSeller`), then the open-auction rule (`AcceptsBidAt`'s errors), then the final-30-minute lock when live bids exist (new `ErrListingWithdrawLocked`, `ListingWithdrawLock = 30 * time.Minute`, closed at its start), with an already-CANCELLED listing by its seller as a no-op success. On success: listing ACTIVE → CANCELLED, every PENDING/WINNING/OUTBID bid → LOST.
- **Use case.** Rewrite the unwired `usecase/withdraw_listing_usecase.go` to run the verb inside `repo.Update` (row lock), capture the item id and every bid id under the same lock, then start the workflow (Req 7–8): `withdraw-listing-{listingId}`, `REJECT_DUPLICATE`, already-started = success, started on a detached short-timeout context, a failed start logged and not returned. *(Amended 2026-11-05, FS-V7A5S amendment: a failed start now answers a transient error (→ 503) with the CANCELLED write kept, and a reconcile-tick backstop re-starts `withdraw-listing-{id}` for every listing CANCELLED in the last 24 h; was: a failed start logged and not returned. Owner decision after code review: the seller had no way to retry.)* *(Amended again 2026-11-05: the 24-hour window is replaced by a per-listing marker — migration 000011 adds `listings.withdrawal_started_at`; it is set after a landed or already-started start, and the backstop restarts every CANCELLED listing whose marker is still NULL, with no time window. Owner decision: no outage is too long, the candidate set is normally empty, and it no longer depends on Temporal's history retention.)*
- **Workflow.** A new marketplace-hosted workflow (pattern: `internal/releasehold`), registered on marketplace's worker beside `releasehold.Register`, running items `ReturnItem{ItemID, ListingID}` on the items queue and wallet `ReleaseAllHolds{ListingID, BidIDs}` on the wallet queue, both with uncapped retry like `releasehold.ReleaseOptions`. No change to either activity. *(Amended 2026-11-05: the uncapped policy now lives in `internal/activitypolicy` (`Uncapped`), shared by both workflows; was: reuse `releasehold.ReleaseOptions`.)*
- **Transport.** `rpc WithdrawListing(WithdrawListingRequest{listing_id}) returns (WithdrawListingResponse)` in `marketplace.proto`, regenerated with the repo's proto target (keep only marketplace outputs in the diff). Handler: `verifiedCaller`, parse id, call the use case, map errors (Req 11). *(Amended 2026-11-05: `commonauth.MemberIDFromCtx` — withdrawing is not email-gated, per FS-V6SFK Req 30 (owner decision); was: `verifiedCaller`.)* Register `LISTING_WITHDRAW_LOCKED` in `common/errcode`.

**Hard bounds:** no settlement, wallet or items code change; no migration.

## Acceptance Criteria

- [ ] Domain table: seller/no bids any time before end → CANCELLED; with live bids at end−31m → CANCELLED + live bids LOST, CANCELLED/FAILED bids untouched; with live bids at end−30m and later → `ErrListingWithdrawLocked`; only CANCELLED/FAILED bids inside the window → allowed; non-seller → `ErrNotSeller` before any other rule; bought out / ended / each non-ACTIVE status → refused; CANCELLED by seller → success, unchanged.
- [ ] Use case: the write uses `repo.Update`; a refusal starts nothing; success starts the workflow once with item id + all bid ids; already-started → success; start failure → success + error log. *(Amended 2026-11-05: start failure → transient error (503), CANCELLED kept, repeat re-starts; plus the backstop pass; was: start failure → success + error log.)* *(Amended again 2026-11-05: the 24-hour window is replaced by a per-listing marker — migration 000011 adds `listings.withdrawal_started_at`; it is set after a landed or already-started start, and the backstop restarts every CANCELLED listing whose marker is still NULL, with no time window. Owner decision: no outage is too long, the candidate set is normally empty, and it no longer depends on Temporal's history retention.)*
- [ ] Workflow (Temporal test env): both activities scheduled with the right inputs on the right queues; a transiently failing activity retries and the workflow completes.
- [ ] gRPC: PermissionDenied (not seller); FailedPrecondition with reason `LISTING_WITHDRAW_LOCKED`; FailedPrecondition (ended / not accepting); NotFound; unverified caller refused like ListItem; *(Amended 2026-11-05: an unverified caller CAN withdraw (FS-V6SFK Req 30); was: refused like ListItem.)* `LISTING_WITHDRAW_LOCKED` passes `errcode.RefusalReason`.
- [ ] `go test ./...` green in common and marketplace-service; api-gateway still builds against the regenerated proto.

## Files expected to touch

- `game-server/common/api/proto/marketplace/marketplace.proto` + regenerated `marketplace.pb.go`, `marketplace_grpc.pb.go` — **hotspot / generated**
- `game-server/common/errcode/errcode.go` (+ refusal test) — **shared with I-XEDFF-1 and I-XEDFF-2**
- `game-server/marketplace-service/internal/listing/domain/listing/listing.go`, `errors.go` (+ tests) — **shared with I-XEDFF-1**
- `game-server/marketplace-service/internal/listing/usecase/withdraw_listing_usecase.go` (+ test)
- `game-server/marketplace-service/internal/withdrawlisting/` (new workflow + starter, + tests)
- `game-server/marketplace-service/internal/listing/grpc/handler.go` (+ test) — **shared with I-XEDFF-1**
- `game-server/marketplace-service/internal/config/services.go`, `cmd/server/main.go` (wiring, worker registration)

## Blocked By

None

## Spec Reference

FS-V7A5S §Requirements 1–12; §User Stories 1–4, 10–16; §Acceptance Criteria (Domain, Use case / workflow, gRPC); §Edge States; ADR-0051.
