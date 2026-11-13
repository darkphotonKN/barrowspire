---
id: I-T3DWX-2
status: open
implements: FS-T3DWX
blocked_by: [I-T3DWX-1]
labels: [blocked]
title: "FS-T3DWX slice 2: the owner's browser check of fullscreen in the OPTIONS panel, in Chrome and Safari (HITL)"
---
Implements FS-T3DWX §Acceptance Criteria (Owner's browser check)

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
- [ ] Does the empty corner where the button stood look right? If the HUD should move into it,
      that is a new charter (FS-T3DWX R2, Out of Scope).

## Blocked By

I-T3DWX-1

## Spec Reference

FS-T3DWX §Acceptance Criteria (the owner's browser check), §Edge States.
