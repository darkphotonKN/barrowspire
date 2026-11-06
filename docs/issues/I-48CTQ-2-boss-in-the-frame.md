---
id: I-48CTQ-2
status: done
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

- [x] Engaged when damaged, moving within 320 px (its aggro radius) or attacking within 700 px (its leash) of a living member; latched through wander, pause and swing-idle; released at full health beyond 700 px of every living member, on death or on leaving the snapshot (FS-48CTQ §D.10 as amended, review S2)
- [x] Priority: hover > engaged boss > last-hit (tests over every pair)
- [x] Boss frame ≤ 420 × 60, bar 1.5 × wider and twice as tall; layout clear of the top-right column and minimap at 1080
- [x] Floor 3's demon keeps its overhead plate
- [x] Typecheck and vitest pass

## Evidence (2026-11-06, fix round 1 on floor1/fix-48CTQ)

- **Engaged rule, latched (review S2):** `targetPick.test.ts` "engages": the radii read 320 and
  700 (`monster_tuning.go:238-242`); a full-health `move` engages at 319/320 px and not at 321 or
  699; an `attack` at 699/700 and not 701; both axes measured; idle never engages from cold; dead
  or escaped members do not count; damage engages anywhere. "BossEngagement": a demon wandering at
  480–500 px never takes the frame; once engaged, move/idle/move near the party and the
  attack/idle swing cycle stay engaged; released at full health once beyond 700 px of every living
  member (700 still holds); a damaged boss stays engaged at 9000 px; released on healing to full
  past the leash, on death, on leaving the snapshot, not re-engaged on return until the rule holds
  again; a fog-hidden boss keeps its latch and the picker passes it over; of two latched bosses the
  shown one is named; never a common or elite; `clear()` forgets all.
- **Priority:** `targetPick.test.ts` `pickTarget` pairs (hover > engaged boss > last-hit) and
  "should hold the frame ahead of the last-hit monster, a hovered one still winning".
- **Boss frame:** `targetFrame.test.ts` "the boss frame" (≤ 420 × 60, bar 1.5 × as wide, twice as
  tall) and "the frame's layout at 1080 and 1280" (clear of the top-right column and the minimap).
- **Floor 3's demon overhead:** `markerMode.test.ts` "should keep run floor 3 on overhead plates";
  the floors 2–3 captures recorded in I-48CTQ-1 show no plate change.
- **Gates:** `npx tsc --noEmit` clean; full vitest 240 files, 5841 tests pass.

## Blocked By

I-48CTQ-1

## Spec Reference

FS-48CTQ §C.5, §D.9–13, §E.14.

## TDD Approach

- RED: an engaged-rule test with a full-health boss at 699 and 701 px from a moving member
- GREEN: the rule, the priority and the style
