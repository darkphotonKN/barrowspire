---
id: I-2325V-6
status: done
implements: FS-2325V
blocked_by: []
labels: [ready-for-agent]
title: "FS-2325V slice 6: menus show the baked cast (main menu, character creation, loadout)"
---
Implements FS-2325V §F

**Can run in parallel with I-2325V-7.** This slice owns `MainMenuScene`, `CharacterCreationScene`
and `LoadoutScene`. It needs no re-bake: it uses the committed class sheets.

## What to Build

- Replace every `preview_*` pixel sprite in the three menu scenes with the baked class sheet for
  that class, using the same class → sheet mapping as §E (`src/render/art/animationSelect.ts`).
- Present the character as a turntable: the idle clip slowly turning through the 8 facings. On
  selection, the class plays its attack once.
- Scale: 1x–1.5x, on a lit plinth with its baked shadow, linearly filtered.
- Restyle the menu panels and buttons to the guideline's UI chrome: carved stone and vellum, 1px
  brass borders, smooth fills, no pixel-grid frames. Keep the blackletter bound.
- Stop the menus calling the pixel generators (`ensureCharacterTextures`, the scene-local
  `drawKnight/drawWizard/drawArcher`). The in-run placeholder fallback may keep its own copy.

## Acceptance Criteria

- [ ] No menu scene renders a `preview_*` texture or calls a pixel character generator.
- [ ] Each class in each menu is its baked sheet, turning through 8 facings. The selected class
      plays its attack once.
- [ ] If the art is missing, a menu still works: it falls back to a neutral placeholder, never a
      crash.
- [ ] No flow, button, REST or WS change. `git diff main... -- game-server/` is empty.
- [ ] `npm run lint`, `npm run lint:fence`, `npm test` pass.

## Blocked By

None

## Spec Reference

FS-2325V §F.1–F.5.

## TDD Approach

- RED: a pure turntable-facing helper (time → Facing8 cycling at a fixed rate), and "class key →
  menu sheet" mapping tests.
- GREEN: the helper in `src/render/art/`, used by all three scenes.
