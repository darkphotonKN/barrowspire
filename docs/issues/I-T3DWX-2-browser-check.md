---
id: I-T3DWX-2
status: done
implements: FS-T3DWX
blocked_by: [I-T3DWX-1, I-T3DWX-3]
labels: [blocked]
title: "FS-T3DWX slice 2: the owner's browser check of fullscreen in the OPTIONS panel, in Chrome and Safari (HITL)"
---
Implements FS-T3DWX §Acceptance Criteria (Owner's browser check), §Change: The top-right HUD fills the button's spot (Owner's browser check)

**Lane: HITL (Nick).** Restart the client only. No server change.

## Files it expects to touch

- This issue file (ticks, status). On a pass, `spec-update` flips FS-T3DWX to shipped. No thin
  line changes. No code.

## What to Check

In Chrome, then again in Safari:

- [ ] On /game, nothing stands in the canvas's top-right corner beside or above the minimap where
      the fullscreen button was. Every other HUD element is where it was.
- [ ] Esc → Options: the panel shows Music, Sound effects and **Fullscreen** (Off). A click on the
      row goes fullscreen and the row says On. The panel stays open, centred.
- [ ] **Chrome:** in fullscreen, a single Esc does the game's Esc (here: Back to the ESC menu) and
      stays fullscreen. A held Esc leaves, and on reopening Options the row says Off.
- [ ] **Safari:** in fullscreen, the first Esc leaves fullscreen, and the row says Off.
- [ ] With the panel open in fullscreen, leaving through the browser's own UI turns the row to
      Off in place.
- [ ] Clicking On again from the row leaves fullscreen.
- [ ] ←/→ still move only Music.
- [ ] The same in a field and in the run.
- [ ] The corner (§ Change: The top-right HUD fills the button's spot), in the town, a field and
      the run, windowed and fullscreen, stepping M through every mode:
      - normal map: map in the corner, nothing beside it, the icon, name and readout inside it;
      - enlarged map: the name (and in the run the readout) 6 px left of the map, on its top line;
      - overlay: the map mode icon in the very corner, the name to its left, and in the run the
        escaped count under them (y 31) with nothing overlapping;
      - no map (a run floor before its map is in): the floor line and escaped count from the top.

## Blocked By

I-T3DWX-1, I-T3DWX-3

## Spec Reference

FS-T3DWX §Acceptance Criteria (the owner's browser check), §Edge States; §Change: The top-right HUD fills the button's spot, Acceptance Criteria (the owner's browser check).

## Owner sign-off

2026-11-14: the owner tried the Fullscreen row in the OPTIONS panel and the corner fill (option A) in game: 「全螢幕沒問題」.
