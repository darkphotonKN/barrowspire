---
id: I-NXP1W-19
status: open
implements: FS-NXP1W
blocked_by: [I-NXP1W-18]
labels: []
title: "FS-NXP1W slice 19: buyout replays are recognised by Idempotency-Key and by the buyer's own BUYOUT bid (ADR-0026)"
---
Implements FS-NXP1W §HTTP entry points (Req 43, 44), §API surface, §Acceptance Criteria

**Author:** unassigned

## What to Build

Replace the bid ID fixed per buyer and listing (`BuyoutBidID(member, listing)`, ADR-0025, now
superseded) with ADR-0026's scheme, end to end:

- **bid ID**: `UUIDv5(namespace, member:listing:key)` when the request carries an
  `Idempotency-Key`, `uuid.New()` when it does not. Use a new namespace constant, fixed forever. Do
  not reuse `buyoutBidNamespace`: it would collide with nothing, but mixing the two derivations is
  confusing.
- **replay** = the listing already carries this bid ID, **or** already carries a BUYOUT bid by this
  member. A replay holds no gold and goes straight to (re)starting settlement, which already answers
  "already started" as success.

Layers:

- **proto** (`common/api/proto/marketplace/marketplace.proto`): `BuyoutRequest` gains
  `string idempotency_key = 3;`, same comment as `PlaceBidRequest`'s. Regenerate **only**
  `marketplace.proto`, as in I-NXP1W-18.
- **domain** (`domain/listing`): a `HasBuyoutBy(memberID)` read. In `Buyout`, the replay check on
  the first line becomes "this bid ID, or a BUYOUT bid by this member", before any rule (the
  listing may already be frozen by the first attempt's settlement).
- **usecase** (`usecase/buyout.go`):
  - `BuyoutCommand` gains `IdempotencyKey`.
  - The pre-check `!current.HasBid(bidID)` becomes "neither this bid ID nor a BUYOUT bid by this
    member".
  - **Under the lock, know whether *this* call's bid was recorded** (the `recorded` flag PlaceBid
    already uses). A call that held gold under a new ID and then found the member's earlier buyout
    under the lock wrote nothing, and its hold backs nothing: release it at once, as PlaceBid does
    for a deduplicated replay. Do not leave it for the reconciler's 10-minute grace.
  - Retire `BuyoutBidID(member, listing)` and its test.
- **grpc** (`grpc/handler.go`): parse `idempotency_key`. Empty → `uuid.Nil`; malformed →
  `InvalidArgument`, as PlaceBid does.
- **gateway** (`listing/typed.go`): `Idempotency-Key` header on `buyout`, `format:"uuid"`, optional,
  same doc as place-bid's. Rewrite the description's 409 sentence: `409 · ALREADY_EXISTS` now means
  this key's earlier attempt was abandoned and its gold returned, so **send a new key**, not
  "retrying will not help". Then `make openapi && make client`.
- **ADR-0025 references in code comments**: point them at ADR-0026.

Out of this slice: retrying the bid write when its outcome is unknown, as PlaceBid does with
`withBackoff`. It makes the orphan path rarer. Separate issue.

## Acceptance Criteria

- [ ] A buyout with key K answers `202`; the hold and the bid are under `UUIDv5(ns, member:listing:K)`.
- [ ] A resend with K holds no further gold, records nothing new, and answers `202`.
- [ ] **After the hold for K was released with no bid recorded** (the reconciler case), a buyout with a new key K2 holds gold, records the bid and answers `202`. This is the bug ADR-0026 exists for.
- [ ] A resend with the same released K answers `409 · ALREADY_EXISTS`, and the description says to use a new key.
- [ ] A member whose buyout landed, resending with a **different** key or with none, answers `202` with no new bid; any gold the attempt held is released, not left for the reconciler.
- [ ] Two concurrent buyouts by the same member with different keys leave one BUYOUT bid and one hold; the other hold is released.
- [ ] A buyout without a key still works and is still recognised as a replay by the member check.
- [ ] A different member's buyout of a bought-out listing is still refused (`400 · FAILED_PRECONDITION`) with its hold released, as today.
- [ ] Malformed `Idempotency-Key` → `422` at the gateway, never reaching marketplace.
- [ ] The I-NXP1W-18 amount check is unchanged.
- [ ] proto (marketplace only), `openapi.yaml` and the generated client regenerated. oasdiff against `main` reports the optional header as non-breaking.
- [ ] Tests pass.

## Blocked By

I-NXP1W-18 (done; this changes the route it shaped)

## Spec Reference

FS-NXP1W §HTTP entry points Req 43 (buyout entry point), Req 44 ("A buyout repeated with the same
`Idempotency-Key` does not place a second bid"); §API surface `buyout` row (`Idempotency-Key` header,
uuid, optional, same rule as place-bid); ADR-0026.

## TDD Approach

- RED (domain): `Buyout` under a new bid ID by a member who already holds a BUYOUT bid succeeds and records nothing.
- RED (usecase): after a released hold, a new key holds and records; the same key is refused with `ErrDuplicateResource`.
- RED (usecase): a new-ID call that finds the member's earlier buyout under the lock starts a release of its own hold.
- RED (grpc): a malformed key is `InvalidArgument` before the usecase.
- RED (gateway): the header reaches `BuyoutRequest.IdempotencyKey`; a malformed one is `422` with no call.
