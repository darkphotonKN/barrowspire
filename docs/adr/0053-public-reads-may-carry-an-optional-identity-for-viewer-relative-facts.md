# ADR-0053 — Public reads may carry an optional identity, so a service can answer viewer-relative facts without exposing member ids

Status: accepted
Date: 2026-11-05
Scope: `game-server/common/auth` (interceptor), `game-server/marketplace-service` (BrowseListings,
GetListing), `game-server/api-gateway` (browse-listings, get-listing), `game-client` (public reads)
Realized by: [FS-GKHYD](../specs/GKHYD-public-listing-privacy.md)
Builds on: [FS-8EGFA](../specs/8EGFA-marketplace-web-page.md) (the public Bazaar reads),
[ADR-0001](0001-contract-layer.md) (the generated contract the public shape is checked against)

## Context

Recorded without adversarial review. Decided by the user on 2026-11-05, after a read-only audit of
the marketplace read paths.

The Bazaar's two reads, `BrowseListings` and `GetListing`, are public: signed-out visitors browse
them (FS-8EGFA §Requirements 6, 10), so `common/auth/interceptor.go` lists them in
`publicMethods`, which skips the token check entirely. Their responses carried `sellerId` on every
listing and, once a listing sold, `buyerId` and `soldPrice`. The public leaderboard
(`GET /api/stats/leaderboard`) maps `member_id` to `username`. Joined, anyone without signing in
could read "player X bought item Y from player Z for N gold", and profile a named player's open
listings.

The client never rendered `buyerId` from a public read, and read `soldPrice` only from the seller's
own `list-my-listings`. It used `sellerId` for one thing: deciding whether the viewer is the seller,
which drives the seller's Accept and Withdraw controls.

So the public shape drops all three, and "is this mine" has to come from somewhere. It is a fact
about the viewer, not the listing. Someone has to know who is asking, and today nobody on a public
read does: the interceptor skips identity for `publicMethods`, and the gateway does not forward the
bearer on these operations.

`publicMethods` is a list of two different things. Most entries are service-to-service stopgaps
waiting for a service credential (`ReleaseHold`, `ApplySettlement`, the reservation reconciler).
The marketplace and catalogue reads are genuinely public. Neither kind reads a caller. This
decision adds a third kind: genuinely public, but able to read a caller when one is present.

## Decision

**`common/auth` gains a second list, optional-auth methods. For a method on it, the interceptor
embeds the caller's identity when the request carries a valid bearer token, and serves the request
anonymously otherwise.** An absent token, a malformed header, and an invalid or expired token all
mean anonymous. An optional-auth method never answers `Unauthenticated`.

- `BrowseListings` and `GetListing` move from `publicMethods` to the optional-auth list. Nothing
  else moves.
- The service computes the viewer-relative fact itself. Marketplace answers `own` on each
  listing: true when the caller's member id is the listing's seller, false otherwise and for every
  anonymous caller.
- The gateway forwards the bearer on these operations when the request has one. It never compares
  ids and never computes `own`: the rule lives in one place, the owning service, as the edge never
  restates a downstream rule (`docs/specs/README.md` §422 vs 400) and handlers hold no domain
  logic (root `CLAUDE.md`, Architecture Rules).
- The public HTTP shape no longer carries `sellerId`, `buyerId` or `soldPrice`. The gRPC `Listing`
  keeps `seller_id`, `buyer_id` and `sold_price` for the seller's own `ListMyListings` and other
  internal readers; only the public HTTP type omits them.

## Consequences

- **No member id reaches a signed-out visitor through the Bazaar.** `own` is a boolean about the
  viewer, so it reveals nothing about anyone else.
- **A stale token never breaks a public page.** This is the property FS-8EGFA §Requirements 21
  protected by never sending a token. Treating an invalid token as anonymous keeps it while
  allowing the client to send one.
- **Cost: the same request can answer differently per viewer.** A public read is no longer
  identical for everyone. Any future HTTP cache in front of these routes must vary on
  Authorization, or cache only anonymous responses.
- **Cost: one more list in the interceptor.** `publicMethods` stays for the stopgaps and the
  catalogue reads. An optional-auth method is easy to confuse with a public one, so the
  interceptor tests must pin both lists and the "invalid token → anonymous" behaviour.
- **The gRPC listing still carries member ids.** The marketplace gRPC listener is cluster-internal.
  Stripping the fields on the public RPCs too is defence in depth, left as a follow-up.
- **Rejected:**
  - *The gateway computes `own` by comparing the token's member id with `sellerId`.* It would put
    a domain rule at the edge and keep `sellerId` flowing to the gateway for a public read.
  - *Keep `sellerId` public.* Combined with the public leaderboard it profiles a named player.
  - *A `viewer_member_id` field on the request.* It is spoofable by any caller inside the cluster,
    and it is a second identity channel beside the one the interceptor already verifies.
  - *Make the reads require sign-in.* This breaks the signed-out Bazaar (FS-8EGFA).
