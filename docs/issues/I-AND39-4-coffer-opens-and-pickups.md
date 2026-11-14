---
id: I-AND39-4
status: done
implements: FS-AND39
blocked_by: [I-AND39-1]
labels: [ready-for-agent]
title: "FS-AND39 slice 4: coffer opens and pickups sound, in the run and the field (game-client)"
---
Implements FS-AND39 §Requirements A

**Lane: agent.** Hotspots: `BarrowspireScene.ts` and `FieldScene.ts`. Touch only the
`ContainerView` construction (run ~3241, field ~533) and the loot handlers (run `lootChestItem`
~3092, field `lootFromSatchel` ~794).

## What to Build

- `chest_open` / `loot_open` (R5): `ContainerView.open` is the one point every own open passes
  through:
  - the run's reach answered (~2554) and its already-open path (~3026);
  - the field's pile (~139) and its `followReach` (~249).

  Give the view an open hook, an option called with the kind as it opens. Each scene plays
  `chest_open` for `chest` and `loot_open` for `sack` or `drop_pile`. Others' opens never reach
  the view, and stay silent.
- `item_pickup` (R7): the run's `lootChestItem` plays it as it sends. The field's
  `lootFromSatchel` plays it only when `FieldPiles.loot` returns true.

## Acceptance Criteria

- [ ] Every criterion under *Coffers and items* in FS-AND39 for coffer opens and pickups.
- [ ] `ContainerView.test.ts` covers the hook once per open, with the kind.
- [ ] Scene or `fieldPiles` tests cover:
  - the run's reach-answered and already-open paths;
  - a timed open sounding at the open;
  - the field's pile and chest;
  - a refused reach;
  - a full bag and a reserved pile staying silent.
- [ ] Tests pass: full vitest, tsc, lint, lint:fence.

## Blocked By

I-AND39-1 (the player in each scene)

## Spec Reference

FS-AND39 §Requirements R1, R5, R7 (pickup); user stories 10–13, 15, 18, 19.

## Files it expects to touch

- `game-client/src/ui/ContainerView.ts` (+ test)
- `game-client/src/scenes/BarrowspireScene.ts` (~3092, ~3241 only)
- `game-client/src/scenes/FieldScene.ts` (~533, ~794 only)
- `game-client/src/scenes/fieldPiles.test.ts` (tests only, if the field's opens are tested there)
