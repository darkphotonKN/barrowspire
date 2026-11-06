---
id: I-SRA9J-2
status: open
implements: FS-SRA9J
blocked_by: [I-SRA9J-1]
labels: [blocked]
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

- [ ] Rule tests: visible region → shown; 399 px from a member in an unexplored region → shown; 401 px → hidden
- [ ] Hidden monsters have hidden plates, bars, elite markers and eyes (scene test)
- [ ] Drop piles follow the rule
- [ ] A hidden monster gets no strike cursor and no attack on click
- [ ] Typecheck and vitest pass

## Blocked By

I-SRA9J-1

## Spec Reference

FS-SRA9J §D.15–18.

## TDD Approach

- RED: the 399/401 px rule test
- GREEN: the rule and the monster view's hide
