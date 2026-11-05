---
id: I-HF0WW-2
status: done
implements: FS-HF0WW
blocked_by: [I-HF0WW-1]
labels: []
title: "FS-HF0WW slice 2: the archer's legs keep walking while he shoots on the move, walk_attack (game-client)"
---
Implements FS-HF0WW §B (Requirements 10–15)

**Lane: agent (AFK), retroactive.** Built on `spike/archer-2x`; re-verified on screen under
Phaser 4.2.1 on 2026-11-06.

## What to Build

A fifth clip on the archer's sheet, `walk_attack`, and the client playing it when he attacks while
moving.

- Bake: `ARCHER_ANIMATIONS.walk_attack` (14 frames at 24 fps, once, `boxed`), `layerPoses` and
  `walkAttackClip` (`characters/clips.js`): the attack from the waist up over two walk cycles from
  the waist down, the spine taking up the pelvis difference; springs walk and calm
  (`page/main.js`); a `boxed` pose never sizes the frame and fails the bake if it falls outside
  (`page/baker.js`).
- Client: `selectAnimation` picks `walk_attack` when attacking, moving and the sheet carries it,
  faced to the aim (`render/art/animationSelect.ts`); `CharacterMotion` passes it unless a charge
  is held; `CharacterAnimator.show` swaps between `attack` and `walk_attack` at the same point of
  the shot (`render/art/character.ts`).

## Acceptance Criteria

- [x] `walk_attack` lasts exactly as long as the attack, holds each attack key two frames, takes legs and pelvis from the walk and everything else from the attack, and keeps the chest's aim in the model (`clips.test.mjs`).
- [x] Only the archer's sheet carries it; it never widens the frame (326×288 unchanged).
- [x] In Gentle Meadows at render scale 1, 1.5 and 2: shooting while walking plays `walk_attack` facing the aim (82–89 frame changes per run); a standing shot plays `attack`; walking alone plays `walk` (FS-HF0WW § Verification).
- [x] A held charge plays `attack`; switching mid-shot carries on from the same point (`character.test.ts`, `animationSelect.test.ts`).
- [x] Tests pass.

## Blocked By

I-HF0WW-1

## Spec Reference

FS-HF0WW §B R10–R15; user stories 8–12.

## Commits

dad36090 (bake), 3a633718 (client), 8bb9ad9c (art).
