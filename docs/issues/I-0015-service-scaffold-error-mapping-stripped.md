---
id: I-0015
status: open
implements: FS-0003
blocked_by: [I-0014]
labels: [blocked]
title: "FS-0003 slice 2: service scaffold — wiring, Docker, compose (error mapping STRIPPED)"
---
Implements FS-0003 §Requirements 17, 19

**Author: agent**

## What to Build

Bring ledger-service's wiring to wallet-service's shape. The service already boots, so this is
re-shaping, not greenfield: `cmd/server/main.go`, `config/`, `internal/config/services.go`,
DI wiring, Dockerfile, and the compose entry. `ledger-service/docker-compose.yml`, `Makefile`,
and `.air.toml` already exist; the DB is already in `game-server/docker-compose.yml`. Follow
`wallet-service/` for every shape decision.

Remove the scaffold this feature retires (§Req 17): the `Ledger` aggregate, its `version` /
`Reconstitute` / `Save`, and `usecase/retry.go`'s `withRetry`. Append-only performs no
read-modify-write, so OCC guards nothing (ADR-0007).

**Do NOT remove `internal/ledger/amqp_consumer.go`** — it looks like scaffold and is not. It is
the seat for the event-driven write path: wallet-service's deposit, withdraw, and transfer verbs
will publish events this consumer appends from (§Req 5a, §Req 17). Its `ledger.created` routing
key **is** a placeholder naming the retired aggregate's event — leave the file, leave the wiring,
and expect the constant to be renamed by a later feature. Deleting it because the event it names
is going away is the trap here.

## STRIP the error-mapping layer — read this before touching the handler

`internal/ledger/grpc/handler.go` currently contains a **fully populated `mapError`** with seven
case arms (`ErrMaxRetries`, `ErrConcurrentModification`, `ErrDuplicateResource`, `ErrNotFound`,
`ErrTransient`, `ErrInvalidUUID`, default). It was copied in with the scaffold.

**Reduce it to an empty stub.** Specifically:

- the function still exists and still compiles
- it references the slice 1 sentinel set
- it implements **no mappings** — every case arm is gone
- it carries exactly one `TODO` pointing at **I-0021 (slice 8)**

Do **not** implement, restore, port, or "helpfully" retain any mapping, including the ones
already sitting in the file. Error mapping is human-authored in slice 8, and a pre-filled
`mapError` would silently pre-empt that decision. Deleting working-looking code is the correct
action here.

## Acceptance Criteria

- [ ] Service builds, boots, registers with Consul, serves gRPC (for the read path)
- [ ] Wiring shape matches `wallet-service/` (cmd, config, DI, Dockerfile, compose entry)
- [ ] `Ledger` aggregate, `version`, `Reconstitute`, `Save`, and `withRetry` are gone
- [ ] `mapError` exists, compiles, references the sentinel set, and contains **zero** case arms
- [ ] Exactly one TODO in `mapError`, naming I-0021
- [ ] `make lint` green

## Blocked By

I-0014 — the sentinel set must exist before the stub can reference it.

## Spec Reference

FS-0003 §Requirements 17 (scaffold retirement), 19 (the write path is a Temporal activity — no
gateway route, no `openapi.yaml`, no client generation). Governed by ADR-0007 (OCC removal) and
ADR-0011 (write path is an activity; the gRPC server this slice boots serves the read path).

## Notes

This slice deliberately leaves the service unable to translate a domain error. That is the
intended end state until I-0021.
