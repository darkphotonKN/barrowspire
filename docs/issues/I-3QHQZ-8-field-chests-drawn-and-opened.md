---
id: I-3QHQZ-8
status: done
implements: FS-3QHQZ
blocked_by: [I-3QHQZ-4, I-3QHQZ-7]
labels: [ready-for-agent]
title: "FS-3QHQZ slice 8: the field scene draws the Forest's clearing chests and opens them through the run's satchel"
---
Implements FS-3QHQZ §B (Requirements 19, 20)

Agent lane, client only. A slice the original slicing missed, found by I-3QHQZ-7: the server's
clearing chests (I-3QHQZ-4) reach the client in `containers[]` with `kind: "chest"`, but the
field scene keeps only `kind === "drop_pile"` containers (`src/scenes/fieldPiles.ts`), so a Forest
chest is never drawn and can never be opened. No wire change (Requirement 20): the chest, its
`is_open` and its `items` already ride the state broadcast.

## Files expected to touch

- `game-client/src/scenes/fieldPiles.ts` and its test: chests join the piles the field draws and
  reaches for, through the same one satchel.
- `game-client/src/render/world/chest.ts` (new) and its test: the run's chest placeholder
  painter and frame keys, moved out of `BarrowspireScene` so both scenes draw a chest the same way
  (as `dropPile.ts` is shared for piles). Behaviour-preserving for the run.
- `game-client/src/scenes/BarrowspireScene.ts`: delegate its chest textures and frame to the
  shared module; nothing else.
- `game-client/src/scenes/FieldScene.ts`: the chest stage (baked `chest` sheet, placeholder
  fallback); minimal.

## What to Build

In a field, every chest container in the broadcast is drawn where the server put it, with the
run's baked chest art (`chest` sheet, frames `closed` / `open`), its frame chosen from `is_open`
on every state, as the run does: there is no client-side "opened" memory, so a chest that
restocks (the broadcast shows `is_open` back to false, no items) draws closed again and can be
opened again. E within reach of a chest sends exactly the run's message (`interact` with the
chest's `entity_id`) and opens the run's satchel (`ContainerView`) on it; the satchel fills from
the broadcast once the chest is open, F and a click take items as from a pile, and walking out of
reach closes it. A chest is never reserved: anyone may open and take from it. A chest that
restocks while its satchel is open closes the satchel. The server's 100 ms
`containerInteractedCache` refusal on two near-simultaneous opens is left as it is: the second
player's satchel fills from the broadcast once the first open lands.

## Acceptance Criteria

- [ ] A field draws each `kind: "chest"` container at its position, in the baked `chest` art (the run's placeholder textures without the sheet), and drops it once the state does.
- [ ] Its frame follows `is_open` on every state: closed → open → closed again after a restock, with no cached "opened" state.
- [ ] E in reach of a chest sends `interact` `{ entity_id: <chest> }`, as the run does, and opens the satchel on it; the satchel shows the chest's items once the state has it open.
- [ ] A chest is never drawn faint and never refused as reserved, whoever opened it.
- [ ] Taking an item from a chest's satchel sends the run's loot message.
- [ ] A restocked chest closes an open satchel on it, draws closed, and a fresh E opens it again (sending again).
- [ ] Drop piles behave exactly as before (existing pile tests green, but for the one asserting chests are not drawn, which this slice reverses).
- [ ] The run draws its chests exactly as before, from the shared chest module.
- [ ] Client tests, `tsc` and lint green.

## Blocked By

- I-3QHQZ-4 (the server's clearing chests) — done
- I-3QHQZ-7 (the forest drawn in the field scene) — done

## Spec Reference

FS-3QHQZ §B Requirements 19 (chests: rolled on first open, open to anyone, restock after 5
minutes), 20 (no wire change: chests reach the client through the existing broadcast);
Acceptance Criteria "Forest world (§B)" chest item (its client half); Edge States "Two players
open a chest at once", "A chest is mid-restock while someone stands at it"; User Stories 7, 8.

## TDD Approach

- RED: `FieldPiles` given a `kind: "chest"` container draws it with its closed frame, and E in
  reach sends `interact` `{ entity_id }` and opens the satchel.
- GREEN: chests in `FieldPiles.sync` / `interact`; then the restock close; then the shared chest
  module and the field scene's chest stage.
