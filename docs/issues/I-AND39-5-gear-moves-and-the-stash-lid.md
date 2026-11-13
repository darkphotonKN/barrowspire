---
id: I-AND39-5
status: done
implements: FS-AND39
blocked_by: [I-AND39-1]
labels: [ready-for-agent]
title: "FS-AND39 slice 5: gear moves and the town's stash lid sound (game-client)"
---
Implements FS-AND39 §Requirements A

**Lane: agent.** Hotspots: `BarrowspireScene.ts`, `FieldScene.ts` and `HubScene.ts`. Touch only
the `EquipmentHud` construction (run ~3462, field ~594), and in the town the `HubGear`
construction (~3201) and the stash E (~1548).

## What to Build

- `item_swap` (R7):
  - `EquipmentHud` takes a sound hook. It plays in `onEquip` and `onUnequip` as each sends (run,
    field).
  - `HubGear` takes one too. It plays in `onEquip`, `onUnequip` and `onMove`, only when `send`
    returned true (town).
- `stash_open` (R6): the town's stash E plays `stash_open` when `openStash` returns true, beside
  FS-WDM0X's `inventory_open`, which stays as it is inside `this.act(...)`.

## Acceptance Criteria

- [ ] Every criterion under *Coffers and items* in FS-AND39 for gear and the stash.
- [ ] `EquipmentHud.test.ts` and `HubGear.test.ts` cover:
  - equip, unequip, swap and move playing;
  - a change dropped in flight playing nothing;
  - an unequip refused for room playing nothing.
- [ ] A HubScene test covers: stash E plays both sounds, and a refused E plays neither.
- [ ] Tests pass: full vitest, tsc, lint, lint:fence.

## Blocked By

I-AND39-1 (the player in each scene)

## Spec Reference

FS-AND39 §Requirements R1, R6, R7 (swap); user stories 14, 16, 17.

## Files it expects to touch

- `game-client/src/ui/EquipmentHud.ts` (+ test)
- `game-client/src/ui/HubGear.ts` (+ test)
- `game-client/src/scenes/HubScene.ts` (~1548, ~3201 only) (+ `HubScene.test.ts`)
- `game-client/src/scenes/BarrowspireScene.ts` (~3462 only)
- `game-client/src/scenes/FieldScene.ts` (~594 only)
