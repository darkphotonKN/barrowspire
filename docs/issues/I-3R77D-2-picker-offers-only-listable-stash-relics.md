---
id: I-3R77D-2
status: open
implements: FS-3R77D
blocked_by: []
labels: [ready-for-agent]
title: "FS-3R77D slice 2: the List-a-relic picker offers only listable stash relics, with a plain empty state (game-client)"
---
Implements FS-3R77D §Requirements D10–D14, D16, §Edge States (relic moved into the stash after the drawer opened, stash empty, loadout read fails)

Client only. Independent of I-3R77D-1: it stops the attempt; the server refusal is the backstop.
Both touch `listRelic.ts` (different functions), so a trivial merge if run in parallel.

## What to Build

- `PickerInstance` gains `location?: string`.
- `pickerCards(instances, worn)` makes a card only for an instance with an id, `location`
  `stash` (case-insensitive), `instanceStatus` AVAILABLE and an id not in `worn`. Everything else
  gets no card.
- `PickerCard` drops `selectable` and `tag`; the status tag table goes. `canSubmitListing` needs
  only a chosen card.
- `NOTHING_LISTABLE` becomes "Nothing in your stash to list. Move a relic into your stash in
  town."
- `ListRelicDrawer.tsx`: no disabled card state and no tag; with relics read and no card, show
  `NOTHING_LISTABLE` in place of the grid; submit disabled. Doc comments that name the disabled
  states and the worn tag are corrected (`listRelic.ts`, `pickerRelics.ts`,
  `useItemInstances.ts`, the drawer).
- The loadout read and its fail-open stance are unchanged.

## Acceptance Criteria

- [ ] `pickerCards` table test: an AVAILABLE unworn stash relic gets a card; a bag relic, a
      listed / in-escrow / settling / in-run / unknown-status stash relic, a worn stash relic and
      a relic with no location get none; a stash relic with no status gets a card.
- [ ] Cards carry no `selectable` and no `tag`; `canSubmitListing` is true for any chosen card
      with valid prices.
- [ ] A failed loadout read still lists the unworn-by-default stash relics.
- [ ] Reopening the drawer re-reads, so a relic moved into the stash shows.
- [ ] Full vitest suite, `tsc` and lint clean.

## Blocked By

None

## Spec Reference

FS-3R77D §Requirements D10–D14, D16; §Acceptance Criteria "game-client"; §API surface row
"List item instances"; User Stories 1–7.

## TDD Approach

- RED: `pickerCards([{ id: "sword", status: "AVAILABLE", location: "bag" }])` expects no card
  (today: a selectable card).
- GREEN: the listable filter.
