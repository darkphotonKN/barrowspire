---
id: I-04EEA-8
status: done
implements: FS-04EEA
blocked_by: [I-04EEA-2]
labels: [blocked]
title: "FS-04EEA slice 8: a stunned monster stands in its idle clip with a stun tell over its head"
---
Implements FS-04EEA §H R47, R48

**Author: agent**

## What to Build

Every viewer sees a stunned monster: it stands in its idle clip and carries a stun tell drawn in
code over its head until its `action` changes.

- `src/types/gameState.ts`: `MonsterAction` gains `"stunned"`.
- `src/render/art/animationSelect.ts`: `stunned` plays the idle clip (no new baked pose).
- A stun tell (`src/render/effects/stun.ts`, new): a small effect over the monster's head, built from
  existing fx textures, coloured with `BARROW` tokens, an entry in `render/effects/table.ts` inside
  `table.test.ts`'s bounds. Shown while the action is `stunned`, removed when it changes or the
  monster dies, in the run and the field scenes.
- An action the client does not know keeps today's drawing.
- **Where it lives** (integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream): the tell follows a monster, so the world scene draws it (ADR-0086
  2.1), the run's in `BarrowspireScene`'s monster update and the field's in `fieldCombat.ts`.
  Nothing goes in the UI scene and nothing crosses the UiBridge.
- Add a card for the tell to the dev effects gallery (`src/dev/gallery/effects.ts`); slice 9's
  contact sheet includes it.

## Acceptance Criteria

- [ ] A monster with `action: "stunned"` plays its idle clip and shows the tell; the tell goes when
      the action changes and when it dies.
- [ ] Teammates' clients show the same.
- [ ] A monster with an unknown action is drawn as before.
- [ ] The tell's entry passes `table.test.ts`; no raw colour, no new baked texture.
- [ ] The gallery shows the tell.
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-04EEA-2 (the server reports `stunned`).

## Spec Reference

FS-04EEA §H R47–R48, §C R17; §User Stories 26, 28; §Acceptance Criteria "game-client" (stun tell
row); §Edge States "Old client". ADR-0013, ADR-0020, ADR-0021.

## Files expected

- `game-client/src/types/gameState.ts`
- `game-client/src/render/art/animationSelect.ts`
- `game-client/src/render/effects/stun.ts` (new)
- `game-client/src/render/effects/stun.test.ts` (new)
- `game-client/src/render/effects/table.ts`
- `game-client/src/scenes/BarrowspireScene.ts`
- `game-client/src/scenes/fieldCombat.ts`
- `game-client/src/dev/gallery/effects.ts`

## TDD Approach

- RED: `animationSelect` picks `idle` for `stunned`; the scene's monster update shows the tell for
  `stunned` and removes it for `move`.
- GREEN: the action value, the clip choice, the tell.
