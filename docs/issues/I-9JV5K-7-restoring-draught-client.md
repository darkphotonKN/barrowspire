---
id: I-9JV5K-7
status: open
implements: FS-9JV5K
blocked_by: []
labels: [ready-for-agent]
title: FS-9JV5K slice 7: the draught in the wares panel, Drink from the bag and its icon
---
Implements FS-9JV5K §Change: The Restoring Draught

## What to Build
The client half (D6), as the antidote's client work did (c12c2b4d, fa63e6c0): the ware kind in the
hand-written wire types and the wares panel row; Drink on a draught in the bag (the bag item's
action, as for an antidote) sending `use_item`; `resource_full` → "You are already full."; the
shimmer in the drinker's resource colour; a baked item icon (a flask, resource-refill tone, in
`tools/bake/page/models/items.js` ICONS) chosen by `itemIcon()` for the template's name; the dev
gallery card if the icon family needs one. Run `npm run bake` for the icon; art never blocks (a
missing icon falls back as the resolver does).

## Acceptance Criteria
- [ ] The FS section's game-client criteria.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By
None (the wire is fixed by the FS: ware kind `restoring_draught`, refusal `resource_full`)

## Spec Reference
FS-9JV5K §Change: The Restoring Draught D6, Acceptance Criteria (client row).
