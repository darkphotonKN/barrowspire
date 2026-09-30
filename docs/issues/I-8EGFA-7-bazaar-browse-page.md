---
id: I-8EGFA-7
status: open
implements: FS-8EGFA
blocked_by: [I-8EGFA-3, I-8EGFA-6]
labels: [ready-for-agent]
title: "FS-8EGFA slice 7: the Bazaar browse page"
---
Implements FS-8EGFA §Requirements 20–22, 27, 28, 29, 30

## What to Build

### Page and navigation

- Add a `'use client'` route at `/marketplace` with the h1 "The Bazaar".
- Add a "Bazaar" link in `Header.tsx`, shown as active on this page.
- The page never loads Phaser.

### Loading listings

- Load `browse-listings` through `publicClient`, whether or not the visitor is signed in. This
  needs a new method in `src/utils/api.ts`.

### The table

Columns:

| Column | Content |
|---|---|
| Item | Icon, name and `RarityBadge` |
| Type | Type or slot |
| Price | `⟡` plus `currentPrice`, or `startPrice` marked "opening" |
| Bids | Bid count |
| Time left | Live countdown |
| Action | See the action cell below |

- **Sorting:** by price, time left or rarity. The default is time left, ascending.
- **Filters:** rarity chips and type chips.
- **Paging:** a "Show more" control loads the next cursor page.

### States

- **Loading:** skeleton rows with a brass shimmer. No shimmer under `prefers-reduced-motion`.
- **Empty:** "The coffers are bare — no relics are up for auction."
- **503:** "The Bazaar is unreachable — try again shortly." with a retry.
- **Missing `item`:** the row shows "Unknown relic" with the generic icon.

### Action cell and CTAs

- **Signed-in member's own listing** (`sellerId` matches): "Your listing".
- **Signed out:** "Sign in to bid", linking to `/login` and returning to `/marketplace`.
- **Otherwise:** a Bid control that opens the detail dialog. The dialog itself is slice 8; until
  then the control can be disabled or do nothing.
- **Signed out:** "Sign in to list" replaces "List a relic".

### Visual rules

- One torch per view.
- Tokens only.

## Acceptance Criteria

- [ ] `/marketplace` renders the table when signed out, and the header's Bazaar link is active.
- [ ] Rows show the icon, name, rarity badge, type, price (opening or current), bid count and a live time left.
- [ ] All three sorts and both chip filters work over the loaded rows, and "Show more" appends the next page.
- [ ] Signed in as `aldric@barrowspire.dev`, Aldric's own listing reads "Your listing".
- [ ] The skeleton, empty and 503 states render, and reduced motion drops the shimmer.
- [ ] The table works from the keyboard, with visible focus and targets of at least 40px.
- [ ] Lint, fence, token check and tests pass.

## Blocked By

- I-8EGFA-3: the browse endpoint and the generated types.
- I-8EGFA-6: the badge, the icon and the pure modules.

## Spec Reference

- FS-8EGFA §Requirements 20–22, 27, 28, 29 (the 503 copy only), 30.
- FS-8EGFA §Edge States: empty browse, missing summary, items down, a listing ending while shown in the table.
- User stories 1–8, 10, 25–28.
