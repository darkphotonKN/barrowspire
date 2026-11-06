---
id: I-48CTQ-2
status: open
implements: FS-48CTQ
blocked_by: [I-48CTQ-1]
labels: [blocked]
title: "FS-48CTQ slice 2: an engaged boss holds the target frame ahead of the last-hit monster, with a wider bar (game-client)"
---
Implements FS-48CTQ §C Requirement 5, §D (Requirements 9–13), §E Requirement 14

**Lane: agent (AFK), game-client.**

## What to Build

The boss on a `frame` floor carries no head plate and is a frame candidate when engaged: alive and either below full health or within 700 px (its leash) of a living party member while its action is `move` or `attack`. With nothing hovered, an engaged boss holds the frame ahead of the last-hit monster; a hovered monster still wins. The boss frame is up to 420 × 60 with a bar 1.5 × the normal width and twice its height. Floor 3's demon stays `overhead`.

## Files (expected)

- `game-client/src/render/creatures/targetPick.ts` (engaged rule, priority)
- `game-client/src/ui/targetFrame.ts` (boss style)
- their tests

## Acceptance Criteria

- [ ] Engaged when damaged, or within 700 px of a living member while moving or attacking; not engaged at full health beyond 700 px
- [ ] Priority: hover > engaged boss > last-hit (tests over every pair)
- [ ] Boss frame ≤ 420 × 60, bar 1.5 × wider and twice as tall; layout clear of the top-right column and minimap at 1080
- [ ] Floor 3's demon keeps its overhead plate
- [ ] Typecheck and vitest pass

## Blocked By

I-48CTQ-1

## Spec Reference

FS-48CTQ §C.5, §D.9–13, §E.14.

## TDD Approach

- RED: an engaged-rule test with a full-health boss at 699 and 701 px from a moving member
- GREEN: the rule, the priority and the style
