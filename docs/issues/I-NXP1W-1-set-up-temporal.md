---
id: I-NXP1W-1
status: open
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

- [ ] `docker compose up` brings Temporal and its UI up
- [ ] marketplace, items, wallet and ledger each start a worker on their own task queue
- [ ] A smoke workflow completes across two queues and shows up in the Temporal UI
- [ ] Worker shutdown is graceful (no orphaned polls on service stop)

## Blocked By

None

## Spec Reference

FS-NXP1W §Summary (prerequisites), §Out of Scope (Temporal infrastructure). ADR-0011.
