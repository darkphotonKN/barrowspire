---
id: I-SRA9J-3
status: open
implements: FS-SRA9J
blocked_by: [I-SRA9J-1]
labels: [blocked]
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

- [ ] Shown on a fogged floor by default; M hides and shows it; M does nothing while typing in chat
- [ ] Placement test at 1080 and 1280: under the floor indicator, right-aligned, within 216 × 108, no overlap with the fullscreen button, escaped count, floor indicator, a 600 px top-centre notice or the target frame's box
- [ ] Content test: explored/visible regions, living member dots (self distinct), switch/door/stairs only once their region is explored; no monsters or containers
- [ ] Rebuilt on a floor change; absent on floors 2–3 and fields
- [ ] Typecheck and vitest pass

## Blocked By

I-SRA9J-1

## Spec Reference

FS-SRA9J §E.19–25.

## TDD Approach

- RED: a layout test at 1080 logical width against the top-right column and the notice band
- GREEN: the widget and its wiring
