---
id: I-ZAJMH-5
status: open
implements: FS-ZAJMH
blocked_by: [I-ZAJMH-4]
labels: [ready-for-agent]
title: "FS-ZAJMH slice 5: Esc is the game's in fullscreen where Keyboard Lock exists (game-client)"
---
Implements FS-ZAJMH §Requirements 20, 21 (as amended 2026-11-06, A16)

**Lane: agent (AFK), with a browser check at the end (Nick, real Chrome).** No server change.

## What to Build

- On entering fullscreen through the fullscreen button, lock `Escape` with
  `navigator.keyboard.lock(['Escape'])` where the API exists (feature-detect
  `'keyboard' in navigator && 'lock' in navigator.keyboard`).
- On leaving fullscreen by any route (the button, held Esc, the browser's UI), seen through
  `fullscreenchange` or `webkitfullscreenchange`, call `navigator.keyboard.unlock()`.
- A missing API or a rejected lock leaves today's behaviour (the first Esc exits) and shows or logs
  nothing alarming. The hold-Esc exit is the browser's; it is not reimplemented. The button's state
  keeps following the document's fullscreen state.
- Nothing in the button's `keepFromGame` or elsewhere swallows Esc on its way to the scene, so the
  hub's and the run's Esc menu open, an open panel closes first, and the chat input's Esc still
  cancels the line.

Expected files: `src/components/fullscreen.ts` (+ test), `src/components/FullscreenButton.tsx`.

## Acceptance Criteria

- [ ] Entering fullscreen through the button asks for an `Escape` lock when the API exists.
- [ ] Leaving fullscreen by any route (standard or webkit change event) releases the lock.
- [ ] No lock is asked where the API is missing; fullscreen works as before.
- [ ] A rejected lock is tolerated: fullscreen stays on, nothing thrown, nothing shown.
- [ ] A refused fullscreen asks no lock (or releases it).
- [ ] Esc passes `keepFromGame` untouched; the chat input's Esc handling is unchanged.
- [ ] Headless Chrome: `navigator.keyboard.lock` exists and resolves in fullscreen (what headless can show).
- [ ] Browser check (Nick, real Chrome): in fullscreen a single Esc opens the hub's and the run's
      Esc menu and does not leave fullscreen; holding Esc ~2 s leaves it and the button follows;
      Safari still leaves on the first Esc.
- [ ] `npx tsc --noEmit`, `npx vitest run`, `npm run lint`, `npm run lint:fence` green.

## Blocked By

I-ZAJMH-4 (the fullscreen toggle this slice extends; code on main, browser check pending).

## Spec Reference

FS-ZAJMH §E R20, R21 and amendment A16; User Story 22; Edge States "Held Esc in Chrome
fullscreen", "Keyboard lock missing or refused", "Fullscreen not entered by the button".

## TDD Approach

- RED: with a fake `navigator.keyboard` and a fake document, `toggle` into fullscreen calls
  `lock(['Escape'])`; a `fullscreenchange` (and `webkitfullscreenchange`) out calls `unlock()`;
  no keyboard means no call; a rejected lock still leaves fullscreen active and does not throw.
- GREEN: inject the keyboard into `fullscreenOf`; the button passes `navigator.keyboard`.
