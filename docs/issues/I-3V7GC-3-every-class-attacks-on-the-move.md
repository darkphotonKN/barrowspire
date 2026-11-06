---
id: I-3V7GC-3
status: open
implements: FS-3V7GC
blocked_by: [I-3V7GC-2]
labels: [ready-for-agent]
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

- [ ] `walk_attack` on the knight's slash, the wizard's cast and the mercenary's slash takes legs and pelvis from the walk, everything else and the fx from the attack (the mercenary's free arm included), and drops the attack's lunge (`clips.test.mjs`).
- [ ] The four class sheets carry `walk_attack`, 8-way, once, exactly as long as their attack; no creature or folk sheet does (`animationSelect.test.ts` against the real manifest).
- [ ] Attacking while moving plays `walk_attack` faced to the aim; a held charge plays `attack`; the mercenary's parry while moving plays `parry`.
- [ ] Headless browser check on our own dev server where feasible: each class's `walk_attack` plays when attacking on the move; display size and feet equal the 1x sheet's in world units (FS-3V7GC § Verification).
- [ ] Tests pass.

## Blocked By

I-3V7GC-2 (the clip is boxed into the 2x frame box).

## Spec Reference

FS-3V7GC §B R4–R8; user stories 4–7, 12.
