---
id: I-X2CMM-10
status: done
implements: FS-X2CMM
blocked_by: ["I-X2CMM-1", "I-X2CMM-9"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 10: the class book opens on K and its corner icon in a run, showing the offered pages and their states"
---
Implements FS-X2CMM §G

**Author: agent**

## What to Build

- **Types.** `current_player.book` (and the named states) in `src/types/gameState.ts`, mirroring the
  server (slice 1).
- **The window (R36–R39).** A UI-scene piece (pattern: `UiTreeSlot` / `src/ui/uiSceneTree.ts`,
  add the module to `UI_SCENE_PIECES` in `.eslintrc.js`), opened and closed by `K` and a new corner
  icon at the left end of the row (`hudCornerLayout.ts`, `HudCorner.ts`, `uiSceneCorner.ts`; the
  XP bar's clearance follows `cornerRowLeft`). The icon is a bronze knockout of a clasped book with
  a ribbon, distinct from `knockoutBook.ts`'s controls badge; greyed and `K` inert outside a run
  (fix `greyed` drawing the envelope). Wears the windows' frame and ×, steps aside for other
  windows, Esc closes it (`escapeOrder.ts`). Add `book` to `UiState`. The game never pauses.
- **The panel.** Titled by class (Spellbook, Hunter's Journal, The Ledger, Scars) on vellum, a
  grid of `pageRoundel`s for the offered pages in book order (client data in a new
  `src/data/classBooks.ts`: names, one line, the Scars' earned-where line, target kinds, reticle
  sizes). States from the wire: locked "Lv N", recovering (sweep via `abilityCooldown.ts`), spent,
  dim when the resource is under `cost`, ready. Hover tip: name, line, cost, cooldown. An empty
  Ledger reads "The Ledger is not yet written." Left-clicks over it never attack.
- Add the controls panel line "K — Class book".

## Acceptance Criteria

- [ ] `K` and the icon open and close the book in a run; inert and greyed in the hub and fields.
- [ ] The book shows the offered pages with the right states and tip; an unoffered page is not drawn.
- [ ] Esc closes it; another window opening steps it aside.
- [ ] Client suites green.

## Blocked By

I-X2CMM-1, I-X2CMM-9

## Spec Reference

FS-X2CMM §G R36–R39

## TDD Approach

- RED: `UiBookSlot` opens on K in a run and not in the hub.
- GREEN: slot, panel, corner icon.
