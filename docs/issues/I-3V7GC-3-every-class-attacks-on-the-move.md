---
id: I-3V7GC-3
status: done
implements: FS-3V7GC
blocked_by: [I-3V7GC-2]
labels: []
title: "FS-3V7GC slice 3: every class keeps walking while it attacks on the move, walk_attack (game-client)"
---
Implements FS-3V7GC §B (Requirements 4–8)

**Lane: agent (AFK).**

## What to Build

- Bake: one clip rule for the classes in `characters/clips.js`: `withWalkAttack(specs)` adds the
  `walk_attack` spec (twice the attack's frames at twice its fps, once, `boxed`);
  `CLASS_ANIMATIONS` (knight, archer, wizard) and `MERC_ANIMATIONS` (with the parry) both carry
  it, `ANIMATIONS` (creatures) does not. The three class entries in `cast.js` take them. Re-bake.
- Client: nothing new. `CharacterAnimator` already plays `walk_attack` on any sheet that carries
  it; the comments that call it the archer's say it is every class's.

## Acceptance Criteria

- [x] `walk_attack` on the knight's slash, the wizard's cast and the mercenary's slash takes legs and pelvis from the walk, everything else and the fx from the attack (the mercenary's free arm included), and drops the attack's lunge (`clips.test.mjs`).
- [x] The four class sheets carry `walk_attack`, 8-way, once, exactly as long as their attack; no creature or folk sheet does (`animationSelect.test.ts` against the real manifest).
- [x] Attacking while moving plays `walk_attack` faced to the aim; the warrior's charge plays `attack` (an explicit `Swing.charge`; it played `walk_attack` in the headless run before the fix, now covered by `character.test.ts` with the real `CHARGE_MS`); the mercenary's parry while moving plays `parry`.
- [x] Headless browser check on our own dev server where feasible: each class's `walk_attack` plays when attacking on the move; display size and feet equal the 1x sheet's in world units (FS-3V7GC § Verification).
- [x] Tests pass.

## Blocked By

I-3V7GC-2 (the clip is boxed into the 2x frame box).

## Spec Reference

FS-3V7GC §B R4–R8; user stories 4–7, 12.

## Commits

50c892ea (tests), 7dd49168 (bake), 789dc1fd (art); charge fix 7946ed66 (tests), aa728595 (client).

## Verification

Headless, 2026-11-06, Gentle Meadows, render scale 1 and 2: walk_attack 82–89 frame changes over 8 aims, attack 14 standing, walk alone; facing 10/10; geometry equal to the 1x sheets; parry 4 frames for about 250 ms; the knight's charge played walk_attack before the fix (FS-3V7GC § Verification).
