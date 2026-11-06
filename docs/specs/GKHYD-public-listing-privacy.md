# FS-GKHYD: Public listing privacy

> Status: work-order · SPECIFICATION.md: `game-server/marketplace-service/SPECIFICATION.md` "### Surface", `game-server/api-gateway/SPECIFICATION.md` "### Marketplace", `game-client/SPECIFICATION.md` "### Marketplace" → "Public listing reads expose no member ids" / "Own-listing check without the seller's id" → this FS · Related ADRs: [ADR-0053](../adr/0053-public-reads-may-carry-an-optional-identity-for-viewer-relative-facts.md) (optional identity on public reads; decided here), [ADR-0001](../adr/0001-contract-layer.md) (generated contract) · Related FS: [FS-8EGFA](8EGFA-marketplace-web-page.md) (the public Bazaar reads, shipped; Req 12 below changes the mechanism of its §Requirements 21), [FS-49Z37](49Z37-marketplace-sale-actions.md) (the seller's Accept and buyout controls that depend on "is this mine") · Scoped 2026-11-05 under Nick's charter "public listing privacy" (P1–P9). **[charter default]** marks a default Claude proposed and Nick approved in the charter. Recorded without adversarial review.

> **Amended 2026-11-05** after code review, in the owner-approved fix round 1 (review item S6):
> browse-listings and get-listing now say in their response headers that they vary by viewer
> (new Req 11a). One acceptance criterion is added, and the Edge State on a future HTTP cache and
> the API surface rows for the two reads are corrected in place, each saying
> *(Amended 2026-11-05, …)*.

## Summary

The Bazaar's public reads, browse and listing detail, stop exposing member ids. `sellerId`,
`buyerId` and `soldPrice` leave the public response. A new `own` boolean tells a signed-in viewer
whether the listing is theirs. Marketplace computes `own` from an optional identity that the public
reads now accept. The seller's own "Mine" list is unchanged.

## Requirements

### Public shape

1. **browse-listings and get-listing no longer return `sellerId`, `buyerId` or `soldPrice`.** Every
   other field they return today is unchanged. **[charter default]** P1. Joined with the public
   leaderboard's member id → username, these fields profile named players. The client reads none of
   them from a public read except `sellerId`, for "is this mine".
2. **Both gain `own: boolean`, always present.** It is `true` only when the caller is signed in and
   is the listing's seller. It is `false` for every other signed-in caller and for every anonymous
   caller. **[charter default]** P1.
3. **list-my-listings is unchanged**, including `soldPrice` and `buyerId`. **[charter default]** P2:
   it is the seller's own read, the client reads `soldPrice` there, and the seller is a party to the
   sale.
4. **The gateway uses two HTTP types**: the public listing (Req 1–2) for browse-listings and
   get-listing, and today's listing for list-my-listings. Browse's page wraps the public type.
   **[charter default]** P5. The three reads share `Listing` and `ListingPage` today, so dropping the
   fields from the shared type would also strip "Mine".

### Who decides `own`

5. **Marketplace computes `own`.** The gRPC `Listing` gains `bool own`. BrowseListings and
   GetListing set it from the caller's identity in the context: `own = identity present AND member
   id == seller id`. **[charter default]** P3: the rule lives with the service that owns listings,
   and the edge never restates it (ADR-0053).
6. **The gRPC `Listing` keeps `seller_id`, `buyer_id` and `sold_price`.** ListMyListings and other
   internal readers still need them. Only the public HTTP type omits them. **[charter default]** P3.
7. **ListMyListings' gRPC answers carry `own = true`**, because every listing there is the caller's,
   so the field never reads false on the seller's own list. The HTTP shape of list-my-listings does
   not expose `own` (Req 3).

### Optional identity

8. **`common/auth` gains an optional-auth method list.** It starts as exactly BrowseListings and
   GetListing, which move off `publicMethods`. For an optional-auth method the interceptor does one
   of two things:
   - **Valid token:** with `authorization: Bearer <token>` that validates, it embeds the identity,
     as for a protected method.
   - **Anything else:** with no authorization, a malformed header, or a token that fails validation
     (invalid or expired), it calls the handler with no identity. It never answers
     `Unauthenticated`.

   **[charter default]** P4, ADR-0053.
9. **`publicMethods` keeps every other entry unchanged.** Its doc comment no longer claims the
   marketplace reads "reveal nothing that belongs to a member", because they now read an optional
   caller.
10. **Interceptor tests pin both lists and keep them disjoint:**
    - a public method never embeds identity, even with a valid token;
    - an optional-auth method embeds identity with a valid token, and serves anonymously with an
      absent, malformed or invalid one;
    - every other method still answers `Unauthenticated` without a token.

### Gateway and client

11. **The gateway forwards the request's Authorization on browse-listings and get-listing when one
    is present, and sends none otherwise.** These operations stay public (no protect middleware, no
    security requirement). They never answer 401 and never compare ids. **[charter default]** P5.

11a. *(Amended 2026-11-05, review S6: `own` makes these answers viewer-relative, so the
    response says so instead of leaving it to a future cache's configuration.)* **browse-listings
    and get-listing answer `Vary: Authorization` on every success, and `Cache-Control: private`
    when the request carried an Authorization.** `Authorization` is added to any `Vary` already
    set (the CORS middleware's `Origin`), never replacing it. An anonymous answer carries no
    `Cache-Control`.
12. **The client sends the bearer on its public reads when signed in.** FS-8EGFA §Requirements 21
    read the Bazaar through `publicClient` with no token, so that a token expiring mid-session never
    broke the page. Req 8 treats an invalid token as anonymous, which keeps that property while the
    reads carry a token. They must still not trigger the authenticated client's refresh or sign-out
    handling on an error. **[charter default]** P6.
13. **The client decides "is this mine" from `own`, never from a member id**, everywhere it does
    today:
    - the browse row action;
    - the detail action area;
    - the detail dialog's seller block;
    - the accept and buyout helpers.

    **[charter default]** P6.

### Contract

14. **Removing the three response properties is a breaking change to the generated contract.** It
    is allowlisted in `game-server/.oasdiff-ignore`, one line per removed property and operation,
    with a WHY comment citing this FS. The owner reviews the entry before merge.
    **[charter default]** P7.

## User Stories

1. As a signed-out visitor, I want to browse the Bazaar without learning who sells or bought what, so that players' trading isn't public.
2. As a signed-out visitor, I want the Bazaar to work exactly as before apart from the missing ids, so that nothing I use disappears.
3. As a player, I want no other player to be able to look up what I bought and for how much, so that my purchases stay mine.
4. As a seller, I want no stranger to list everything I'm selling under my name, so that my inventory isn't profiled.
5. As a seller browsing the Bazaar signed in, I want my own listings recognised, so that I'm not offered a bid on them.
6. As a seller opening my own listing's detail, I want my Accept and Withdraw controls, so that I can end or pull my sale.
7. As a seller, I want "Mine" to keep showing what my sold listings fetched, so that I can see my sales.
8. As a signed-in buyer, I want a listing I don't own to read as not mine, so that I get the bid controls.
9. As a player whose token expired mid-session, I want the Bazaar to keep loading, so that a stale token never blanks the page.
10. As a player whose token expired, I want my own listings to read as not mine until I sign in again, rather than an error, so that the page degrades gracefully.
11. As the gateway, I want to forward the token and nothing more, so that I never restate who owns a listing.
12. As marketplace, I want to decide `own` from the verified identity, so that the rule lives in one place.
13. As an operator, I want public methods and optional-auth methods kept apart, so that a stopgap can't silently become identity-reading, or the reverse.
14. As a developer, I want interceptor tests that pin both lists, so that a public read can't start answering 401.
15. As a reviewer, I want the breaking contract change allowlisted with its reason, so that the gate stays meaningful.
16. As a developer, I want the gRPC listing to keep its ids, so that "Mine" and internal readers are unaffected.
17. As a future maintainer, I want viewer-relative public answers documented, so that a cache in front of these routes varies on Authorization.

## Acceptance Criteria

- [ ] browse-listings and get-listing responses have no `sellerId`, `buyerId` or `soldPrice` for any listing status, and always carry `own` (contract and gateway seam tests).
- [ ] `own` is true for the seller with a valid token, and false for another member, with no token, and with an invalid or expired token (marketplace handler tests through the interceptor).
- [ ] list-my-listings' response shape is unchanged: the same fields as before, and no `own` (seam test).
- [ ] The interceptor embeds identity for an optional-auth method only with a valid bearer, never answers Unauthenticated for one, and keeps every other method's behaviour (auth tests over both lists, plus disjointness).
- [ ] The gateway forwards Authorization on the two public operations only when present, and still serves them without a token.
- [ ] *(Amended 2026-11-05, Req 11a)* Both public operations answer `Vary: Authorization` alongside any CORS `Vary`, and `Cache-Control: private` only when a bearer was sent (gateway seam test).
- [ ] Signed in, the client reads the public routes with the bearer; with an expired token the page still loads (logic tests).
- [ ] Every client "is this mine" check uses `own`, and no client code reads `sellerId` from a public read. tsc on the regenerated types proves the field is gone.
- [ ] `make openapi && make client` have regenerated the contract. `make openapi-breaking` passes with the new `.oasdiff-ignore` lines and fails without them.

## Edge States

- **Anonymous viewer:** `own` is false on every listing; browse and detail are otherwise unchanged.
- **Expired or invalid token on a public read:** served as anonymous, with `own` false and HTTP 200, never 401. The seller sees their own listing as not theirs until they sign in again. Where the seller-cannot-bid rule exists (another branch), the server still refuses a seller's bid on their own listing.
- **Malformed Authorization header:** anonymous, as above.
- **Seller viewing their own listing in browse:** the row action is "own" (no Bid). In detail, the seller block with Accept and Withdraw appears as today.
- **A SOLD, CANCELLED, EXPIRED or SETTLEMENT_FAILED listing viewed publicly:** no buyer, no sold price and no seller. `own` still tells the seller it was theirs. "Mine" still shows the sold price.
- **Old client still reading `sellerId`:** the field is absent, so an old tab treats the seller as a non-owner and offers Bid on their own listing until it reloads. Client and gateway ship together, so an old open tab is the only window.
- **A future HTTP cache in front of the public routes:** it must vary on Authorization, or cache only anonymous responses (ADR-0053). *(Amended 2026-11-05, Req 11a: the responses now say so themselves, `Vary: Authorization` always and `Cache-Control: private` when a bearer was sent; was: the rule stated for the cache alone.)*
- **A method on both interceptor lists:** a programming error. A test asserts the lists are disjoint.

## API surface

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| browse-listings | `GET /api/marketplace/listings` | unchanged (`cursor`, `limit`) | — | `200` page of the **public listing**: today's listing fields minus `sellerId`, `buyerId` and `soldPrice`, plus `own: boolean` (required). Headers: `Vary: Authorization`; `Cache-Control: private` when a bearer was sent *(Amended 2026-11-05, Req 11a)* | unchanged: `400 · VALIDATION_FAILED` (malformed cursor), `422 · VALIDATION_FAILED`, `500 · INTERNAL_ERROR`, `503 · SERVICE_UNAVAILABLE`. Never `401`: an invalid token is anonymous. |
| get-listing | `GET /api/marketplace/listings/{listing_id}` | unchanged | — | `200` **public listing** (as above), with the same headers *(Amended 2026-11-05, Req 11a)* | unchanged: `404 · NOT_FOUND`, `422 · VALIDATION_FAILED`, `500 · INTERNAL_ERROR`, `503 · SERVICE_UNAVAILABLE`. Never `401`. |
| list-my-listings | `GET /api/marketplace/listings/mine` | unchanged | — | unchanged (keeps `sellerId`, `buyerId`, `soldPrice`; no `own`) | unchanged |
| gRPC `Listing` | `marketplace.proto` | — | — | gains `bool own` (a new field number); `seller_id`, `buyer_id` and `sold_price` are kept | — |
| gRPC `BrowseListings`, `GetListing` | interceptor | optional-auth: `authorization: Bearer` is optional | — | `own` set per caller | never `Unauthenticated` |

Both public operations accept an optional `Authorization` header. It is forwarded as is and is not
documented as a security requirement.

## Out of Scope

- The public leaderboard's `member_id` (the other half of the join), and every stats read.
- My bids: its listing summary already carries no seller, buyer or other bidder.
- Stripping `seller_id`, `buyer_id` and `sold_price` from the public gRPC responses as well (defence in depth; a follow-up).
- Any HTTP caching.
- items, wallet, settlement, migrations.
- Changing list-my-listings' shape.
- Merges with the unmerged branches that also touch `typed.go`, `model.go`, `handler.go`, `marketplace.proto` and the generated files: regenerate after merging, never hand-merge.
