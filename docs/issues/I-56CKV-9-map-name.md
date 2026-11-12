---
id: I-56CKV-9
status: in-progress
implements: FS-56CKV
blocked_by: []
labels: [ready-for-agent]
title: "FS-56CKV change: the current place's name on the minimap (inside its top-right, beside the fullscreen button enlarged, beside the map mode icon in the overlay), the dev readout under the column (game-client)"
---
Implements FS-56CKV §Change: Map name

## What to Build

Owner, 2026-11-12: "小地圖右上角顯示目前地圖的名字", then "兩倍地圖時不顯示", replaced by
"兩倍地圖時地圖名稱顯示在全螢幕icon的左邊". In a run, the town and a field, the place's name (the
arrival card's title, one table) as small vellum letter-spaced text on a faint dark plate: inside
the minimap's top-right in normal mode; left of the fullscreen button with the map enlarged; left
of the map mode icon in the overlay. It gives way to a shown target frame or the town's queue line
where they would meet. The dev readout moves under the column's last line in every mode.

## Files it expects to touch

- `game-client/src/ui/minimapName.ts` + test (new): the words, the look, the place per mode, give way.
- `game-client/src/ui/topRightColumn.ts` + test: the name's place with the corner.
- `game-client/src/ui/positionReadout.ts` + test: under the column always.
- `game-client/src/ui/targetFrame.ts` + test: the shown frame's box.
- `game-client/src/ui/worldMinimapController.ts` + test: the town's and field's name.
- `game-client/src/scenes/BarrowspireScene.ts`, `HubScene.ts`, `FieldScene.ts` + tests.
- `game-client/docs/design-guideline.md`, `game-client/CONTEXT.md`.

## Acceptance Criteria

- [x] FS-56CKV §Change: Map name, every Acceptance Criterion but the browser check.
- [x] Typecheck, lint and the full vitest suite pass.
- [ ] **Owner browser check (Nick):** a run's floor 1 and a climb, the town and a field, at 1080
      and 1280 wide, each mode: the name's words, its place (inside the map's top-right normal;
      left of the fullscreen button enlarged; left of the map mode icon in the overlay) and look;
      the dev readout under the column; with the map enlarged at 1080, a hovered monster or a boss
      hiding the name while its frame is up. And: did "兩倍地圖時" mean the overlay too?
      *(Answered 2026-11-12: "目前這樣", the overlay keeps it. Re-check after the amendment
      below: no "Floor N" under the map in any mode on floor 1, the line back on a floor of
      buildings; the readout inside the normal map's bottom-right, left of the name with the map
      enlarged (hidden with it under a frame at 1080), under the column in the overlay.)*

## Blocked By

None

## Spec Reference

FS-56CKV §Change: Map name, E1–E11 (E8, E9 amended and E11 added 2026-11-12).

## TDD Approach

- RED: the words per world from `placeCard`; the plate's place per mode at 1080 and 1280, clear
  of the map mode icon and the button; the look and its contrast; give way to a frame; the
  readout under the column in every mode; each scene builds the name with its minimap.
- GREEN: `minimapName.ts`, the corner's place, the scenes' wiring, the readout's place.

## Status

Code in, 2026-11-12; awaiting the owner's browser check (the one open box). `ui/minimapName.ts`
(new: `MINIMAP_NAME`, `minimapPlaceName` = `placeCard(place).title`, `minimapNamePlace`,
`minimapNameBox`, `MinimapName` with `giveWay`), `ui/topRightColumn.ts` (the corner hands the name's
place), `ui/positionReadout.ts` (under the column always; takes no minimap), `ui/targetFrame.ts`
(`shownRect`), `ui/worldMinimapController.ts` (`name`, `mapName`, `giveWay`),
`scenes/BarrowspireScene.ts` (the floor's name with its minimap; gives way to the target frame),
`scenes/HubScene.ts` (gives way to the queue line and its Leave button), `scenes/FieldScene.ts`.
Layout at 1080: normal, the plate's top-right at (1066, 14); enlarged, its right edge 714, middle
y 20; overlay, right edge 1033, middle y 16; at 1280 each x 200 more. Readout: 4 px under the
escaped count (y 174 normal, 228 enlarged, 94 overlay/no map at 1080). Seen red first: 37 failing
and the new module missing at the test commit. Suite 7486 passed; tsc and lint clean.

Amended 2026-11-12 (owner, after a first look: "目前這樣", "地城樓層顯示兩次 拿掉下面的",
"有小地圖時 x y座標不是要顯示在地圖框框內右下角嗎", "2倍地圖時座標顯示在地區名稱左邊"): the floor line
is hidden while the map name names the floor (`floor.ts` `showsFloorLine`, the scene's
`placeTopRightColumn`), the escaped count in its place (y 124 normal, 178 enlarged, 44 overlay, at
1080 and 1280); it still shows at y 44 on a floor without regions and before a dungeon floor's
map is in. The readout wears the name's plate (10 px vellum, full ink, `hudPanel` 0.75, 4 × 2):
normal, its bottom-right at (1066, 114) / (1266, 114); enlarged, its right edge 6 px left of the
name's plate, middle y 20, hidden while a shown target frame meets it; overlay and no map, 4 px
under the column's last line (y 69 overlay on floor 1, 94 on a floor without regions). Code in,
awaiting the re-check above.
