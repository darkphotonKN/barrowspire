---
id: I-GKHYD-3
status: done
implements: FS-GKHYD
blocked_by: [I-GKHYD-2]
labels: []
title: "FS-GKHYD slice 3: the client decides \"is this mine\" from own and sends the bearer on public reads (game-client)"
---
Implements FS-GKHYD §Requirements 12–13, §Edge States

## What to Build

- **Public reads with the token:** `PublicApi.browseListings` and `getListing` in `src/utils/api.ts` send `Authorization: Bearer` when a token is stored.
  - They must not go through the authenticated client's refresh or sign-out handling: an expired token simply reads as anonymous (FS-8EGFA §Req 21's property, kept by ADR-0053).
  - They still use the generated client, never a hand-written fetch.
- **Use `own` everywhere "is this mine" is decided today:**
  - `marketplace/browse.ts` `rowAction`;
  - `marketplace/detail.ts` `actionArea`;
  - `components/bazaar/ListingDetailDialog.tsx` (the seller-block mount);
  - `marketplace/accept.ts` `sellerBlock`;
  - `marketplace/buyout.ts`.

  Each one drops its `sellerId` parameter and stops comparing member ids. My listings keeps its own type unchanged.

## Acceptance Criteria

- [ ] Logic tests:
  - an own listing gives row action "own" and the detail "own" panel;
  - a non-own listing gives bid controls for a signed-in viewer;
  - an anonymous viewer gets sign-in;
  - the accept and buyout helpers key off `own`.
- [ ] Signed in, the public reads carry the bearer. An expired or invalid token still loads the page and never triggers refresh or sign-out.
- [ ] No client code reads `sellerId`, `buyerId` or `soldPrice` from a public read. `tsc --noEmit` is clean on the regenerated types.
- [ ] vitest and next lint are green.

## Blocked By

I-GKHYD-2

## Spec Reference

FS-GKHYD §Requirements 12 (bearer on public reads), 13 (own everywhere), §Edge States (anonymous; expired token; seller in browse and detail; old client).

## Expected files

`game-client/src/utils/api.ts` (+ `api.test.ts`); `game-client/src/marketplace/{browse.ts, detail.ts, accept.ts, buyout.ts}` + tests; `game-client/src/components/bazaar/ListingDetailDialog.tsx`; possibly `SellerBlock.tsx` if it reads `sellerId`.
