---
id: I-GTNP8-2
status: open
implements: FS-GTNP8
blocked_by: [I-GTNP8-1]
labels: []
title: "FS-GTNP8 slice 2: Nick's browser check of the listed mark, notes and refusals in the hub (game-client)"
---
Implements FS-GTNP8 §C (Requirements 5–7), §D (Requirement 10), §Acceptance Criteria

**Lane: human (HITL).** Nick, in a real browser, on `feat/client-listed-item-note`. No code unless
the check finds something; a finding becomes a new issue or an escalation.

## What to Check

List a relic on the Bazaar (one in the bag, one in the stash), and have one sale settling if
you can (the local DB already holds `LISTED` and `PENDING_SETTLEMENT` rows for some seeded
accounts). Then open the gear overlay in the hub and the stash chest.

## Acceptance Criteria

- [ ] A listed item in the bag and in the stash: faint icon, a red triangle in the cell's top-right corner, readable without hovering.
- [ ] Its tip says "Listed on the Bazaar." in red; a settling item's says "Sale settling…".
- [ ] Right-click / E on a listed bag item: nothing moves, the hub notice says "Listed on the Bazaar: withdraw it to use it."
- [ ] At the stash chest, moving a listed item either way: the same notice, the item stays put.
- [ ] A settling item: "That item's sale is settling."
- [ ] A free item and an in-delve item carry no triangle; in-delve still says "Still in a delve." / "That item is still in a delve."
- [ ] The mark reads at render scale 1 (a small window) and 2 (HiDPI or fullscreen), on the smallest cells too.
- [ ] Withdraw the listing in the Bazaar, close and reopen the overlay: the mark and note are gone and the item wears.
- [ ] Accept or reject the mark's look and the words.

## Blocked By

I-GTNP8-1

## Spec Reference

FS-GTNP8 §C, §D, §Acceptance Criteria, §Edge States.
