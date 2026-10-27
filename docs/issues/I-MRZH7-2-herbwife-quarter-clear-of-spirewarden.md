---
id: I-MRZH7-2
status: open
implements: FS-MRZH7
blocked_by: []
labels: [ready-for-agent]
title: "FS-MRZH7 slice 2: the Herbwife's quarter clears the Spirewarden"
---
Implements FS-MRZH7 §Requirements 8–10

## What to Build
Move the Herbwife's wander region from x 1120, y 540, w 260, h 220 to x 1260, y 540, w 240, h 220
in the server's hub map data (`game-server/game-service/internal/game/hub_map.go`, `hubResidents`)
and identically in the client's mirror (`HUB_KEEP_OUT.wander` in
`game-client/src/render/world/hubKeepOut.ts`). Add a clearance test on each side so no ambient
NPC's quarter can come within a function NPC's talk range plus a 40 px margin (120 px) again.
Map data and tests only: pure labour on the server's human lane, split out as an agent issue.

## Acceptance Criteria
- [ ] `hubResidents` Herbwife region is `{X: 1260, Y: 540, W: 240, H: 220}`; the Spirewarden and Quartermaster are unmoved.
- [ ] `HUB_KEEP_OUT.wander` Herbwife entry is `{ x: 1260, y: 540, width: 240, height: 220 }`.
- [ ] A Go test fails if any `hubResidents` region comes within `NPCInteractRange + 40` of any `hubNPCs` position.
- [ ] A client test fails if any `HUB_KEEP_OUT.wander` region comes within 120 px of any `HUB_KEEP_OUT.npcs.at` position.
- [ ] Existing hub keep-out and dressing tests pass with only the moved quarter's value updated.
- [ ] `go test ./...` in game-service, `tsc`, the client test suite and the lint fence pass.

## Blocked By
None

## Spec Reference
FS-MRZH7 §Requirements 8–10: the Herbwife's quarter moves, the clearance rule, dressing still clear. User stories 5, 9, 12, 14. Edge states: server and client disagree on the quarter, residents mid-walk on deploy.

## TDD Approach
- RED: the two clearance tests, which fail today because the Spirewarden at (1140, 680) sits inside the Herbwife's quarter.
- GREEN: move the quarter on both sides.
