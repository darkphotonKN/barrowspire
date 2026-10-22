# ADR-0026 — A buyout replay is recognised by a caller key and by the buyer's own bid, not by a bid ID fixed per buyer and listing

Status: accepted
Date: 2026-10-20
Supersedes: [ADR-0025](0025-buyout-is-idempotent-by-a-derived-bid-id-not-a-caller-key.md)
Scope: `game-server/api-gateway` (`buyout` operation), `game-server/marketplace-service` (`BuyoutUC`,
`Listing.Buyout`), `common/api/proto/marketplace` (`BuyoutRequest`)
Builds on: [ADR-0009](0009-idempotency-belongs-to-the-caller.md) — the caller mints the key, and the ID
each service dedups on is derived from it deterministically

## Context

Recorded without adversarial review. Decided by the user on 2026-10-20, the same day ADR-0025 was
accepted, after walking through what ADR-0025's accepted cost actually does to a buyer.

ADR-0025 made every buyout by member M of listing L use one bid ID, `BuyoutBidID(M, L)`, for its
whole lifetime. That ID is also the key of M's gold hold, and wallet holds are `UNIQUE (bid_id)`
across every status. Under TCC (hold = Try, bid write = Confirm, `ReleaseHold` = Cancel), wallet
correctly refuses to reserve again under an ID whose hold was already released. Otherwise a late
Try would be answered with a hold that backs nothing, and marketplace would record a WINNING bid with
no gold behind it (anti-suspension).

Put together, that turns one rare failure into a permanent one:

1. M buys L out. The hold lands; the bid write fails ambiguously (the connection drops on COMMIT).
   Marketplace cannot tell whether the bid landed, so it correctly keeps the hold.
2. The bid did not land. M does not retry within ten minutes.
3. The reconciler, after its 10-minute grace and a successful lookup, correctly finds no bid behind
   the hold and releases it. M has their gold back.
4. M buys L out again. The ID is `BuyoutBidID(M, L)` again; its hold row is `RELEASED`; wallet answers
   `AlreadyExists`, and the gateway returns `409 · ALREADY_EXISTS`. Every later attempt computes the
   same ID, so M can never buy L out.

Every component behaves correctly. The fault is the ID: an attempt that was cancelled leaves no way to
make a new one.

Three ways out were weighed:

- **Wallet re-reserves a `RELEASED` hold** (uniqueness only among `RESERVED`, or flip the row back).
  This loosens anti-suspension, changes wallet's schema and how `ReleaseHold` and `CommitHold` find a
  hold, and has one case it cannot make safe on its own: a late `PlaceHold` for a bid that
  settlement already released as OUTBID or LOST would reserve gold that the reconciler treats as
  settlement's (`HasBidHoldingGold`), and nothing would ever release it. Rejected.
- **A random ID per request, replays recognised only by "M already holds a BUYOUT bid on L"**. This
  fixes it with marketplace alone, but every resend reserves gold again before it is recognised and
  released. Rejected as the primary mechanism; kept as the fallback below.
- **A caller key, plus the member check.** This is chosen. It is also what FS-NXP1W §API surface
  specified for `buyout` from the start, and what place-bid does.

## Decision

**A buyout's bid ID comes from the caller's optional `Idempotency-Key`:
`UUIDv5(namespace, member:listing:key)`, or a random ID when no key is sent. A buyout is a replay,
and succeeds by starting (or re-starting) settlement, when the listing already carries that bid ID
or already carries a BUYOUT bid by the same member.** Marketplace checks both before it holds any
gold and again under the row lock.

- The client mints one key per buyout intent and reuses it on every resend of that intent. A new
  intent, including one after a refused or abandoned attempt, takes a new key.
- The namespace is fixed forever, for the same reason ADR-0025 gave: changing it would give a resend
  a different ID from its first attempt, and a second hold.
- The gateway accepts `Idempotency-Key` on `buyout` with the same rule as place-bid (optional, uuid).

## Consequences

- **A cancelled attempt no longer locks a buyer out.** After the reconciler releases an orphan hold,
  the buyer's next intent has a new key, so a new ID, and a new hold.
- **Wallet and TCC stay as they are.** No schema change, no re-reserving a released hold, and the
  OUTBID/LOST stranding case never arises.
- **A resend with the same key holds gold once.** The derived ID makes wallet's existing dedup
  recognise it, so a lost response costs nothing extra.
- **A buyer who lost their key still gets the right answer.** If their buyout landed, the member
  check recognises it, and they are told it succeeded, not `400 · FAILED_PRECONDITION` for a listing
  they own.
- **Cost: the client now has a duty ADR-0025 had removed.** A client that mints a key per click turns
  a double click into two attempts. The second is refused under the lock by the member check (or by
  `boughtOut()`), but only after holding gold that then has to be released.
- **Requests without a key are still safe**, because the member check catches their replays, but
  every resend holds gold again first. Clients should send a key.
- **`409 · ALREADY_EXISTS` on buyout now means a reused key** whose earlier hold was released. The
  remedy is a new key, not "retrying will not help". The gateway description must say so.
- **FS-NXP1W §API surface and the built operation agree again** on `buyout` (amount body per
  I-NXP1W-18, `Idempotency-Key` header per this ADR). ADR-0025's deviation is gone.
- `BuyoutBidID(member, listing)` and its fixed-per-buyer semantics are retired, along with
  ADR-0025's consequence that "retries need nothing from the client".
