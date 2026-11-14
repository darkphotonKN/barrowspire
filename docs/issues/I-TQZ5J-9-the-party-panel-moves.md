---
id: I-TQZ5J-9
status: done
implements: FS-TQZ5J
blocked_by: []
labels: [ready-for-agent]
title: "FS-TQZ5J phase 2, slice 1: the party panel, its invite field, T, its × and buttons move into the UI scene"
---
Implements FS-TQZ5J §Change: Phase 2: the party (R36–R44, R46 for the panel)

**Lane: AFK (agent).** game-client only. No look change but R46's named depths.

## What to Build

- The UI scene builds the party panel (`mountPartyPanel` on itself) for each world reported and takes
  it down as the world leaves (R36); no world mounts it, binds T or tests `partyPanel.covers`.
- The interface carries the world's part of the panel's refusal (`blockers().party`, R38); the panel
  is refused by it or the UI's menu.
- `WorldWindows`, `toggle` and `close` lose `party` (R39): the corner's Party icon, Esc's party step,
  the menu opening and the Menu icon after the run's end act on the UI scene's panel; the interface
  sounds read its open state from the UI scene. The town shuts the panel in the store as its letter
  panel opens; the panel opening asks `close: letter`.
- The open panel stands an interactive ground under its buttons (R40); the bridge says `overUi` while
  the world hears a move over a UI piece, and the gear overlay's `under` and the map pointers yield to
  it (R41).
- The invite field keeps its focus for a press on the panel and lets it go for any other (R42).

## Acceptance Criteria

- [x] Phase 2's criteria for the panel: no world mounts it or tests its rect; T and the Party icon
      under `blockers().party` and the menu; Esc's order; the menu and the letter panel close it.
- [x] A press, wheel or move on the open panel reaches no world handler; the gear overlay's slots
      under it neither light nor tip.
- [x] A press on the panel keeps the invite field; a press elsewhere lets it go.
- [x] Every test of the panel that read a world scene still passes, moved with the code.
- [x] Before/after screenshots against ecb92ba9: the panel with no party, as leader, as member, greyed
      in a run, in each world, at 1, 1.5 and 2, windowed and fullscreen; pixel-equal but R46's cases.
- [x] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

None (phase 1 is on the branch).

## Spec Reference

FS-TQZ5J §Change: Phase 2: the party (R36–R44, R46); A1 R25–R27; R17, R21, R22.

## TDD Approach

- RED: over a fake bridge, the UI scene's party slot builds a panel per world and takes it down on a
  leave; the corner's Party press toggles it, refused by `blockers().party` or the menu; Esc closes
  it before the gear; the menu opening closes it; `overUi` is true only inside a move over a UI piece.
- GREEN: `uiSceneParty.ts`, the bridge's additions, the worlds' reports and the UI scene's mount.
