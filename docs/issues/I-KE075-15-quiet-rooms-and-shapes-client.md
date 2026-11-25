---
id: I-KE075-15
status: open
implements: FS-KE075
blocked_by: [I-KE075-14]
labels: [blocked]
title: "FS-KE075 slice 15: client: quiet rooms dressed for ambience from quiet_rooms; shaped rooms drawn from their cells (game-client)"
---
Implements FS-KE075 §Change: Room variety (§O, R84–R86)

**Lane: agent (AFK), game-client (charter child B).**

## What to Build

`FloorMap.quiet_rooms?: number[]`. A quiet room's dressing area takes twice its share and a brazier
where one fits within the floor's brazier budget (R85). A floor-map fixture with an L, cross, pillared
and cut-corners room proves walls are drawn on every cut cell's faces and a pillar stands as a free
wall cell (R86). A contact sheet of generated floors in `docs/art/`.

## Acceptance Criteria

- [ ] A quiet room is dressed more heavily than the same room not quiet, with a brazier where it fits
- [ ] Shaped-room fixture: wall edges on every cut cell face, a pillar with four edges
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit` pass

## Blocked By

I-KE075-14

## TDD Approach

- RED: `planRoomDressing` with a quiet room gets more pieces and a brazier
- GREEN: the quiet lean in the dressing plan, wired from the floor map
