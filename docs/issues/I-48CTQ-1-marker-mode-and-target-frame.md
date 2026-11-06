---
id: I-48CTQ-1
status: done
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

- [x] Table: run floor 1 → `frame`, all else `overhead`; adding a floor to the table turns the frame on there
- [x] Floor 1: no overhead monster plates or bars; elite tint stays; party plates unchanged
- [x] Hover shows the monster; an elite prefix is in the hostile accent
- [x] Last-hit: shown on the intent (an `attack`, or a cast sent over the hovered monster, review S1); a health drop within 1 s of an intent restarts 3 s; a teammate's hit does not; hides 3 s after the last own hit
- [x] Never names a dead, hidden, departed monster or a party member
- [x] Fades 120/200 ms; no fade on a content switch; hidden under the spectate HUD and the veil
- [x] Layout at 1080 and 1280: top y 10, centred, ≤ 280 × 52, clear of the notice band, top-right column, fullscreen button and minimap box
- [x] Floors 2–3 unchanged (FS-KE075 captures still match); typecheck and vitest pass

## Evidence (2026-11-06, fix round 1 on floor1/fix-48CTQ)

- **Table:** `render/creatures/markerMode.test.ts` (9): run floor 1 → `frame`; run floors 2, 3, no
  floor, fields → `overhead`; a floor added to the table turns the frame on.
- **No plates on floor 1, tint kept, party plates unchanged:** `monsters.test.ts` "the frame marker
  mode (FS-48CTQ §B.3)"; `BarrowspireScene.test.ts` "should draw no overhead plate over floor 1's
  monsters, and plates as today on floor 2".
- **Hover, elite prefix:** `targetFrame.test.ts` "should letter an elite's prefix apart in the
  hostile accent"; scene "should name the hovered monster at the top centre, and let go when the
  pointer leaves".
- **Last-hit:** `targetPick.test.ts` `LastHitTracker` (hold, 1 s window, teammate's hit, two
  intents) and, for review S1, "a ranged cast at a hovered monster holds the frame": an archer's and
  a mage's primary at a hovered monster 250 px away (beyond the 60 px strike), hit 600 ms later,
  holds it until 3 s after the hit with the pointer gone; a cast with nothing hovered holds nothing.
  `playerCombat.test.ts` "PlayerCombat castSent": told once per primary of every class, per dash
  and triple fireball, per fired Shadow Shot; never on the archer's press, a too-short hold, the
  parry, a refused cast or a strike. Scene: "should name the monster the player strikes, then let
  go 3 s after the last own hit", "should not hold on a teammate's hit".
- **Never dead, hidden, departed or a party member:** `targetPick.test.ts` `pickTarget` §C.7 cases,
  `castTarget` cases; `monsters.test.ts` "what the target frame may name"; scene fog test "should
  name no hidden monster in the target frame, not even an engaged boss, and name a shown one".
- **Fades, covers:** `targetFrame.test.ts` "fadeStep" and "TargetFrame fades and covers"; scene
  cases for the spectate HUD and the floor-change veil.
- **Layout:** `targetFrame.test.ts` "the frame's layout at 1080 and 1280"; the HP fill rounds to
  whole backing px at render scale 1, 1.5 and 2 (review T1).
- **Floors 2–3 against the FS-KE075 captures:** `docs/fixtures/KE075-floors/floorcap.cjs`
  `MODE=new` against a `next dev -p 4087` of this branch (26387087) and the local stack, then
  `cmp.cjs` against `floor{2,3}-base`, three runs:

  | run | floor 2 stable base/new, only base/only new | floor 3 stable base/new, only base/only new | pixels off by > 24/255 (2 / 3) |
  | --- | --- | --- | --- |
  | 1 | 552/552, 0/0 | 650/647, 3/0 | 0.000% / 0.000% |
  | 2 | 552/552, 2/2 | 650/649, 3/2 | 0.000% / 0.000% |
  | 3 | 552/550, 2/0 | 650/649, 1/0 | 0.000% / 0.000% |

  The only lines that differ are timing, and they differ from run to run: the player knight's idle
  frame (`idle/1/0` against `idle/1/1`, its sprite and shadow image) and one light halo's flicker
  (`v` true against false). No plate, bar, frame or minimap line differs; floor 2 in run 1 is
  identical. Small per-channel differences (2–24% of pixels, all ≤ 24/255) are the torch flicker.
  Dev server stopped and captures deleted afterwards.
- **Gates:** `npx tsc --noEmit` clean; full vitest 240 files, 5841 tests pass; `next lint` on the
  changed files clean; `lint-fence.sh` clean.

## Blocked By

None

## Spec Reference

FS-48CTQ §A.1–2, §B.3, §C.4–8, §E.14–17.

## TDD Approach

- RED: selection tests: hover beats last-hit; last-hit expires 3 s after the last own hit; a teammate's hit does not restart it
- GREEN: the table, the model, the widget and the monster view's mode
