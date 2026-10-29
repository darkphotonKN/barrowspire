---
id: I-8AY7S-4
status: done
implements: FS-8AY7S
blocked_by: []
labels: [ready-for-agent]
title: "FS-8AY7S slice 4: Health and class resource bars at the bottom left, no bar over one's own head"
---
Implements FS-8AY7S §Requirements 20–26, §WebSocket message surface

**Author: agent**

## What to Build

game-client only. Built against the wire shape pinned in the FS (§WebSocket message surface);
tests use fixture states, so this does not wait on the server slices. Read
`game-client/docs/design-guideline.md` first.

- `PlayerState` (`src/types/gameState.ts`): add `resource?: {kind, current, max, ability_cost}`
  (kind `"mana" | "stamina" | "parry_charges"`); remove `current_mana` / `max_mana`.
- A pure module (e.g. `src/ui/resources.ts`) with what the scene draws: the label for a kind
  ("Mana:", "Stamina:", "Parry:"; unknown kind → no label), the fill ratio clamped 0..1, the pip
  states for `parry_charges` (3 pips, lit per charge), and whether the HUD shows at all (a run,
  and the delver not `resolved()` per `src/ui/party.ts`).
- A bottom-left HUD in `BarrowspireScene` (its own `src/ui/` class beside `ProgressHud` is
  fine): "Health:" bar, the class resource bar under it, EB Garamond labels, game palette from
  `BARROW_HEX`, brass frame, vellum labels, health in its oxblood channel, mana and stamina
  distinct from health and each other. Layout, sizes and colours are the implementer's call
  under the guideline; move `ProgressHud` (`PROGRESS_HUD_X/Y`) or nudge the party panel if they
  collide.
- Remove the own delver's overhead HP/MP bar (`playerHpMpGraphics`, both draw sites, and the
  class-based `?? 150 : 100` fallbacks). Keep the own hit flash (`prevLocalPlayerHp`).
- Hidden while the delver is out of the delve (dead, escaped, left behind), including while
  spectating; never in the hub (the hub scene draws none of it).
- Missing `resource` (older server): health bar only, no crash.

## Acceptance Criteria

- [ ] Fixture mage state: "Health:" and "Mana:" bars at the bottom left, filled by current / max.
- [ ] Fixture warrior and archer states: "Stamina:".
- [ ] Fixture `parry_charges` state: 3 pips labelled "Parry:", correct for 0, 1, 2 and 3.
- [ ] Unknown kind: a bar with no label; missing `resource`: health bar only.
- [ ] No overhead bar over the own delver in a run.
- [ ] The bars hide on death, escape and left-behind, stay hidden while spectating.
- [ ] HubScene draws no bars.
- [ ] No overlap with `ProgressHud`, the party panel or the spectate HUD.
- [ ] Unit tests for the pure module (label, ratio clamping, pips, visibility).
- [ ] `npm test`, `npm run lint` and `npm run lint:fence` green (tokens only, no raw hex).

## Blocked By

None. (The live check in a run needs I-8AY7S-3 on the server; acceptance is fixture-driven.)

## Spec Reference

FS-8AY7S §Requirements 20–26; §WebSocket message surface; §User Stories 7–9, 14–16, 22; §Edge
States "Death", "Escape / left behind", "Spectating", "Reconnect", "Missing `resource`",
"Unknown `resource.kind`".

## TDD Approach

- RED: `src/ui/resources.test.ts`: label per kind, ratio clamp (current > max, max 0), pips for
  0..3, visibility for run / hub / resolved.
- GREEN: the module, then the scene draws it.

## Files expected to touch

`game-client/src/types/gameState.ts`, `src/ui/resources.ts` (new) + `resources.test.ts` (new),
`src/ui/ResourceHud.ts` (new, if the HUD gets its own class), `src/scenes/BarrowspireScene.ts`,
`src/ui/ProgressHud.ts` (only if it moves), `src/ui/party.ts` (only if the party panel moves),
`src/utils/theme.ts` (only if a stamina token is needed), `src/scenes/BarrowspireScene.test.ts`
(if it asserts the removed overhead bar).
