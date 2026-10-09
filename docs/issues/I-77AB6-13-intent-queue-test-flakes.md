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
