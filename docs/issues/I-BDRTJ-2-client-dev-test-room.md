---
id: I-BDRTJ-2
status: done
implements: FS-BDRTJ
blocked_by: [I-BDRTJ-1]
labels: []
title: "FS-BDRTJ slice 2: client dev test room (gate, field id, room size, art groups, label, dev-only guard)"
---
Implements FS-BDRTJ §Requirements (2-3, 5-6, 14), §Acceptance Criteria

## What to Build

The client's way into the room, in non-production builds only: the gate and field id, a plain text label at the gate, the room's size, and the art groups for its enemies. The look needs no entry, since `fieldLook` already draws an unknown field as the Meadows.

## Acceptance Criteria

- [ ] `FieldId` gains `dev_test_room` and `GateState["destination"]` gains its gate, with `FIELD_NAMES` and `FIELD_IDS` entries.
- [ ] `FIELD_SIZE` has 900x600. `SCENE_ART.FieldScene` has `["creatures", "boss"]`, so Troll and Demon draw.
- [ ] A plain text label stands at the gate's server position while the gate is in the hub state. The gate does not raise the field-name sign, whose `signpostOf` would pick the Forest's post.
- [ ] Guard is `process.env.NODE_ENV !== "production"` with no override. With `production`, the gate is dropped from what `HubScene` follows and labels, so nothing shows and nothing is sent. Tested through a pure function that takes the env value.
- [ ] `tsc`, lint and the vitest suite pass, including the `sceneArt` coverage test.

## Blocked By

I-BDRTJ-1

## Spec Reference

FS-BDRTJ §Requirements 2-3, 5-6, 14: guard, label, room, enemy art. User Stories 1, 5.

## Files Expected

- `game-client/src/assets/types/client.ts`, `src/types/gameState.ts`
- `game-client/src/scenes/hubGates.ts`, `src/scenes/hubGates.test.ts`, `src/scenes/HubScene.ts`, `src/scenes/FieldScene.ts`
- `game-client/src/render/art/sceneArt.ts`, and `sceneArt.test.ts` if its coverage walk needs the new field

## TDD Approach

- RED: `hubGates.test.ts` asserts that the dev gate is dropped under `production` and kept otherwise, and that it maps to `dev_test_room`.
- GREEN: the guard function and the `FIELD_IDS` entry.
