---
id: I-CH21F-3
status: in-progress
implements: FS-CH21F
blocked_by: []
labels: [ready-for-agent]
title: "FS-CH21F slice 3: other delvers' names always shown in the tower, their overhead health bars hidden (game-client)"
---
Implements FS-CH21F §Requirements R13–R16

**Lane: agent (AFK).** Client only; no server dependency.

## What to Build

- In the run scene every other delver's name shows over their head without hover, in the ally channel, placed at the marker base; not over a baked corpse (no marker base). The player's own name unchanged. Remove the hover-only behaviour (`nameText.setVisible(false)` at creation ~L3444; `markTeammate` ~L4557's `hoveredPlayerId === playerId` test). Hover tracking may stay if anything else uses it.
- Hide the overhead health bars over other delvers (FS-8AY7S R27, `teammateHealthBars` / `drawTeammateBar` ~L3476, ~L4566) as a switch, not a rewrite; name placement must not depend on a bar. Monsters' bars unchanged.
- No level over anyone's head; hub and field overhead names untouched.

## Acceptance Criteria

- [ ] A living other delver's name is visible over them with no hover; none over a baked corpse; the own name unchanged.
- [ ] No overhead health bar is drawn over any other delver in a run; monsters' bars unchanged.
- [ ] Hub and field scenes unchanged; no level over any head.
- [ ] `vitest` green; lint fence passes.

## Blocked By

None

## Spec Reference

FS-CH21F §Requirements R13–R16; §User Stories 10–13; §Acceptance Criteria (client run/hub/field rows); §Edge States (teammate dead in a run). Supersedes FS-8AY7S R27 and the hover-only name.

## Files expected to touch (game-client/src)

- `scenes/BarrowspireScene.ts` (+ `scenes/BarrowspireScene.test.ts`): name visibility, bar switch, name placement
- `ui/resources.ts` (+ `ui/resources.test.ts`) only if `teammateHealthFill`'s use changes (its FS-8AY7S R27 tests may need a supersession note)

## TDD Approach

- RED: a pure selector/test that another delver's name is visible without hover when a marker base exists, and that no teammate bar is drawn.
- GREEN: drop the hover gate, place the name at the marker base, switch off the teammate bar.

## Charter run (2026-11-02)

Built by a /develop child (the first attempt was cut from origin/main and redone on
feat/party-formation), reviewed on two axes. Round 1 fixed: game-client CONTEXT.md "Resource bars"
still described teammates' overhead health bars (MED); `markTeammate` now reads the bar switch
too; a comment says why the unused hit area stays.

## Browser check (pending)

In the tower: every other player's name shows over their head without hovering, none over a
corpse; no health bar over other players; monsters' bars unchanged.
