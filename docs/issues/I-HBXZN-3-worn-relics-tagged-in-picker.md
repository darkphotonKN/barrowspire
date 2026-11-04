---
id: I-HBXZN-3
status: done
implements: FS-HBXZN
blocked_by: []
labels: [ready-for-agent]
title: "FS-HBXZN slice 3: Worn relics are shown but not choosable, tagged \"Worn\", in the List-a-relic picker (game-client)"
---
Implements FS-HBXZN §Requirements D13–D16, §Edge States (taken off / put on after the drawer opened, loadout read fails)

Client only. Independent of I-HBXZN-1/2: it prevents the attempt; the server refusal is the
backstop. Touches `listRelic.ts` like I-HBXZN-2 (different functions), so if both run in
parallel expect a trivial merge.

## What to Build

- Read the member's loadout with the existing `apiClient.getLoadout()` (`GET /api/items/loadout`)
  alongside `getItemInstances()` when the drawer loads its relics (`useItemInstances` or a sibling
  read wired the same way); `reload` re-reads both. The instances API is not changed.
- Worn ids = every non-empty instance id in the loadout's ten slots (weapon, head, chest, gloves,
  legs, ring 1, ring 2, consumables 1–3).
- `pickerCards` (`src/marketplace/listRelic.ts`) takes the worn ids: an AVAILABLE relic whose id
  is worn → `selectable: false`, `tag: "Worn"`. A relic whose status is not AVAILABLE keeps its
  status tag even if worn (FS R15). Update `PickerCard.tag`'s doc comment.
- A failed loadout read → no worn ids; the picker stays usable (FS R16). It does not turn the
  drawer into an error state.
- `ListRelicDrawer.tsx`: no new visual; the existing disabled-card state renders the tag. Update
  its doc comment that names the disabled states.

## Acceptance Criteria

- [ ] `pickerCards` unit tests: worn AVAILABLE → disabled, tag "Worn"; unworn AVAILABLE →
      selectable, no tag; worn + LISTED → tag "Listed"; worn + unknown status → "Unavailable";
      no worn ids → today's behaviour.
- [ ] A consumable-slot id and a ring-slot id each count as worn.
- [ ] `canSubmitListing` is false with a worn relic chosen (it cannot be chosen; assert via the
      card).
- [ ] When the loadout read rejects, cards are as if nothing were worn and the picker lists.
- [ ] Reopening the drawer re-reads the loadout (a relic taken off since shows selectable).
- [ ] Client tests, typecheck and lint clean; a manual check in the browser: wear a relic in the
      hub, open the marketplace drawer, see it greyed with "Worn".

## Blocked By

None

## Spec Reference

FS-HBXZN §Requirements D13–D16; §Acceptance Criteria "game-client" (picker rows); §API surface
row "Get loadout"; User Stories 2, 3, 5, 6, 9.

## Files expected

- `game-client/src/marketplace/listRelic.ts` (+ `listRelic.test.ts`)
- `game-client/src/marketplace/useItemInstances.ts` (or a sibling loadout hook)
- `game-client/src/components/bazaar/ListRelicDrawer.tsx`
- `game-client/src/app/marketplace/page.tsx` (only if the wiring needs it)

## TDD Approach

- RED: `pickerCards([availableSword], new Set([sword.id]))` expects a disabled card tagged
  "Worn" (today: selectable).
- GREEN: the worn-id parameter and tag precedence.
