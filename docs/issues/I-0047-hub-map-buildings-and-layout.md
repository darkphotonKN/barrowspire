---
id: I-0047
status: open
implements: FS-0008
blocked_by: [I-0046]
labels: [blocked]
title: "FS-0008 slice 3: hub map buildings and layout"
---
Implements FS-0008 §Requirements 4

**Author: agent**

## What to Build

Dress the bare 2000×1000 field from I-0046 into a place.

Buildings are **exteriors only** — they have collision and cannot be entered. They reuse the
existing `Wall` entity; **no new component type**. Interiors and sub-areas are explicitly out of
scope (FS-0008 §Out of Scope).

**Decide and proceed** (marked AFK deliberately): the layout is yours. Leave open ground around
the spawn point and around where the two function NPCs will stand (I-0050, I-0051), and leave
walkable regions wide enough for ambient NPCs to wander in (I-0052) without immediately wedging.

Visual treatment is owned by `game-client/docs/design-guideline.md`, not by this issue.

## Acceptance Criteria

- [ ] Buildings block movement and cannot be walked through or entered.
- [ ] Buildings are `Wall` entities; no new component type was introduced.
- [ ] Open ground remains around the spawn point.
- [ ] The map still cannot be left at any edge.
- [ ] `go test ./...` passes and `golangci-lint run` is clean.

## Blocked By

I-0046 — there must be a hub map to place buildings in.

## Spec Reference

FS-0008 §Requirements 4. §Out of Scope: enterable interiors, additional hub sub-areas.

## TDD Approach

- RED: assert a player walking at a building's footprint is stopped at its edge.
- GREEN: building obstacles present in the hub map data as `Wall` entities.
