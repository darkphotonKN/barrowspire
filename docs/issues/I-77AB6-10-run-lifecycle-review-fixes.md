---
id: I-77AB6-10
status: done
implements: FS-77AB6
blocked_by: []
labels: [ready-for-agent]
title: "Review fixes: run-end crash on disconnect, resolved delvers' bodies and state, character switch"
---
Implements FS-77AB6 §Requirements 16 (co-op end rule) and FS-F6F88 §15 (dead/escaped delvers on later floors), FS-BDA7X R5/R7 (seated character) — code-review findings on a1187fb...7539c79 (see PARALLEL_PROGRESS.md "Code review findings").

**Domain:** game-service (systems/rules.go, systems/movement.go, serializer, game/session.go seating, gameserver handler/server). · **Lane:** agent (user approved fixing all HIGH+MED review findings, 2026-10-09).

## What to fix
1. **HIGH — end signal on a closed channel.** `systems/rules.go:59-65` sets `MatchProgressComponent.Ended` only on its own path; disconnect cleanup (`gameserver/handler.go:541-561`) does RemovePlayer → Shutdown, closing `endSessionCh` without setting Ended. A tick that sees 0 in play then sends on the closed channel → panic → every world in the process dies (ADR-0015). Make Shutdown set the latch and make the send impossible after close (non-blocking under a running check, or equivalent). Test: last delver disconnects mid-run while ticks continue — no panic.
2. **HIGH — invisible bodies.** LeftBehind (dead) and escaped delvers keep Transform+Velocity at old-floor coordinates and still take part in MovementSystem crowd collision (`systems/movement.go:56-66, 230-236`). Skip non-`systems.InPlay` delvers in crowd collision (keep walls/doors for in-play). Test: a dead delver's old spot on floor 2 doesn't push anyone; escaped delver at the old escape door doesn't block.
3. **MED — dead spectator loses own state.** `serializer/state_serializer.go:66` drops LeftBehind delvers from Players entirely, so the dead player's own `current_player` is null after a climb and the client plays the "escaped" path (BarrowspireScene.ts:3142, ui/party.ts:33). FS-F6F88 §15 only hides the BODY from others: keep sending the resolved delver their own current_player (with escape/dead flags as before); omit them only from other players' lists.
4. **MED — character switch keeps old body.** `game/session.go:694` returns early when the member is already seated while `gameserver/server.go:228-231` overwrites `record.Character`. When the record's character id differs from the seated body's `PlayerComponent.CharacterID`, remove and re-seat the body with the new character (hub only; refuse mid-run). Test: HUB as warrior L5 → re-enter as mage L1 → body class/name/level/exp are the mage's.

## Acceptance Criteria
- [ ] Each item above has a test that fails before and passes after.
- [ ] `go test -short -skip TestPublishMatchCompleteIntegration ./...` green apart from known pre-existing failures.
