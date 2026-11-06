---
id: I-48CTQ-1
status: open
implements: FS-48CTQ
blocked_by: []
labels: [ready-for-agent]
title: "FS-48CTQ slice 1: a per-floor marker mode; on floor 1 no overhead monster plates, and a top-centre target frame for the hovered or last-hit monster (game-client)"
---
Implements FS-48CTQ §A (Requirements 1–2), §B (Requirement 3), §C (Requirements 4–8), §E (Requirements 14–17)

**Lane: agent (AFK), game-client.**

## What to Build

One client table of marker modes by world and floor (`frame` for run floor 1 only; `overhead` everywhere else). On a `frame` floor the monster view draws no overhead name, level or bar (normal, elite, boss), keeping the elite tint; party members' plates untouched. A pure selection model picks the frame's monster: hovered (living, shown, by the strike-cursor hit test) over last-hit (the monster named by the local player's latest `attack` intent, held 3 s after its last own hit, a hit being a health drop within 1 s of an intent naming it); dead, hidden (sprite not visible), departed monsters and party members never qualify. The frame widget at the top centre (top y 10, ≤ 280 × 52) shows `nameplate`, the elite prefix in the hostile accent and the bar in `MARKER_BAR` colours, fades in 120 ms / out 200 ms, re-anchors on resize, and hides while the spectate HUD or the floor-change veil is up. Leaves a slot in the selection for the engaged boss (slice 2).

## Files (expected)

- new `game-client/src/render/creatures/markerMode.ts` (the table) and its test
- new `game-client/src/ui/targetFrame.ts` (widget) and its test
- new `game-client/src/render/creatures/targetPick.ts` (pure selection, last-hit timing) and its test
- `game-client/src/render/creatures/monsters.ts` (no overhead plates in `frame` mode; expose shown/hovered state)
- `game-client/src/scenes/BarrowspireScene.ts` (attack-intent hook, hover, `createUI`, `relayoutHud`, spectate and veil hiding)

## Acceptance Criteria

- [ ] Table: run floor 1 → `frame`, all else `overhead`; adding a floor to the table turns the frame on there
- [ ] Floor 1: no overhead monster plates or bars; elite tint stays; party plates unchanged
- [ ] Hover shows the monster; an elite prefix is in the hostile accent
- [ ] Last-hit: shown on the intent; a health drop within 1 s of an intent restarts 3 s; a teammate's hit does not; hides 3 s after the last own hit
- [ ] Never names a dead, hidden, departed monster or a party member
- [ ] Fades 120/200 ms; no fade on a content switch; hidden under the spectate HUD and the veil
- [ ] Layout at 1080 and 1280: top y 10, centred, ≤ 280 × 52, clear of the notice band, top-right column, fullscreen button and minimap box
- [ ] Floors 2–3 unchanged (FS-KE075 captures still match); typecheck and vitest pass

## Blocked By

None

## Spec Reference

FS-48CTQ §A.1–2, §B.3, §C.4–8, §E.14–17.

## TDD Approach

- RED: selection tests: hover beats last-hit; last-hit expires 3 s after the last own hit; a teammate's hit does not restart it
- GREEN: the table, the model, the widget and the monster view's mode
