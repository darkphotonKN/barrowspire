---
id: I-3R77D-2
status: done
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

- [x] `pickerCards` table test: an AVAILABLE unworn stash relic gets a card; a bag relic, a
      listed / in-escrow / settling / in-run / unknown-status stash relic, a worn stash relic and
      a relic with no location get none; a stash relic with no status gets a card.
- [x] Cards carry no `selectable` and no `tag`; `canSubmitListing` is true for any chosen card
      with valid prices.
- [x] A failed loadout read still lists the unworn-by-default stash relics.
- [x] Reopening the drawer re-reads, so a relic moved into the stash shows. Covered at the loader:
      `loadPickerRelics` reads afresh on every load (pickerRelics.test.ts); the hook's re-read on
      every opening is unchanged FS-HBXZN code. Seen live in I-3R77D-3 step 5.
- [x] Full vitest suite, `tsc` and lint clean.

## Evidence (2026-11-06, fix round 1, at 64a35a84)

- `npx vitest run src/marketplace/listRelic.test.ts src/marketplace/pickerRelics.test.ts`:
  RED at 67799cd3 (13 failed), GREEN at 3cd8e803 (94 passed).
- `npx vitest run` (full suite): 230 files, 5543 tests passed.
- `npx tsc --noEmit -p .`: exit 0.
- `npx next lint --file` on the changed files: "No ESLint warnings or errors";
  `npm run lint:fence`: "lint fences verified".

## Blocked By

None

## Spec Reference

FS-3R77D §Requirements D10–D14, D16; §Acceptance Criteria "game-client"; §API surface row
"List item instances"; User Stories 1–7.

## TDD Approach

- RED: `pickerCards([{ id: "sword", status: "AVAILABLE", location: "bag" }])` expects no card
  (today: a selectable card).
- GREEN: the listable filter.
