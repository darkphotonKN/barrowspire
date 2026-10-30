---
id: I-HRH2J-4
status: done
implements: FS-HRH2J
blocked_by: [I-HRH2J-2, I-HRH2J-3]
labels: [ready-for-agent]
title: "FS-HRH2J slice 4: the overlay in the hub, REST-backed; LoadoutScene retired; Quartermaster's new line"
---
Implements FS-HRH2J §E Requirements 40–45, §F Requirements 46–47, §B Requirement 23

**Author: agent**

## What to Build

The same overlay opens in the hub with I or B, over the live, walkable hub, backed by the REST
calls LoadoutScene made. LoadoutScene is deleted and unregistered; the Quartermaster no longer
offers "Open pack" and gets a new line in the game's voice.

- `HubScene.ts`: compose the overlay; I/B toggle; ESC precedence dialogue → overlay → menu (R5);
  I/B ignored while a dialogue or the ESC menu is open (R6); E owned by the overlay while open
  (R10); WASD unblocked (R7). Stats panel from the hub's `PlayerState` (slice 3's model).
- REST source (R41–43): on each open, `apiClient.getItemInstances()`, `apiClient.getLoadout()`,
  `apiClient.getItemRarities()` (optional), mapped with `instanceItem` / `rarityNames`
  (`src/items/loadoutItem.ts`), loadout ids into slots, the rest into the bag in REST order.
  Equip/unequip via `apiClient.updateLoadout(backendSlot, id | null)` (chest/gloves/legs mapping
  as LoadoutScene had it), optimistic, one at a time with a busy state; failure → hub `notice`
  "Could not change your gear." and reload; load failure → error line, reopen retries. Lift the
  loader out of LoadoutScene into a small Phaser-free module so it is testable.
- No capacity pre-check in the hub (R44); over 30 renders extra tinted rows, `N / 30` in the
  over tone, scroll if needed, nothing hidden (R23).
- Quartermaster (R45): `NPC_DIALOGUE.storekeeper` keeps its role and one dismiss choice; "Open
  pack" removed; new line written from the lore docs (design-guideline "Copy voice";
  `game-client/CONTEXT.md`), promising no function he lacks. Server `hub_map.go` untouched.
- Retire LoadoutScene (R46–47): delete `src/scenes/LoadoutScene.ts`; remove it from
  `src/components/PhaserGame.tsx`, `src/components/worldRouting.ts` (+ `worldRouting.test.ts`),
  `HubScene.openLoadout` (+ its `HubScene.test.ts` case); drop what only it used (e.g.
  `MENU_EQUIPMENT_THEME` in `src/ui/menuChrome.ts` if unused); fix stale comments
  (`MainMenuScene.ts` ~197, `src/utils/theme.ts` ~16) and the design-guideline "UI Chrome"
  sentences naming the loadout screen / `MENU_EQUIPMENT_THEME` (remove the screen, add no rule).

## Acceptance Criteria

- [ ] I and B toggle the overlay anywhere in the hub; the player stays in the hub and can walk.
- [ ] ESC: dialogue first, then overlay, then menu; I/B do nothing while a dialogue or the menu is open.
- [ ] Gear and bag load from REST on open (loading state shown); equip/unequip call `updateLoadout` one at a time; displaced items go to the end of the local bag.
- [ ] A failed update shows the notice and reloads; a failed load shows an error line and reopen retries.
- [ ] More than 30 owned unworn items: extra tinted rows, count shows over, every item reachable; unequip still sent.
- [ ] Stats panel renders in the hub from hub state (rows absent in hub state hidden).
- [ ] The storekeeper dialogue has no "Open pack", a new in-voice line and one dismiss choice.
- [ ] `LoadoutScene.ts` is deleted; no reference to `LoadoutScene` remains in `src/`; tests updated; client test suite passes.
- [ ] Stale comments and design-guideline sentences corrected.
- [ ] No HTTP endpoint, generated client, OpenAPI or server change in the diff.

## Blocked By

I-HRH2J-2 (the overlay), I-HRH2J-3 (the stats panel)

## Spec Reference

FS-HRH2J §E R40–45, §F R46–47, §B R23; User Stories 21–24, 26–27; Edge States "Hub REST slow",
"Hub REST failed", "Hub update in flight and the overlay is closed", "Over capacity at ship".

## Files expected

- `game-client/src/scenes/HubScene.ts` (+ `HubScene.test.ts`)
- `game-client/src/scenes/LoadoutScene.ts` (deleted)
- a new Phaser-free hub gear loader under `game-client/src/` (+ test); `game-client/src/items/loadoutItem.ts`, `game-client/src/utils/api.ts` (read/reuse)
- `game-client/src/components/PhaserGame.tsx`, `game-client/src/components/worldRouting.ts` (+ `.test.ts`)
- `game-client/src/ui/menuChrome.ts`, `game-client/src/scenes/MainMenuScene.ts`, `game-client/src/utils/theme.ts`
- `game-client/docs/design-guideline.md` ("UI Chrome")

## TDD Approach

- RED: the hub gear loader maps instances + loadout into slots and a bag (REST order), and >30
  items yields over-capacity rows.
- GREEN: lift LoadoutScene's `loadData` into the loader; wire HubScene; then delete LoadoutScene.
