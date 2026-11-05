---
id: I-ZAJMH-4
status: in-progress
implements: FS-ZAJMH
blocked_by: [I-ZAJMH-3]
labels: [ready-for-agent]
title: "FS-ZAJMH slice 4: fullscreen / windowed toggle on the game frame (game-client)"
---
Implements FS-ZAJMH §Requirements 10 (fullscreen), 18, 19, 20, 21, 22, 23

**Lane: agent (AFK), with a browser check at the end (Nick).** No server change.

## What to Build

- A button in the game frame's top-right corner (React/DOM, Bone & Soot UI palette per ADR-0025):
  in windowed it enters fullscreen; in fullscreen it reads as 縮小 / exit fullscreen and returns to
  windowed. Faded until hover/focus; accessible name per state; keyboard-focusable (R18).
- Fullscreen targets the whole game frame (canvas + Phaser DOM container), not the canvas (R19).
- State follows `document.fullscreenElement` via `fullscreenchange`; leaving by the button, Esc or
  the browser UI returns to windowed and re-fits (R10, R20). Esc is the browser's (R21).
- No keyboard shortcut; a click on the button never reaches the game as an in-game action (R22).
- Not rendered where the Fullscreen API is unavailable; a refused request leaves it windowed (R23).

Expected files: `src/app/game/page.tsx` and/or `src/components/PhaserGame.tsx` (the frame), a new
button component under `src/components/`, `src/app/globals.css`, the viewport module (fullscreen re-fit).

## Acceptance Criteria

- [ ] Button enters fullscreen on the game frame; only the game is on screen; in fullscreen it returns to windowed.
- [x] Esc, the browser UI and the button each leave fullscreen; the button's state follows.
- [x] The canvas re-fits on enter and leave.
- [ ] DOM chat input and IME work in fullscreen.
- [x] Clicking the button triggers no in-game action; no shortcut bound.
- [x] Unsupported API → no button; refused request → stays windowed, no error.
- [x] UI palette, faded until hover/focus, accessible names per state.
- [x] Button does not cover a top-right HUD widget at logical widths 1080 and 1280 (else escalate).
- [ ] Browser check (Nick): Chrome + Safari on the Mac, fullscreen enter/exit, chat typing in Chinese.
- [x] Tests pass.

## Blocked By

I-ZAJMH-3

## Spec Reference

FS-ZAJMH §C R10 (fullscreen), §E R18–R23; user stories 20–25.

## TDD Approach

- RED: the button renders nothing when `document.fullscreenEnabled` is false; its label flips on a `fullscreenchange` event.
- GREEN: the component; then the frame target and the re-fit hook.
