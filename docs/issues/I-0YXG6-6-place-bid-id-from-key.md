---
id: I-0YXG6-6
status: done
implements: FS-0YXG6
blocked_by: []
labels: []
title: "FS-0YXG6 slice 6: a resent bid holds no gold again; its bid ID comes from the Idempotency-Key"
---
Implements FS-0YXG6 §Place and withdraw a bid (Req 15), §API surface, §User Stories 10

**Author:** unassigned

## What to Build

Today `PlaceBidUC` mints `bidID := uuid.New()` per request and holds gold under it before writing.
A resend with the same `Idempotency-Key` therefore holds gold a second time under a new ID, and is
only recognised under the lock (`findBidByIdempotencyKey`), after which that second hold is
released. The result is right, but every resend costs a hold and a release, briefly freezes extra
gold, and can be refused for insufficient gold even though the original bid stands.

Give place-bid the scheme I-NXP1W-19 gave buyout (ADR-0026):

- **bid ID**: `UUIDv5(new namespace, member:listing:key)` with a key, `uuid.New()` without one.
  The namespace is new and fixed forever.
- **pre-check**: before `PlaceHold`, a listing that already carries this bid ID is a replay. Answer
  success and hold nothing.
- Under the lock, the existing `HasBid(bidID)` check (`place_bid_usecase.go:82`) now catches a
  same-key resend directly, `recorded` is true, and nothing is released.
- Keep `findBidByIdempotencyKey` in `PlaceBidWithID` for the deploy transition: a bid recorded
  before this change has a random ID, so a resend across the deploy derives a different ID and
  only the key lookup recognises it. **Scope that lookup to the member as well**
  (`findBidByIdempotencyKey(memberID, key)`): today another member's bid carrying the same key
  would swallow this one.

### Contract consequence, needs an ADR

A resend with a key whose hold was already released (its bid was refused, or the reconciler swept an
orphan) now meets wallet's refusal to hold again under that ID: `409 · ALREADY_EXISTS`, where it
used to be re-judged (for example `400` too low). The remedy is a new key, which a new bid needs
anyway. FS-0YXG6's §API surface row lists only `409 · CONFLICT`, and the FS is shipped and
write-once, so record this as **ADR-0027** ("place-bid bid ID is derived from the caller's key",
building on ADR-0009 and ADR-0026) and describe the new 409 in the operation's description.

## Acceptance Criteria

- [ ] A bid with key K holds and records under `UUIDv5(ns, member:listing:K)`.
- [ ] A resend with K whose bid landed holds no gold, writes nothing, starts no release, and answers `201`.
- [ ] A resend with K while the first attempt's hold is still RESERVED and its bid not yet written (the first write failed before reading): wallet answers the same hold as success, the bid is written, and nothing is released.
- [ ] A resend with K whose hold was released answers `409 · ALREADY_EXISTS`; the description says to use a new key.
- [ ] A bid without a key behaves as today (random ID, no deduplication).
- [ ] Another member's bid carrying the same key no longer swallows this one. The domain now records it; the database's unique index on `idempotency_key` stays **global** (decided 2026-10-20, no migration), so end to end it is refused as `409 · ALREADY_EXISTS` with its hold released, where it used to be silently answered `201` as someone else's replay.
- [ ] A resend of a bid recorded before this change (random ID, same key) is still recognised under the lock and its new hold released (the transition case).
- [ ] The PlaceBid TCC paths (definitive refusal releases, unknown outcome retries then is left to the reconciler) are unchanged.
- [ ] ADR-0027 recorded; place-bid description updated; `openapi.yaml` and the generated client regenerated; no breaking change against `main`.
- [ ] Tests pass.

## Blocked By

None

## Spec Reference

FS-0YXG6 §Requirements 15 (optional, caller-minted key, reused on every retry, ADR-0009), §User
Stories 10 ("retry a bid with the same idempotency key, so that a retry is recognised instead of
placed twice"), §Edge States ("Retrying with the same idempotency key is safe"), §API surface
`place-bid` row. Pattern: ADR-0026 / I-NXP1W-19.

## TDD Approach

- RED: a resend with the same key after the bid landed makes no second `PlaceHold` call.
- RED: the bid ID is the key-derived one, and differs per member, listing and key.
- RED: the same key used by another member records that member's bid.
- RED: a bid recorded under a random ID with key K is still recognised by a resend with K, and the resend's hold is released.
