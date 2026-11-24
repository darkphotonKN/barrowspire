---
id: I-5FZ4J-2
status: open
implements: FS-5FZ4J
blocked_by: [I-5FZ4J-1]
labels: [ready-for-agent]
title: "FS-5FZ4J slice 2: the gate and barriers, the seal state, ambushes and the Lever Order seal"
---
Implements FS-5FZ4J §B, §C R15–R16, §D R22, §H, §I R46 (`seal`, `seal_pieces`, `barriers`), R48, R49

**Hotspot:** `session.go` (handleInteract), `factory.go`, the serializer and `types`. One writer at
a time. Never touch `internal/matchmaker` or `internal/match_queue`. No HTTP contract change.

## What to Build

The seal framework and the first kind, end to end on the server:

- **Barriers**: the gate as a barrier entity over the layout's gate cells, blocking bodies while
  shut (doors are already live blockers in the wall index; avoid the Interactable+Openable flicker
  in `systems/interaction.go`). Sent every tick as `barriers` (R46). **Monster paths respect
  barriers** (R22): a mutable walkable mask on the nav grid (and the movement grid), updated on the
  tick a barrier opens.
- **Seal state** on the floor (run floor state, not the run plan): kinds drawn per R9 (in this
  slice Lever Order is the only built kind, so the draw is forced to it behind the tunable; the
  draw table and the 8-10 chain land in slice 6), broken stages, `seal` on the wire (R46). Stairs
  refuse `stairs_sealed` (R12); the gate refuses `gate_sealed` and opens with the last
  gate-holding seal (R13). Seal breaks are state transitions (R11, R48).
- **Ambushes** (R14): a reusable "wake" that spawns a 2–4 pack of the floor pool in the nearest
  qualifying room, aggroed on the waker; one per piece for the floor's life.
- **Lever Order** (R15–R16): levers with glyphs, the mural reply `mural` with `glyphs`, in-turn
  pulls, the out-of-turn dart volley (a hit through the normal damage path, factor per R26 using
  the floor's fodder hit) and reset, `lever_down`, `lever_wrong`, the last pull breaks the seal,
  the ambush on each in-turn first pull. `seal_pieces` on the wire.
- New fixtures join `mapKeepOut` so monsters never spawn on them, and the build order of §H.
- Tunables in one place (seal kind force, ambush size, lever counts).

## Acceptance Criteria

- [ ] A shut gate blocks a delver and is unwalkable to a monster path; opened, both pass (tests through `step`).
- [ ] Stairs refuse `stairs_sealed` and the gate `gate_sealed` while the seal holds; the last in-turn lever opens the gate and the stairs climb.
- [ ] Wrong order: the puller takes a dart hit, every lever resets, the reply is `lever_wrong`; a lever already down replies `lever_down`.
- [ ] The mural replies `mural` with the glyphs in order.
- [ ] An in-turn first pull spawns one ambush of 2–4 of the floor pool in the nearest qualifying room, aggroed on the puller; a second pull of that lever spawns nothing.
- [ ] `seal`, `seal_pieces`, `barriers` serialize per §I R46 and are absent in the hub, a field and the top floor.
- [ ] A floor of buildings has no seal and open stairs (R1).
- [ ] `make test` and `make check` green.

## Blocked By

I-5FZ4J-1 (gate cells in the layout).

## Spec Reference

FS-5FZ4J §B R9 (framework), R11–R14, §C R15–R16, §D R22, §H R45, §I R46, R48, R49.

## TDD Approach

- RED: a sealed floor's stairs interact replies `stairs_sealed`.
- GREEN: the seal state + the stairs branch check.
