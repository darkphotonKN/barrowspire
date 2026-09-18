---
id: I-NXP1W-1
status: done
implements: FS-NXP1W
blocked_by: []
labels: []
title: "FS-NXP1W slice 1: set up Temporal (compose, config, common/temporal, workers)"
---
Implements FS-NXP1W §Summary (prerequisites)

**Author: human** (Kranti)

## What to Build

The Temporal foundation every other slice runs on. The FS lists it as a prerequisite and marks it
out of scope; it is sliced here so the saga has a first step. Governed by ADR-0011.

- Temporal (and its UI) in `game-server/docker-compose.yml`.
- Per-service config for the Temporal host, namespace and task queue.
- `common/temporal`: the shared client and worker bootstrap.
- A worker running in marketplace, items, wallet and ledger, each on its own task queue
  (`marketplace`, `items`, `wallet`, `ledger`).
- A smoke test that proves a workflow on the `marketplace` queue can schedule an activity on a
  participant queue.

## Acceptance Criteria

- [x] `docker compose up` brings Temporal and its UI up
- [x] marketplace, items, wallet and ledger each start a worker on their own task queue
- [x] A smoke workflow completes across two queues and shows up in the Temporal UI
- [x] Worker shutdown is graceful (no orphaned polls on service stop)

## Blocked By

None

## Spec Reference

FS-NXP1W §Summary (prerequisites), §Out of Scope (Temporal infrastructure). ADR-0011.

## Outcome

Verified live against the running stack, not only by test:

- `docker compose up` brings `temporal-db`, `temporal-setup`, `temporal`, `temporal-namespace`
  and `temporal-ui` up; UI answers 200 on :8233, namespace `barrowspire` at 168h retention.
  Re-running is idempotent (`namespace barrowspire already exists`).
- All four services connect and log `temporal: worker started` on their own queue.
- `go run ./cmd/temporal-smoke` completed across all four queues; history shows a
  scheduled/started/completed triple per activity, each `ActivityTaskScheduled` naming the
  expected queue.
- SIGTERM to wallet drained the worker (`temporal: worker stopped`) before exit.
- With wallet down, its activity sat in the queue backlog undispatched; restarting wallet
  resumed the same run to completion.
- Both runs survived removal and recreation of the Temporal containers, so the volume holds.

Deviations from the runbook, all forced by what the images actually ship:

- SDK pinned to `v1.45.0`, not latest: v1.46+ needs Go 1.25.4 and v1.49 needs Go 1.26, either of
  which would push `common`'s go directive up and cascade to all twelve workspace modules.
- `temporalio/server` ships no config template (its entrypoint is a bare `temporal-server start`),
  and `temporalio/auto-setup` stopped being published after 1.29.7. Server config is therefore an
  authored, mounted file: `game-server/temporal/config/development.yaml`.
- `admin-tools` publishes no plain `1.29.0`; server and admin-tools are pinned together at `1.32.0`.
- `admin-tools` is busybox-based, so the init containers use `/bin/sh`, not `/bin/bash`.
- Visibility schema lives at `postgresql/v12/visibility/versioned`, not under `temporal/`.
- `create-database` takes the name from the global `--db` flag, not a subcommand flag.
- The server image carries no `temporal` CLI, so its healthcheck is a TCP probe of :7233.
