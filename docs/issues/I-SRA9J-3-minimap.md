---
id: I-SRA9J-3
status: done
implements: FS-SRA9J
blocked_by: []
labels: [ready-for-agent]
title: "FS-SRA9J slice 3: the top-right iso minimap with explored regions, party dots and found interactables, toggled with M (game-client)"
---
Implements FS-SRA9J §E (Requirements 19–25)

**Lane: agent (AFK), game-client.**

## What to Build

A minimap HUD widget on fogged floors: the floor's iso projection fitted to 216 × 108 logical px on a `palette.hudPanel` backing with the HUD rim, right-aligned at `TOP_RIGHT_HUD`'s x with its top 6 px under the floor indicator, re-anchored by `relayoutHud`. It draws explored and visible regions (visible brighter), a dot per living member (self distinct, ally channel), and the switch, escape door and stairs in the amber channel once their region is explored; nothing else. On by default per run scene; M toggles it, ignored while chat has focus. Rebuilt on a floor change; kept while spectating. None on floors 2–3 or fields.

## Files (expected)

- new `game-client/src/ui/minimap.ts` and its test
- `game-client/src/scenes/BarrowspireScene.ts` (`createUI`, `relayoutHud`, the M key, floor-change rebuild)

## Acceptance Criteria

- [x] Shown on a fogged floor by default; M hides and shows it; M does nothing while typing in chat
- [x] Placement test at 1080 and 1280: under the floor indicator, right-aligned, within 216 × 108, no overlap with the fullscreen button, escaped count, floor indicator, a 600 px top-centre notice or the target frame's box
- [x] Content test: explored/visible regions, living member dots (self distinct), switch/door/stairs only once their region is explored; no monsters or containers
- [x] Rebuilt on a floor change; absent on floors 2–3 and fields
- [x] Typecheck and vitest pass

## Evidence (2026-11-06, review fix round 1, branch floor1/fix-client)

- Default and M: scene "the minimap (FS-SRA9J §E, I-SRA9J-3)": shown by default, M hides and
  shows it (not in the menu, chat or on repeat), bound as an event, kept across a floor change.
- Placement: `minimap.test.ts` "minimapRect (§E.20, §E.21)" and the scene's placement case;
  `targetFrame.test.ts` "the frame's layout at 1080 and 1280" (clear of the minimap box, the
  column, the fullscreen button and a 600 px notice).
- Content: `minimap.test.ts` "minimapContent (§E.22)", "Minimap (§E.19–25)"; scene "should show
  explored and visible regions and the party's living dots, nothing for monsters or containers",
  "should mark the switch, escape door and stairs once a member has uncovered their regions".
- Floor change: "should rebuild it on a floor change, the new floor unexplored, and take the old
  one down"; none on floors 2–3 (it is built with the fog, only on a dungeon floor).
- Headless spot check: the minimap shows at render scale 1, 1.5 and 2 with the player's dot.
- Typecheck and vitest pass.

## Blocked By

I-SRA9J-1

## Spec Reference

FS-SRA9J §E.19–25.

## TDD Approach

- RED: a layout test at 1080 logical width against the top-right column and the notice band
- GREEN: the widget and its wiring
