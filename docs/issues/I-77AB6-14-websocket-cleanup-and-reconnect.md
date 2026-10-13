---
id: I-77AB6-14
status: done
implements: FS-77AB6
blocked_by: []
labels: [ready-for-agent]
title: "A dropped or overlapping connection never freezes or crashes game-service"
---
Implements FS-77AB6 run/session lifecycle safety (as I-77AB6-10) and FS-QG1HR D1 ("one player, one record") territory — found during I-4R9M9-23; listed in game-service/SPECIFICATION.md "Known divergences" (`cleanUpClient` inverted). User approved fixing now (2026-10-10).

**Domain:** game-service internal/gameserver (handler.go `cleanUpClient`, connection/reconnect handoff in handler.go ~96-108 and server.go `MapConnToPlayer` ~468). · **Lane:** agent (user approved).

## Defects
1. **Deadlock:** `cleanUpClient` returns early while still holding `s.mu` when the connection is mapped (`if exists { …; return }`) → every later `s.mu` user blocks → whole game-service freezes. Triggered by a normal close or an unknown read error (e.g. connection reset by peer).
2. **Panic:** when the connection is not mapped, `cleanUpClient` dereferences a nil `player`.
3. **Send on closed channel:** two overlapping reconnects let `MapConnToPlayer` close the old connection's msgChan while the earlier handler is still sending "reconnected" / world-entered on it → panic.
Also: the new handler tests (connect_handler_test.go) keep client connections open (`heldConns`) and never close the httptest server to avoid #1 — remove that workaround once fixed.

## Acceptance Criteria
- [x] Failing tests first: closing a mapped connection, a connection-reset read error, an unmapped connection cleanup, and overlapping reconnects under -race — each fails/hangs/panics before the fix.
- [x] After the fix: no deadlock (bounded test time), no panic, the 30 s reconnection window behaviour unchanged, msgChan closed exactly once, the record keeps one live connection.
- [x] connect_handler_test.go closes its connections and server normally.
- [x] `go test -race -count=20` on the gameserver connection tests clean; suite green apart from known pre-existing failures.

## Resolution
- **Deadlock** (handler.go `cleanUpClient`, old line 458): the mapped branch returned holding `s.mu`. Now the lock covers only the map edits (writer stopped, mapping and record deleted) and is released on every path; queue and world cleanup run after it, from a copy of the record.
- **Panic** (old handler.go:461): an unmapped connection (one a reconnect replaced) is now only closed. The member who now has another connection is left alone.
- **Send on closed channel** (server.go `MapConnToPlayer` old :468 closing, handler.go old :99/:141 sending): the handler fills a private writer channel with the "reconnected" / world-entered replies, then `MapConnToPlayer(conn, player, msgChan)` publishes connection and channel in one locked step, stops and unmaps every older connection of the member, and returns them for the handler to close. Writer channels are closed only under the write lock together with their map entry (`stopClientWriterLocked`), and `PushMessageToChannelQueue`/`PushMessageToConn` send (non-blocking) under the read lock, so a channel is closed exactly once and never while it can be sent on. The read loop no longer re-creates writers.
- Regression tests: `connection_lifecycle_test.go`; `connect_handler_test.go` closes its connections and server normally.
