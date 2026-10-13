---
id: I-77AB6-15
status: done
implements: FS-77AB6
blocked_by: [I-77AB6-14]
labels: [ready-for-agent]
title: "A network drop gets the reconnect grace; reconnect and cleanup never act on stale copies"
---
Implements FS-77AB6 §Edge States ("delver disconnects … the reconnect grace") and FS-QG1HR D1 territory — final code-review findings on I-77AB6-14 / I-4R9M9-23; user decisions of 2026-10-10.

**Domain:** game-service internal/gameserver (handler.go, server.go) + config/access_log.go comment. · **Lane:** agent.

## What to fix
1. **USER DECISION — reset means grace, not leaving.** `handler.go:~223-224`: a TCP reset (ECONNRESET) / other network error (`net.Error`, timeouts, EOF without a close frame) currently takes the "unknown error, clean up completely" branch and removes the delver from the run at once. Route network errors through the same reconnect grace as an abnormal close (mark reconnecting, existing timeout); only a deliberate normal closure (1000) cleans up immediately as today; a going-away close (1001) keeps its short 10 s grace, as intended (wording corrected in I-77AB6-16). Update `TestDisconnect_AConnectionResetLeavesTheServerServing` to the new rule (server keeps serving AND the delver is held for the grace window).
2. **LOW — stale copy published on reconnect.** `MapConnToPlayer` (server.go:~461-479) maps the copy `connectPlayer` took before the upgrade + replies; a run ending (`ReturnPlayersToHub`/`ApplyRunProgress`) or timeout cleanup in that window leaves `connToPlayer` disagreeing with `players`. Under the lock it already holds, map a fresh copy of `*s.players[player.ID]` (use the argument only for the ID); if the record is gone, refuse/close the new conn cleanly.
3. **LOW — cleanup ordering.** `cleanUpClient` (handler.go:~436-439): do the in-process session cleanup before the (possibly slow, retrying) queue removal, and skip `forgetCurrentWorld` for a record already deleted — so an old cleanup can't remove the body/world of a member who reconnected meanwhile. Add a test for close → reconnect → re-enter hub → old cleanup finishing.
4. **LOW — doc accuracy.** `config/access_log.go`: the comment claims output identical to gin's default; it differs (no colours, spacing, `query.Encode()` reorders/re-escapes). Either preserve the original query order/encoding (only replace the token value) or correct the comment.
5. **INFO, cheap:** `PushMessageToChannelQueue` (server.go:~640-648) looks up conn and channel under two RLocks — do both under one.

## Acceptance Criteria
- [x] Reset/network error → delver held for the reconnect window and can resume; normal close → immediate cleanup (unchanged).
- [x] Reconnect overlapping a run end maps the live record; old cleanup can't strip a reconnected member.
- [x] `go test -race -count=20` on gameserver connection tests clean; suite green apart from known pre-existing.
