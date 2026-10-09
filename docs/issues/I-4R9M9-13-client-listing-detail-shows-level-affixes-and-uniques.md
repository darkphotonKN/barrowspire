---
id: I-4R9M9-13
status: done
implements: FS-4R9M9
blocked_by: [I-4R9M9-3]
labels: [ready-for-agent]
title: "FS-4R9M9 slice 13: Marketplace listing detail shows item level, requirement, affixes and unique effect"
---
Implements FS-4R9M9 §Requirements (Client 59)

**Domain:** game-client · **Touches `internal/game/session.go`:** no · **Lane:** agent (frontend lane).

## What to Build

- `components/bazaar/ListingDetailDialog.tsx` (via `marketplace/detail.ts`) renders the listing's
  `ItemSummary` with the same item-detail lines as the run views: rarity colour, base stats,
  "Item level N", "Requires level N", affix lines, unique effect + lore. Reuse I-4R9M9-12's
  presenter if it has landed; otherwise create it here in a shared module and let slice 12 reuse it
  (whichever lands first owns it).
- `itemType: "ring"` renders with the ring icon.
- Legacy listings (ilvl 1, `affixes: []`) render without affix lines and never error.

## Acceptance Criteria

- [ ] Detail dialog shows ilvl, requirement, affixes and unique effect for an affixed / unique
      listing (`detail.test.ts`).
- [ ] Legacy listing renders cleanly.
- [ ] `tsc` and tests pass.

## Blocked By

I-4R9M9-3 (generated listing types with the new fields).

## Spec Reference

FS-4R9M9 §Requirements 59; §Acceptance Criteria "Protocol, gateway, client" row 3; §Edge States
"Marketplace listing of an instance created before this FS". User Stories 21–23.

## TDD Approach

- RED: `detail.test.ts` — summary with two affixes → two affix lines.
- GREEN: map generated `ItemSummary` into the presenter.
