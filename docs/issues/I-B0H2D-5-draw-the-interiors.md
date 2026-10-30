---
id: I-B0H2D-5
status: done
implements: FS-B0H2D
blocked_by: [I-B0H2D-2, I-B0H2D-3]
labels: [ready-for-agent]
title: "FS-B0H2D slice 5: game-client draws furnished interiors under a lifting roof"
---
Implements FS-B0H2D §C Requirement 15, §E Requirements 19–23, 25–26

**Author: agent** (charter: agent lane)

## What to Build

Walking into a town building lifts its roof (already wired: `hideRoofOverhead`) onto a furnished
room: furnishings drawn as props instead of wall pieces, indoor dressing in place, the hearth and
forge lit, the people inside facing their work. With the roof on, the interior is hidden.

- Pure helper (new module, e.g. `src/render/world/hubInteriors.ts` + test): `isFurnishing(wall,
  house)` (touches none of the house's four edges), `HUB_FURNISHINGS` (kind + rect, from
  I-B0H2D-2's commit), the indoor dressing spots (R15), and the fixed residents' facing by name
  (R25). A vitest checks R15: every indoor spot inside its house's inner area, off every
  furnishing, off the door threshold strip.
- `HubScene.renderStructures`: split furnishing walls out before `addWalls`; draw each as its
  sheet (`counter`, `table`, `forge`), or a low placeholder block when the sheet or mirror entry
  is missing (never invisible). Draw indoor dressing (`stool`, `inn_hearth`, `shelf`, `anvil`,
  `crate`, `barrel`; skip a missing sheet).
- Interior visibility (R20): while a house's roof is on, hide its furnishings, indoor dressing,
  and the bodies and name plates of NPCs and other players whose world position is inside it.
  The Quartermaster's marker (plate + sigil) stays visible (R21); his body hides.
- Fixed residents keep the ambient plate, no sigil (already true for function `""`; verify).
- Lights (R22): `inn_hearth` and `forge` light sources through the light-map's under-roof gate.
- Patrons drawn standing at their stool, facing their table (R26).

Expected files (hotspot `src/scenes/HubScene.ts` is owned by this slice until it lands;
I-B0H2D-6 edits it next, never in parallel):
- `game-client/src/scenes/HubScene.ts`
- `game-client/src/scenes/HubScene.test.ts`
- `game-client/src/render/world/hubInteriors.ts` (new) + `hubInteriors.test.ts` (new)
- `game-client/src/render/world/index.ts` only if the barrel must export the new module

Not touched: `hubKeepOut.ts` / its test (I-B0H2D-3's), the server, the bake.

## Acceptance Criteria

- [x] `isFurnishing` unit-tested: building walls (incl. both south segments) false, furnishings true.
- [x] Furnishings never drawn as wall pieces; placeholder block when art or mirror entry is missing.
- [x] Indoor dressing vitest (R15) green.
- [x] Roof on: interior hidden (furnishings, dressing, bodies and plates inside); Quartermaster's
      marker visible. Roof lifted: all shown. Scene test covers both.
- [x] Hearth and forge lights only while their roof is lifted.
- [x] Fixed residents: ambient plate, no sigil, facing per R25.
- [x] vitest, lint, token fence green (canvas colours from `BARROW_HEX` only).
- [x] Client-only check in the Browser pane if a stack is running (no backend started by the
      agent); otherwise note it.

## Blocked By

- I-B0H2D-2 (furnishing and resident coordinates)
- I-B0H2D-3 (lands the new building fixture first; keeps the two client slices from racing on
  shared assumptions)

Works without I-B0H2D-4 (placeholders); picks up the baked sheets whenever they land.

## Spec Reference

FS-B0H2D §C R15, §E R19–R23 (interior part), R25–R26; user stories 6, 7, 9, 14, 15, 17.

## TDD Approach

- RED: `isFurnishing` against a fixture of the three buildings plus the Inn's counter.
- GREEN: the helper, then the scene split; then the roof-on visibility scene test, red first.
