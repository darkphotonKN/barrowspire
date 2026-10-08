---
id: I-BDA7X-10
status: done
implements: FS-BDA7X
blocked_by: []
labels: [ready-for-agent]
title: "Review fix: run XP survives a character-service database outage"
---
Implements FS-BDA7X R28 + Edge State "character-service down" — code-review HIGH.

**Domain:** character-service (internal/character/amqp_consumer.go, cmd/server wiring). · **Lane:** agent (user approved, 2026-10-09).

## What to fix
1. **HIGH — XP dropped permanently.** `amqp_consumer.go:125-127` rejects any unclassified error; the queue (`:62`) is declared with nil args (no `x-dead-letter-exchange`, unlike notification/wallet), so Nack(false,false) discards. `commonhelpers.IsTransientError` misses 57P01 admin_shutdown and `*net.OpError` connection refused. Requeue (with delay) unclassified/infrastructure errors; reject ONLY malformed messages; declare a DLX/DLQ like the notification and wallet services do. Note in the report: the queue is new on this branch, so no existing durable queue needs deleting — but say so explicitly for the user's stack.
2. **MED — hot requeue loop.** `:71`, `:82-83` immediate Nack(requeue) with no backoff and no Qos. Add a prefetch (Qos) and a bounded backoff (or delayed requeue via DLX TTL).
Don't edit common/ helpers beyond what's needed; if IsTransientError needs widening, keep it additive and covered by tests.

## Acceptance Criteria
- [ ] Consumer tests: connection-refused / 57P01 → requeue (with backoff), malformed → reject to DLQ, success → ack once; idempotent grant unchanged.
- [ ] character-service `go test ./...` green.
