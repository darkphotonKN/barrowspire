---
id: I-8EGFA-6
status: open
implements: FS-8EGFA
blocked_by: []
labels: [ready-for-agent]
title: "FS-8EGFA slice 6: client foundations (guideline, rarity badge, icons, pure modules)"
---
Implements FS-8EGFA §Requirements 30–34

## What to Build

This slice lays the groundwork the Bazaar page stands on. It has no backend dependency.

### Guideline amendment (req 33)

Amend the marketplace section in Part II of `game-client/docs/design-guideline.md`:
- The listing browser is a table: rows, columns, sorting, filter chips, and a rarity accent edge.
- The card grid stays, for the List-a-relic item picker.

### `RarityBadge` (req 31)

Extract the badge from `src/app/page.tsx` into a shared component. It covers the five server
tiers, mapped by name to tokens:

| Server tier | Token |
|---|---|
| normal | common |
| uncommon | uncommon |
| rare | rare |
| runed | epic |
| fabled | legendary |

An unknown tier renders as common, with the raw name as its label. The landing page switches to
the shared component.

### Icons (req 32)

- Move `ITEM_ICONS`, `WEAPON_ICONS`, `ARMOR_ICONS` and the resolver out of
  `src/ui/ContainerView.ts` into a Phaser-free module. Both the canvas and the page import it.
  Canvas behaviour stays the same.
- The resolver must accept the camelCase `ItemSummary` shape as well as the snake_case
  `ItemInstance`.
- Add a DOM `ItemIcon` component. It crops `public/art/icons-0.png` at the frame from
  `public/art/manifest.json`, using CSS `background-position`.

### Pure modules, each with Vitest tests (req 34)

- **Time-left formatting:** whole minutes; seconds in the last minute; "Ended" once it's over.
- **Listing status labels:**

  | Listing state | Label |
  |---|---|
  | `ended` | "Ended — awaiting settlement" |
  | PENDING_SETTLEMENT | "Settling" |
  | SOLD | "Sold" |
  | CANCELLED | "Withdrawn" |

- **Sorting and filtering rows:** sort by price, time left or rarity; filter by rarity or type.
- **Gold formatting:** digit grouping, with no floating-point arithmetic.

## Acceptance Criteria

- [ ] Part II of the guideline describes the listing table.
- [ ] The landing page renders through the shared `RarityBadge`, and each of the five tiers shows its token colour and text label.
- [ ] The Phaser canvas shows the same item icons as before. The existing `ContainerView` tests still pass, with only the import updated.
- [ ] Each pure module has table-driven Vitest tests.
- [ ] `npm run lint`, `npm run lint:fence`, `scripts-check-css-tokens.sh` and `npm test` all pass.
- [ ] There's no raw hex and no emoji.

## Blocked By

None

## Spec Reference

FS-8EGFA §Requirements 30–34; stories 2, 4, 24, 25.

## TDD Approach

- RED: write tests for time-left formatting, status labels, rarity mapping, and sorting and filtering.
- GREEN: implement each pure module, then extract the components.
