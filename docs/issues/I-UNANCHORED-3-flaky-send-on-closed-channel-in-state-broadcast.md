---
id: I-UNANCHORED-3
status: open              # open | in-progress | done
implements: none          # needs an FS or ADR before /develop will accept it
blocked_by: []
labels: []
title: "Flaky panic: send on closed channel from a session's state broadcast"
---
Implements: none yet. A concurrency defect between a world session's broadcast and a client
writer's teardown; anchor to the FS that owns the client writer, or fix as a plain bug.

## What to Build

One full run of `go test ./internal/gameserver` (2026-11-01, `feat/party-formation`, during the
I-NCC9J-3 round 6 changes) panicked:

```
panic: send on closed channel
gameserver.(*Server).PushMessageToChannelQueue   internal/gameserver/server.go:1134
messaging.(*MessageSender).SendStateToPlayer     internal/messaging/sender.go:64
game.(*Session).broadcastFullState.func1         internal/game/session.go:1600
created by game.(*Session).broadcastFullState    internal/game/session.go:1599
```

`broadcastFullState` sends each recipient's state from its own goroutine.
`PushMessageToChannelQueue` holds `s.mu.RLock` for the lookup and the send, and its comment says a
writer channel is closed only under the write lock (`stopClientWriterLocked`, `handler.go:378`).
The panic means some channel was closed while that send held the read lock, or the send reached a
channel closed by another path. Not reproduced since; the test that was running was not
identified (the panic ends the binary).

## Acceptance Criteria

- [ ] Every path that closes a client writer channel is found and shown to hold `s.mu` for writing,
      or the broadcast cannot reach a closed channel.
- [ ] A test (or a `-race -count=N` run) that would have hit it passes.

## Blocked By

None.
