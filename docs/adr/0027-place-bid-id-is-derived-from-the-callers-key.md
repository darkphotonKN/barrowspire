# ADR-0027 — A placed bid's ID is derived from the caller's Idempotency-Key, so a resend holds no gold again

Status: accepted
Date: 2026-10-20
Scope: `game-server/marketplace-service` (`PlaceBidUC`, `Listing.PlaceBidWithID`),
`game-server/api-gateway` (`place-bid` operation description)
Builds on: [ADR-0009](0009-idempotency-belongs-to-the-caller.md) (the caller's key, a deterministic
ID derived from it) and [ADR-0026](0026-buyout-replay-is-recognised-by-a-caller-key-and-the-buyers-own-bid.md)
(the same scheme, for buyout)
Deviates from: FS-0YXG6 §API surface, `place-bid` row, which lists `409 · CONFLICT` only. A spent
key now also answers `409 · ALREADY_EXISTS`; see Consequences.

## Context

Recorded without adversarial review. Decided by the user on 2026-10-20 (I-0YXG6-6), right after
ADR-0026 gave buyout a key-derived bid ID.

Place-bid already took an optional `Idempotency-Key` (FS-0YXG6 Req 15), but `PlaceBidUC` minted a
random bid ID per request and held gold under it **before** the key was ever consulted. The key was
only checked under the row lock, by `findBidByIdempotencyKey`. So every resend of a bid that had
already landed:

- held the bidder's gold a second time, under a new ID;
- found the original by key under the lock, wrote nothing, and released that second hold;
- in between, froze gold the bidder still owned. A bidder with just enough gold for one bid could
  have the resend refused for insufficient gold while the original bid stood.

The result was correct but cost a hold and a release workflow per resend. Wallet already
deduplicates holds by bid ID, so a stable ID per bid would let it recognise the resend itself.

Two further findings came with it:

- `findBidByIdempotencyKey` matched the key alone, not the member, so another member's bid carrying
  the same key would be taken for this bid's replay, and this bid answered `201` without being
  recorded.
- `bids.idempotency_key` carries a **global** unique index (`migrations/000003`), not one per member
  or listing.

## Decision

**A keyed bid's ID is `UUIDv5(namespace, member:listing:key)`; an unkeyed bid's is random. Before
any gold is held, a listing that already carries that ID is a replay and succeeds.** The namespace
is new and fixed forever, distinct from buyout's.

- Under the lock, `HasBid(bidID)` now catches a same-key resend directly, and nothing is released.
- `findBidByIdempotencyKey` stays, for the deploy transition: a bid recorded before this change has
  a random ID, so its resend derives a different one, holds under it, and is only recognised by the
  key. That hold is released, as it was before.
- That lookup is scoped to the member (`findBidByIdempotencyKey(memberID, key)`).
- The global unique index on `bids.idempotency_key` **stays as it is**. The user decided against a
  migration.

## Consequences

- **A resend of a bid that landed holds no gold and starts no release.** A resend racing its own
  first attempt holds under the same ID, which wallet answers as the hold it already has.
- **A spent key answers `409 · ALREADY_EXISTS`.** A key whose hold was released (its bid was refused,
  for example too low, or the reconciler swept an orphan) derives the same, released ID, and wallet
  will not hold under it again. It used to be re-judged and answer the original refusal (for
  example `400` too low). The remedy is a new key, which a new bid needs anyway. The operation
  description says so. FS-0YXG6 is shipped and write-once, so this ADR is the record of the extra
  code.
- **Another member's bid with the same key is no longer swallowed.** The domain would record it, but
  the global unique index refuses it, so end to end it answers `409 · ALREADY_EXISTS` with its hold
  released. Keys are random UUIDs, so this is a collision case only. Scoping the index to
  `(listing_id, member_id, idempotency_key)` would let it record. That is a migration, declined for
  now.
- **Unkeyed bids are unchanged**: random ID, no deduplication, as FS-0YXG6 Req 15 says.
- **Place-bid and buyout now share one scheme**, except that buyout also recognises the buyer's own
  buyout under any ID. A listing takes one buyout per buyer, so that check is meaningful there. A
  bidder places many bids, so it has no equivalent here.
