---
id: I-BDA7X-11
status: done
implements: FS-BDA7X
blocked_by: [I-BDA7X-10]
labels: [ready-for-agent]
title: "Re-review fix: character-service fails loudly at startup if its XP queue topology can't be declared"
---
Implements FS-BDA7X R28 (run XP must not be silently lost) — re-review finding N3. User approved (2026-10-09).

**Domain:** character-service (internal/character/amqp_consumer.go topology declare; cmd/server wiring). · **Lane:** agent.

## What to fix
If the broker still holds an arg-less `character.game.match.ended` (declared by earlier checkpoints of this branch), redeclaring it with DLX args fails with PRECONDITION_FAILED and closes the shared channel, killing BOTH listeners (match.ended and character-created) while the service keeps running with no XP ever granted. Make topology declaration a startup step whose failure exits the process with a clear Error naming the queue and the fix ("delete queue X once; it will be recreated"). Don't share one channel between the topology declare and both consumers in a way that one failure silently kills the other — use a dedicated channel per consumer or re-open on close. Add a topology declare test (items-service has `TestDeclareExtractedTopology` as a model).

## Acceptance Criteria
- [ ] A declare failure on startup returns an error from the consumer setup and main exits non-zero with an actionable message.
- [ ] The character-created listener no longer dies because the match.ended declare failed (separate channel or equivalent).
- [ ] Topology declare test covers the work queue args, DLQ and the three retry queues.
- [ ] character-service `go test ./...` green.
