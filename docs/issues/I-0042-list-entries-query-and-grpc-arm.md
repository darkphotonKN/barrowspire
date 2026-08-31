---
id: I-0042
status: open
implements: FS-0003
blocked_by: [I-0015, I-0017, I-0023, I-0041]
labels: [ready-for-agent]
title: "FS-0003 slice 13a: listEntries plumbing — flattened keyset query, index proof, gRPC arm"
---
Implements FS-0003 §API surface, §Requirements 22-23

**Author: agent**

> **Split out of I-0026.** The keyset SQL and the gRPC arm are mechanical once the sort order and
> the cursor encoding are fixed, and both were fixed by I-0023 and ADR-0012. The authorization
> matrix, the cursor decode at the adapter, and the `403`-not-empty refusal stayed in I-0026
> because they are decisions.

## What to Build

- **The flattened-row query** (§Req 22) — leg fields joined with their parent's, per FS-0003
  §API surface's `entries[]` table. Built **by the query**, not by fetching nested rows and
  flattening them in Go.
- **The keyset predicate** (§Req 23) — over `(created_at, id)` **descending, newest first**.
  Direction is contract, not preference: it decides which way the cursor comparison runs. Take
  the already-decoded sort key from I-0023's read interface; this slice does not decode cursors.
- **Index proof** — `created_at` is duplicated onto `ledger_entries` deliberately (FS-0003 §Data
  model) so `(account_id, created_at, id)` serves a scoped page with no join, and
  `(created_at, id)` serves the unscoped one. **Verify with `EXPLAIN` that the planner actually
  picks these indexes.** This is an acceptance criterion, not a nicety — assert it, do not
  assume it.
- **The `ListEntries` gRPC arm** — against the read service definition I-0023 generated, on the
  registration I-0041 stood up.

The repository takes a scope (an account id, or none) as a **parameter**. It does not derive
one, does not read a token, and does not decide whether the caller was entitled to the scope it
was handed. That decision is I-0026's, at the gateway, re-read from the JWT on every page
(ADR-0012).

## What NOT to do

- No gateway code, no Huma operation, no transport type — I-0026.
- No cursor decoding and no `422` on a malformed cursor — that happens at the adapter, in I-0026.
- No authorization matrix, no member-vs-admin logic, no `403`. The repository is handed a scope
  and honours it.
- **No total, no sum, no count** (§Req 20, ADR-0005) — not on the response, not as a repository
  method, not as a convenience header. Keyset paging is chosen partly because it needs none.
- No `mapError` case arms.

## Acceptance Criteria

- [ ] The query returns flattened rows carrying both parent and leg fields, built in SQL
- [ ] Rows come back newest-first over `(created_at, id)` descending
- [ ] Paging the full history with `limit` below the row count visits every row exactly once —
      proven by a test that appends a transaction mid-page and asserts no row skipped or repeated
- [ ] A sort key past the last row yields an empty result set — not an error, not page one
- [ ] Scoped and unscoped reads both use their intended index — asserted against `EXPLAIN`,
      not assumed
- [ ] The repository takes its scope as a parameter and derives nothing
- [ ] No method, response, or header exposes a total, sum, or count
- [ ] `make lint && make test` green for ledger-service

## Blocked By

- I-0015 — final wiring shape
- I-0017 — the scan targets
- I-0023 — the cursor encoding and the read signature that carries the decoded key
- I-0041 — the server registration this arm attaches to

## Spec Reference

FS-0003 §API surface (the `listEntries` row, the `entries[]` table), §Requirements 20 (no
aggregates), 22 (flattened rows), 23 (keyset, descending). Governed by ADR-0005 (no balances)
and ADR-0012 (the cursor is a position, not a request).

## TDD Approach

- RED: append a transaction between two page fetches; assert the second page skips and repeats
  nothing
- GREEN: keyset predicate over `(created_at, id)` descending
