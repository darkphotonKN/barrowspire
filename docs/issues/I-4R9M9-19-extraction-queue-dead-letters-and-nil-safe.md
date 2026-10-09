---
id: I-4R9M9-19
status: done
implements: FS-4R9M9
blocked_by: [I-4R9M9-17]
labels: [ready-for-agent]
title: "Review follow-up: extraction events are retried or dead-lettered, never discarded; nil-safe equipment mapping"
---
Implements FS-4R9M9 R49/R50 (extracted loot is stored) — follow-up found while fixing I-4R9M9-17; same "loot lost" class the user approved fixing (2026-10-09).

**Domain:** items-service (internal/items/amqp_consumer.go, service.go mapping). · **Lane:** agent.

## What to fix
1. **MED — reject discards.** The ItemsExtracted queue has no dead-letter exchange, so `reject` (Nack without requeue) throws the event away; since I-4R9M9-17 the whole event (all players' loot) goes on one permanent failure. Follow character-service's I-BDA7X-10 pattern exactly (x-dead-letter-exchange "" → `<queue>.dlq`, delayed retry queues with bounded growing TTLs, Qos, infra errors retry, only malformed/permanent → DLQ, log at Error past the last step). Report the queue name and whether the user must delete an existing arg-less durable queue on their broker (this queue predates the branch — it likely EXISTS on their stack; say exactly what to do).
2. **MED — nil equipment panic.** `MapProtoEquipmentToItemInstances` dereferences `equipmentProto` without a nil check; a player with no Equipment panics inside ExecTx and kills the consumer goroutine. Use nil-safe getters; a nil equipment = no equipped items.

## Acceptance Criteria
- [ ] Consumer tests: transient → delayed retry; permanent/malformed → DLQ (not discarded); success acked once; dedup mark released on failure (keep I-4R9M9-17 behaviour).
- [ ] A player with nil Equipment extracts their satchel without panicking.
- [ ] items-service `go test ./...` green.
