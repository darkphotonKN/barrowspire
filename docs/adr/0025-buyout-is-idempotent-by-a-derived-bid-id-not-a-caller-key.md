# ADR-0025 — A buyout is idempotent by a bid ID derived from buyer and listing, not by a caller-minted key

Status: accepted
Date: 2026-10-20
Scope: `game-server/api-gateway` (`buyout` operation), `game-server/marketplace-service` (`BuyoutUC`)
Builds on: [ADR-0009](0009-idempotency-belongs-to-the-caller.md) — applies its "the party that knows
which event this is mints a deterministic ID" rule at the HTTP edge, where that party turns out to
be the server
Deviates from: FS-NXP1W §API surface, `buyout` row — the `Idempotency-Key` header it lists is not
accepted. The row's `amount` body is carried (I-NXP1W-18).

## Context

Recorded without adversarial review. Decided by the user on 2026-10-20 while opening the buyout
route (I-NXP1W-17) and adding its amount (I-NXP1W-18).

FS-NXP1W's §API surface gives `buyout` an optional `Idempotency-Key` header "same rule as
place-bid". By the time the route was opened, `BuyoutUC` was already built without one: a replay is
recognised by `BuyoutBidID = UUIDv5(fixed namespace, member:listing)`, which is

- the key wallet's `PlaceHold` dedups on, so a retry finds its first attempt's hold;
- the bid ID, which `Listing.Buyout` checks with `HasBid` before any rule, so a retry finds its
  first attempt's bid even after settlement has frozen the listing;

and settlement's own start is idempotent by workflow ID `settlement-{listingId}` (ADR-0016).

Place-bid needs a caller key because one member places many bids on one listing: `(member,
listing)` cannot tell a retry from a raise, and only the client knows it is retrying. A buyout has
no such ambiguity. A member buys a given listing out at most once, and the member (from the token)
and the listing (from the path) are both in every request, so the server can derive the ID itself.
Under ADR-0009's rule, the party that knows which event this is is the server.

Accepting a key anyway leaves two shapes, both worse:

- **Accept and ignore it.** The contract would tell clients that reusing the key on retry is what
  makes retries safe, which is false, since retries are safe without it.
- **Use it as the bid ID.** The client takes on a duty it does not have today: mint once, persist,
  reuse on every retry. A client that mints per click turns a double click into a second attempt.
  That attempt is still refused (`boughtOut()` closes the listing to bid changes), but only after it
  holds gold and starts a release. `BuyoutUC`'s crash-replay safety, now carried by the derived ID,
  would have to be rebuilt on the key.

## Decision

**`POST /api/marketplace/listings/{listing_id}/buyout` accepts no `Idempotency-Key`. A buyout is
idempotent by `BuyoutBidID(member, listing)`, derived by marketplace, and the client sends nothing
for it.** A repeated buyout answers `202` as if it were the first.

`BuyoutBidID`'s namespace is fixed forever: changing it would give a retry a different ID from its
first attempt, and a second hold.

## Consequences

- **Retries need nothing from the client.** It can resend the same request any number of times,
  from any state, with no key to remember. A double click is one buyout and one hold.
- **The §API surface row and the built operation disagree on one header**, deliberately. This ADR
  is what `/spec-audit` and `/code-review` should cite for that difference instead of reopening it.
- **Cost: a spent ID cannot be retried.** If a member's hold for a listing is released after a lost
  write (the reconciler sweeps it), wallet refuses a new hold under the same ID, and that member can
  never buy that listing out again. The gateway answers `409 · ALREADY_EXISTS`, and its operation
  description says retrying will not help. A caller-minted key would have let them try again with a
  new key. The case is rare (it needs a lost write and then a sweep before the retry), and it is
  marketplace's to fix, for example by letting a released hold under the same ID be placed again.
  It is not a reason to move idempotency onto the client.
- **If buyout ever has to allow more than one attempt per member and listing**, the derivation's
  premise is gone and this ADR is superseded, most likely by a key, the same as place-bid.
