---
id: I-X2F2H-1
status: open
implements: FS-X2F2H
blocked_by: [I-0XMCP-1, I-0XMCP-5]
labels: [blocked]
title: "FS-X2F2H slice 1: the field world kind, the Meadows channel at boot, and walking in and out (game-service + game-client)"
---
Implements FS-X2F2H §A (Requirements 1–8), §B (Requirements 9–21), §G (Requirements 51–53, server map only), §H (Requirements 55, 57, 60)

**Author: agent** (game-service and game-client; the user moved all of this to the agent lane:
"no hand coded here, all agents now"). This is FS-X2F2H's **field-world-core** slice: FS-3QHQZ's
I-3QHQZ-2 builds the Forest on the boot path and entrance gate made here, and I-3QHQZ-7 adds the
Forest's look to the field scene made here.

## What to Build

A player walks east out of the hub into their pod's Gentle Meadows and back again, on one
connection. No monsters, no loot, no settlement publishing yet: the field is an empty meadow
with an entrance gate.

**game-service**

1. `types.WorldTypeField = "field"`. `world_entered` for a field carries `field: "<id>"`
   (FS §A R2); hub and run messages are unchanged.
2. **Field place** (FS §A R3): a data type (id, bounds, layout, entrance gate position and
   radius, arrival point, spawn points, creature table, level band, stat factor, drop factor,
   and which hub gate destination it hangs off: `meadows` for the Meadows, matching
   I-0XMCP-1's gate table) and a **layout provider** seam returning `(layout, error)`. The
   Meadows supplies a fixed, hand-laid layout (FS §G R51–R53): about 2000 × 1000 px, entrance on
   the west edge, a few tree-cluster and rock keep-outs, 10–12 spawn points none within 400 px of
   the entrance (stored now, used by slice 3).
3. **Boot** (FS §A R4, R5): `NewServer` builds one channel per registered place beside the hub.
   Only the Meadows is registered here. A field world is never shut down: not when empty, not by
   the end rule (no match-progress entity), not by seat release, not by `leaveCurrentWorld`.
4. **What a field ticks** (FS §A R6): the run's systems minus floors, stairs, escape and the end
   rule; PvP off. Monster systems are switched on for `field` in slice 3; keep the switch in one
   place so slice 3 flips it.
5. **`enter_field { field }`** (FS §B R9–R13): validated in the stated order with reasons
   `not_in_hub`, `no_character`, `unknown_field`, `not_at_gate` (via I-0XMCP-1's `AtGate(player,
   destination)` on the hub session), `queued` (unreadable queue = not queued),
   `loadout_unavailable`. The loadout is read from items-service **before** the field's lock is
   taken (the arrival path's fetch-then-seat pattern, `SeatArrival`), and a failed read refuses
   entry. Accepted: hub body removed, a fresh body at the place's arrival point, record names the
   field, `world_entered` sent. Each entry mints a **visit id** and records the entry time.
6. **`leave_field`** (FS §B R14–R15): refused `not_in_field`, `not_at_gate` (outside the
   entrance radius), `fallen` (dead body; real deaths arrive in slice 4, the check goes in now).
   Accepted: the visit is handed to one `settle(visit)` seam (no publishing until slice 6), the
   field body **and every item entity it held** are removed from the field, the hub seats the
   player at the Meadows gate's arrival point (I-0XMCP-1's lookup) bypassing the occupancy cap
   (coming home is not arriving), `world_entered` hub.
7. **Every other way out** goes through the same settle-and-remove step, exactly once (FS §B
   R17–R19, §F R49): a disconnect in a field settles and moves the record to the hub with a hub
   body at the matching gate, held through the grace; `leave_hub` from a field settles and leaves
   for the roster; `enter_hub` from a field settles and seats the hub. `find_game` and
   `start_solo` from a field are answered with the field and start nothing (R20).
8. Fields never publish to Redis and never call the matchmaker, the queue's write paths or the
   handoff.

**game-client**

9. `world_type` gains `"field"` (`types/gameState.ts`, `render/world/ground.ts`'s `WorldKind`,
   lighting's `AMBIENT` gets a `field` entry; slice 9 tunes it). The store keeps the field id
   from `world_entered`.
10. `PhaserGame.tsx` routes `world_type: "field"` to a new `FieldScene` and stops it with the
    other world scenes. The scene draws the ground, the player and other players in the channel,
    and the entrance gate area (placeholder art is fine; slice 9 dresses it). Walking into the
    entrance gate sends `leave_field` once and waits for `world_entered` or a refusal.
11. Wire I-0XMCP-5's `onFieldGate("meadows")` seam in `HubScene` to send
    `enter_field { field: "gentle_meadows" }` once, then wait as above.
12. Client copy for every refusal reason above, in the design guideline's voice; never a raw code.

**Hard bounds:** never touch `internal/matchmaker`, `internal/match_queue` or their wiring. No
new HTTP endpoint, no DB migration.

## Acceptance Criteria

- [ ] A pod boots with one Meadows channel beside the hub; it ticks empty, and survives its last player leaving and disconnecting.
- [ ] `enter_field` at the Meadows gate switches the player into the channel on the same connection; `world_entered` carries `world_type: "field"` and `field: "gentle_meadows"`; the hub body is gone.
- [ ] Each refusal reason fires in its case (table-driven), and no body is created on a refusal.
- [ ] A stalled items-service read does not hold the field's lock (test with a blocking fake while the field ticks).
- [ ] The field body wears the equipped loadout, items above level carried.
- [ ] `leave_field` at the entrance returns the player to the hub at the Meadows gate's arrival point; away from it, refused.
- [ ] Disconnect in a field leaves the record in the hub with a body there; a reconnect within the grace is announced the hub.
- [ ] `leave_hub` and `enter_hub` from a field settle (the seam is called once) and land as from the hub; `find_game` / `start_solo` from a field create no run.
- [ ] Racing a leave with a disconnect calls `settle` exactly once (`go test -race`).
- [ ] The field's item entities for a departed body are gone from its entity manager.
- [ ] No Redis publish from a field; nothing under `internal/matchmaker` / `internal/match_queue` changed.
- [ ] Client: `world_entered` field starts `FieldScene`; the hub's Meadows gate sends `enter_field` once; the entrance gate sends `leave_field` once; refusals show copy.
- [ ] `go test ./...`, `golangci-lint run`, `npm test` and lint: no new failures versus the branch point.

## Files expected to touch

- `game-server/game-service/internal/types/game.go` (`WorldTypeField`)
- `game-server/game-service/common/constants/game.go` (`ActionEnterField`, `ActionLeaveField`, Meadows bounds, entrance radius)
- `game-server/game-service/internal/game/field_place.go` (new: place, layout provider, registry) and test
- `game-server/game-service/internal/game/meadows_map.go` (new: the hand-laid Meadows) and test
- `game-server/game-service/internal/game/session.go` (field world build, `FieldBounds`, seat with a pre-read loadout, field never ends, the monster-system switch point)
- `game-server/game-service/internal/gameserver/server.go` (boot the channels, `EnterField`, `LeaveField`, `leave_hub` / `enter_hub` from a field)
- `game-server/game-service/internal/gameserver/hub.go` (the two cases, refusals, `worldEnteredMessage` field id, `find_game` / `start_solo` from a field)
- `game-server/game-service/internal/gameserver/handler.go` (disconnect from a field, `leaveCurrentWorld` never shuts a field)
- `game-server/game-service/internal/serializer/state_serializer.go` (only if the field needs a world-type branch)
- Tests: `internal/gameserver/field_world_test.go` (new), beside-the-code tests in `internal/game/`
- `game-client/src/types/gameState.ts`, `src/render/world/ground.ts`, `src/render/lighting/lighting.ts`
- `game-client/src/stores/gameStore.ts`, `src/utils/class/SocketManager.ts` (field id)
- `game-client/src/components/PhaserGame.tsx` (routing)
- `game-client/src/scenes/FieldScene.ts` (new) and `FieldScene.test.ts`
- `game-client/src/scenes/HubScene.ts` (wire the seam) and `HubScene.test.ts`

## Blocked By

- I-0XMCP-1: the hub gates, `AtGate` and the arrival-point lookup.
- I-0XMCP-5: the client's `onFieldGate` seam.

## Spec Reference

FS-X2F2H §A R1–R8; §B R9–R21; §G R51–R53 (server map); §H R55, R57, R60; §F R49 (exactly once);
User Stories 1–5, 20, 21, 24, 26; Acceptance Criteria 1–9, 21–23, 27; Edge States "Empty field",
"Queue unreadable", "Items-service down / slow", "Leave races", "Disconnect, reconnect within
grace", "Hub full", "A stale enter_field"; Decision log D1–D5, D7–D9, D21, D27.

## TDD Approach

- RED: a new server's sessions hold a hub and one field of type `field` whose id is `gentle_meadows`.
- RED: `enter_field` refusal table; then the accepted switch (hub body gone, field body present, record names the field).
- RED: last player leaves the field and it is still registered and ticking.
- RED: concurrent `leave_field` + disconnect → one `settle`.
- GREEN: place + registry, boot, handlers, disconnect path.
- RED (client): `world_entered` field → `FieldScene`; entrance gate edge → one `leave_field`.
