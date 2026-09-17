---
id: I-29KSH-3
status: done
implements: FS-29KSH
blocked_by: [I-29KSH-2]
labels: [blocked]
title: "FS-29KSH slice 3: hub map buildings and layout"
---
Implements FS-29KSH §Requirements 4

**Author: agent**

## What to Build

Dress the bare 2000×1000 field from I-29KSH-2 into a place.

Buildings are **exteriors only** — they have collision and cannot be entered. They reuse the
existing `Wall` entity; **no new component type**. Interiors and sub-areas are explicitly out of
scope (FS-29KSH §Out of Scope).

**Decide and proceed** (marked AFK deliberately): the layout is yours. Leave open ground around
the spawn point and around where the two function NPCs will stand (I-29KSH-6, I-29KSH-7), and leave
walkable regions wide enough for ambient NPCs to wander in (I-29KSH-8) without immediately wedging.

Visual treatment is owned by `game-client/docs/design-guideline.md`, not by this issue.

## Acceptance Criteria

- [x] Buildings block movement and cannot be walked through or entered.
- [x] Buildings are `Wall` entities; no new component type was introduced.
- [x] Open ground remains around the spawn point.
- [x] The map still cannot be left at any edge.
- [x] **Revised, as in the earlier slices:** no new test failures, no new lint findings versus
      the branch point. Lint held at 34.

## Blocked By

I-29KSH-2 — there must be a hub map to place buildings in.

## Spec Reference

FS-29KSH §Requirements 4. §Out of Scope: enterable interiors, additional hub sub-areas.

## TDD Approach

- RED: assert a player walking at a building's footprint is stopped at its edge.
- GREEN: building obstacles present in the hub map data as `Wall` entities.
