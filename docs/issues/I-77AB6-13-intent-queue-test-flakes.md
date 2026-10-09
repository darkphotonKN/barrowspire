---
id: I-77AB6-13
status: open
implements: FS-77AB6
blocked_by: []
labels: [ready-for-agent]
title: "Intent-queue concurrency tests no longer flake"
---
Implements FS-77AB6 §Requirements 1–7 test coverage (I-77AB6-11) — spawn code-review found `TestSession_RefusalsFromTheTick_AreUnchanged` and `TestSession_HandlersConcurrentWithTheTick_AttackEquipAndLootAllLand` (internal/game/intent_queue_test.go, via `runConcurrently`) fail intermittently on d287f02 and HEAD. Cause and fix to be determined by /diagnose (test timing vs product race).

**Domain:** game-service tests (or product, if /diagnose finds a real race). · **Lane:** agent.

## Acceptance Criteria
- [ ] Root cause recorded here; fix applied at the right seam.
- [ ] `go test -count=500 -run 'TestSession_RefusalsFromTheTick_AreUnchanged|TestSession_HandlersConcurrentWithTheTick' ./internal/game/` (and with -race) → 0 failures.

## Diagnosis (2026-10-10, /diagnose)
TEST defects, no product race (31/300 failures under -race, zero DATA RACE reports).
1. `TestSession_HandlersConcurrentWithTheTick_AttackEquipAndLootAllLand` (intent_queue_test.go:82-84): the run is built with a random floor (`lootedRunWithSender` → `newRun` → `InitialMapObjects`) and the warrior is pinned at fixed (500,500) with the target 45 px away (reach 60). When (500,500) overlaps floor geometry, tick-0 depenetration (systems/movement.go:170-210) snaps the delver up to ~30 px away → target out of reach → attack lands on nothing. Fix: build this concurrency test on a run with no floor (`coopRun(t)` + `s.sender = messaging.NewMessageSender(&recordingDispatcher{})`).
2. `TestSession_RefusalsFromTheTick_AreUnchanged` (intent_queue_test.go:161): `placeDelver(t, s, "mage", at.X+400, at.Y)` lands off the 1440 px map when the random stairs are near the right edge; the tick-0 clamp (movement.go:212-224) pulls the mage back beside the stairs → the climb succeeds (no reply by design) → missing refusal frame. Fix: place the mage at at.X-400 when at.X+400 would leave the map.
