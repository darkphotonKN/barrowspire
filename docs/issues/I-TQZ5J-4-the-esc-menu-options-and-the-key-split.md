---
id: I-TQZ5J-4
status: open
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-1, I-TQZ5J-3]
labels: [blocked]
title: "FS-TQZ5J slice 4: the ESC menu, OPTIONS and the Fall confirm move into the UI scene, with the key split"
---
Implements FS-TQZ5J §Requirements D (R16–R21), R10, R11, §Requirements F (R23, R24)

**Lane: AFK (agent).** game-client only. No behaviour or look change.

## What to Build

- The UI scene's one menu slot: the ESC menu (the town's, the field's, the run's rows by today's
  rules), OPTIONS and the run's Fall confirm, from the world report's menu facts and player state
  (R16); the menu yields (R20).
- The UI's state `menuOpen` (R10): every world guard that read `this.menu` reads it; as it turns
  true the world closes its windows, stops a stride, ends an aim. The worlds lose their `menu`,
  `menuChoices` and `moveMenu` fields.
- Requests (R11): `close` (letter, party, gear, dialogue), `leaveQueue`, `changeCharacter`,
  `leaveRun`, `fall`, `musicLevel`; slice 3's temporary `toggleMenu` request and its "world menu
open" stopgap on the row go (the menu's own blocker, in the same scene, covers the row again).
- The key split (R17, R18, R21): Esc is the UI scene's, its step `escapeStep` extended with the
  dialogue on top; no world binds Esc (`keydown-ESC` or `addKey(ESC)`), the town's dialogue
  dismissed by `close: dialogue`; Enter, 1–3 and ←/→ the UI's only while the slot is filled, and
  the worlds' handlers for them guarded by `menuOpen`; no `stopPropagation` on any key. The corner
  hotkeys I, B, C, T and M stay where they are (they move with their windows, later phases).
- OPTIONS's rows (R19): Music stored plus `musicLevel` applied live by the town; Fullscreen from
  `lentFullscreen(registry)`.

## Acceptance Criteria

- [ ] Every acceptance criterion of FS-G4VMQ, FS-9K8EZ, FS-28DDG § Change (OPTIONS) and FS-T3DWX
      still holds; their tests pass, moved with the code where they tested a world scene.
- [ ] FS-TQZ5J's key criteria: Esc's step in every world; 1 and Enter never both; a held key's
      release reaches the world; no world binds Esc; no key settled by `stopPropagation`; all of it
      in the first world after a page load and again after a world switch (§ Spike findings (b)).
- [ ] The town's Music row changes the playing music at once.
- [ ] Before/after screenshots (R23): the menu in each world (town queued and not, field, run alive
      and resolved), OPTIONS (each row hovered, Fullscreen on and off), the Fall confirm with Fall now
      pending; at render scale 1, 1.5 and 2, windowed and fullscreen. Pixel-equal, or each
      difference named for I-TQZ5J-5.
- [ ] The depth check (R24) for the menu (2000): notifications (2000), the gear overlay's tips and
      flash, the letter panel, the settlement record and the resolved card, each shown not to stand
      over the open menu today or screenshotted and named.
- [ ] No world scene constructs `showMenuPanel` or `openOptionsPanel`.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-TQZ5J-1, I-TQZ5J-3 (serialized after the corner row, so the Menu icon and the menu meet in one
scene). **Do not start until `feat/client-tower-music` and `feat/client-enlarged-map-labels-inside`
are both merged to main.**

## Spec Reference

FS-TQZ5J §Requirements B (R10, R11), D (R16–R21), F (R23, R24); §User Stories 4–8, 10, 12, 13;
§Edge States; § Spike findings (b).

## Screenshots

As I-TQZ5J-3.

## TDD Approach

- RED: over a fake bridge, Esc with a dialogue reported sends `close: dialogue`; with the letter
  open sends `close: letter`; with nothing open opens the town's menu with Leave the queue while
  `queued`; 1 in the run with the menu shut reaches the potion handler and with it open picks row 1
  and the potion handler (guarded by `menuOpen`) does nothing; a `resolved` flip closes the run's
  menu silently.
- GREEN: the menu slot in the UI scene, the requests answered by the worlds, the worlds' Esc and
  `menu` field removed.
