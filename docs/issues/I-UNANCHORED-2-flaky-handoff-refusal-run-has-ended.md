---
id: I-UNANCHORED-2
status: open              # open | in-progress | done
implements: none          # needs an FS or ADR before /develop will accept it
blocked_by: []
labels: []
title: "Flaky test: TestHandleWebSocketConnection_HandoffRefusals/run_has_ended"
---
Implements: none yet. A test-reliability defect; the fix belongs to whichever FS owns handoff
connects (FS-K2HKP), or is a plain test fix.

## What to Build

`TestHandleWebSocketConnection_HandoffRefusals/run_has_ended`
(`game-server/game-service/internal/gameserver/handoff_connect_test.go`) fails intermittently:

```
handoff_connect_test.go:46: Should be in error chain: ... the server closes with a close frame
```

`closeCodeOf` reads until the server closes and expects a `*websocket.CloseError`; in the failing
runs the read ends with some other error, as if the connection dropped without a close frame.
The case shuts the run down (`run.Shutdown()`) before dialing the handoff, so the refusal races
the run's teardown.

Observed 2026-11-01/02 on `feat/party-formation`: 1 in 20 runs alone at 4f1df4f (before the
I-NCC9J-3 reconcile), 1–3 in 20 after it, at load average ~6; it also failed several full-package
runs. The test configures no party store, so the party code is not on its path.

## Acceptance Criteria

- [ ] The cause is found (a refusal path that closes without a close frame, or the test's read
      racing the run's shutdown) and fixed at that seam.
- [ ] `go test ./internal/gameserver -run TestHandleWebSocketConnection_HandoffRefusals -count=100`
      passes.

## Blocked By

None.
