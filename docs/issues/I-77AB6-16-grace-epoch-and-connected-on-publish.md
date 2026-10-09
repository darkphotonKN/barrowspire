---
id: I-77AB6-16
status: open
implements: FS-77AB6
blocked_by: [I-77AB6-15]
labels: [ready-for-agent]
title: "Repeated drops each get a full grace; a published connection is always marked connected"
---
Implements FS-77AB6 §Edge States ("delver disconnects … the reconnect grace") under the user decision of 2026-10-10 (a network drop gets the grace) — final code-review MEDs on I-77AB6-15.

**Domain:** game-service internal/gameserver (handler.go holdForReconnect / handleReconnectionTimeout / cleanUpPlayerCompletely; server.go MapConnToPlayer). · **Lane:** agent.

## What to fix
1. **Overlapping grace timers.** `handleReconnectionTimeout` only re-checks "still reconnecting": drop at t=0 (timer A, 30 s) → reconnect t=29 → drop t=29.5 (timer B) → A fires at t=30 and evicts after 0.5 s. Give each hold a grace epoch/deadline stamped on the record by `holdForReconnect`; the timer carries it and `cleanUpPlayerCompletely` acts only if it still matches (or keep one stoppable timer per member, replaced on reconnect/new hold). Test: drop → reconnect → drop keeps the member for the full second window.
2. **Published connection left "reconnecting".** `MapConnToPlayer` (server.go:~466-494) publishes the record without marking it Connected; if the old conn fails between `connectPlayer` (which set Connected) and `MapConnToPlayer`, `holdForReconnect` marks it Reconnecting and the live member is evicted ~30 s later. Under the lock it already holds, `MapConnToPlayer` marks every record of the member Connected (and invalidates any pending grace epoch). Test the race window deterministically.
3. **LOW cleanup.** `cleanUpPlayerFromSession` (handler.go:~441-445) has no production caller; delete it and point reconnect_test.go / hub_lifecycle_test.go at `cleanUpClient` / `releaseDeparted`. Fix issue I-77AB6-15's wording note: 1001 keeps its 10 s grace (intended).

## Acceptance Criteria
- [ ] Drop → reconnect → drop within 30 s: evicted only after the second window.
- [ ] A connection published after a concurrent old-conn failure stays Connected and is never evicted by a stale timer.
- [ ] `go test -race -count=20` on the connection tests clean.
