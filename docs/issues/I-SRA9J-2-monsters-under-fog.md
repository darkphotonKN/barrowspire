---
id: I-SRA9J-2
status: done
implements: FS-SRA9J
blocked_by: []
labels: [ready-for-agent]
title: "FS-SRA9J slice 2: monsters and drop piles shown only in visible regions or within 400 px of a living member, markers included, and untargetable when hidden (game-client)"
---
Implements FS-SRA9J §D (Requirements 15–18)

**Lane: agent (AFK), game-client.**

## What to Build

On a fogged floor a monster is shown when it stands in a visible region or within 400 px of any living, in-play member; otherwise it and every marker (plate, bar, elite marker, eyes) are hidden. Drop piles follow the same rule. A hidden monster gets no strike-mark cursor, no click-to-attack and is never offered to the target frame (FS-48CTQ). Party members are never hidden.

## Files (expected)

- `game-client/src/render/world/exploration.ts` (the shown-monster rule)
- `game-client/src/render/creatures/monsters.ts` (hide sprite and markers)
- `game-client/src/render/world/dropPile.ts`
- `game-client/src/scenes/BarrowspireScene.ts` (hover cursor and click target skip hidden monsters)

## Acceptance Criteria

- [x] Rule tests: visible region → shown; 399 px from a member in an unexplored region → shown; 401 px → hidden
- [x] Hidden monsters have hidden plates, bars, elite markers and eyes (scene test)
- [x] Drop piles follow the rule
- [x] A hidden monster gets no strike cursor and no attack on click
- [x] Typecheck and vitest pass

## Evidence (2026-11-06, review fix round 1, branch floor1/fix-client)

- Rule: `exploration.test.ts` "which monsters and drop piles the fog shows (FS-SRA9J §D.15,
  §D.16, B3)" ("shows within 400 px", visible region, explored region beyond 400 px).
- Markers: scene "should show a monster in the player's room or within 400 px of them, and hide
  one beyond, plate, prefix and bar with it", "should hide a monster in an explored region once no
  member is within 400 px of it".
- Drop piles: "should show a drop pile by the monster rule, while a chest in an explored region
  stays drawn".
- Targeting: "should give a hidden monster no strike-mark and no attack, and drop the strike-mark
  when the hovered one is hidden"; "should name no hidden monster in the target frame…".
- Review round 1, B3 (a monster within 400 px in an unexplored region): unchanged, recorded in
  FS-SRA9J's edge states as owner-pending (A/B/C; C stands). The shared hide rule's change on
  floors 2–3 (no flash, no fall replay on blackout re-entry) is recorded there too.
- Typecheck and vitest pass.

## Blocked By

I-SRA9J-1

## Spec Reference

FS-SRA9J §D.15–18.

## TDD Approach

- RED: the 399/401 px rule test
- GREEN: the rule and the monster view's hide
