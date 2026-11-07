---
id: I-ADR0069-2
status: open
implements: ADR-0069
blocked_by: [I-ADR0069-1]
labels: []
title: "ADR-0069: two relays on one outbox never publish the same row (concurrency test + manual two-replica check)"
---
Implements ADR-0069 §Decision 2, §Consequences (no duplicate in the normal path)

**Author:** agent (charter run, 2026-11-07)

## What to Build

A real-Postgres test that runs two outbox workers against one outbox table at the same time, each
with its own 2-connection pool (the shape of two replicas of a service), over many rounds. Each
round fills the table, both workers drain it concurrently, and the test checks that every row was
published exactly once and marked. The test also checks that both workers took rows, so it cannot
pass by one worker doing everything. Uses `OUTBOX_TEST_DB_DSN` and a throwaway schema like the
other outbox DB tests.

## Acceptance Criteria

- [ ] Over many rounds, no row id is published twice and every row ends with `published_at` set.
- [ ] Both workers published rows across the run (the race was exercised).
- [ ] Passes under `-race`.
- [ ] The manual check below is written for Nick.

## Manual check for Nick (two replicas, local)

Practical with wallet-service: its only listener is gRPC on `GRPC_WALLET_ADDR`, its outbox ticks
every 5 s, and it publishes to the `wallet.events` topic exchange. (stats-service also works but
ticks once a minute and has a hard-coded metrics port.) Run this after the branch is merged, from
the main checkout where `.env` lives.

1. Start the compose stack (Postgres, RabbitMQ, Temporal) as usual.
2. In `game-server/wallet-service`, start one copy with `make dev`.
3. In a second terminal, start another copy on a free gRPC port:
   `GRPC_WALLET_ADDR=7228 go run ./cmd/server`. Both copies use the same DB and RabbitMQ, so they
   drain the same `outbox` table.
4. In the RabbitMQ management UI (http://localhost:15795), create a temporary queue
   `outbox-manual-check` and bind it to `wallet.events` with routing key `manual.check`. No
   consumer listens on that key, so nothing acts on the rows.
5. In `barrowspire_wallet_service_db`:
   `INSERT INTO outbox (routing_key, exchange, payload) SELECT 'manual.check', 'wallet.events', '\x00' FROM generate_series(1,500);`
6. After about 10 s the queue holds exactly 500 messages, not up to 1000, and
   `SELECT count(*) FROM outbox WHERE routing_key = 'manual.check' AND published_at IS NULL;`
   returns 0.
7. Clean up: `DELETE FROM outbox WHERE routing_key = 'manual.check';` and delete the queue.

For comparison, the same steps on main before this branch should show more than 500 messages
when both copies tick at the same moment. If they don't overlap on a run, repeat step 5.

## Blocked By

- I-ADR0069-1 (the locked batch it exercises)

## Spec Reference

ADR-0069 §Decision 2, §Consequences ("Replicas no longer publish the same row twice in the
normal path").
