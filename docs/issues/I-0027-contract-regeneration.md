---
id: I-0027
status: open
implements: FS-0003
blocked_by: [I-0025, I-0026]
labels: [blocked]
title: "FS-0003 slice 14: contract regeneration — openapi.yaml and the generated client"
---
Implements FS-0003 §API surface, §Requirements 32

**Author: agent**

> **Extends the FS-0003 chain post-amendment.** FS-0003 originally asserted `openapi.yaml` and
> the generated client were untouched by this feature; the amendment inverted that. This slice is
> what makes the inversion true.

## What to Build

Run the contract chain and commit its output with the handlers that produced it.

```
make openapi && make client
```

Three artifacts move together in one commit: the typed handlers, `api-gateway/openapi.yaml`, and
`game-client/src/api/generated/`. **None of the generated files is hand-edited** — not by a
person, not by an agent (root CLAUDE.md). If the output is wrong, the handler signature is wrong.

## Gates that must pass

- **Breaking-change diff** — the read path is additive, so this should report no breaking change.
  If it reports one, something in slices 12–13 altered an existing operation and that is the
  finding, not the gate.
- **Spectral lint** — the `ledger` tag must already be declared globally (I-0024). An operation
  with an undeclared tag fails here.
- **Regenerate-and-diff in CI** — regenerating must produce no diff against what was committed.

> **`make` runs each recipe line in its own shell** (`docs/agents/contract-patterns.md` §8). A
> guard that `exit 0`s on one line does not stop the next. Verify these targets **by exit code**,
> never by reading their output — two silent-success gates were shipped this way once already.

## Check, do not assume

- Optionality is load-bearing (`contract-patterns.md` §5): in Go + huma a field is **required
  unless its json tag carries `omitempty`**. On `EntryPage`, `next_cursor` is **absent on the
  final page**, so it needs `omitempty`; `entries[]` is present-and-empty rather than null, so it
  must **not** have it. These look identical in a diff and mean opposite things.
- Schema component names come from the transport types in FS-0003 §API surface's transport-type
  table — `Entry`, `EntryPage`, `Transaction`, `Leg`. If the generated document names a component
  `LedgerEntry`, a persistence struct has leaked onto the wire (§Req 31) and the handler
  signature is wrong.
- The generated TypeScript should contain no `$schema` phantom field — the transformer that adds
  it is deliberately cleared in `contract.go`.

## Acceptance Criteria

- [ ] `openapi.yaml` describes both read operations with the shapes in §API surface
- [ ] The generated client exposes both operations
- [ ] Regenerating produces no diff — verified by exit code
- [ ] The breaking-change gate reports no breaking change
- [ ] Spectral lint passes, `ledger` tag resolved
- [ ] `next_cursor` is optional in the schema; `entries[]` is required
- [ ] No generated file was hand-edited
- [ ] Handlers, `openapi.yaml`, and the generated client are in one commit

## Blocked By

I-0025 and I-0026 — both operations must exist as typed handlers before the document derived from
them is meaningful.

## Spec Reference

FS-0003 §Requirements 32 (generated, never hand-written), §API surface (the shapes the document
must carry). Conventions: `docs/contract-guide.md`, `docs/agents/contract-patterns.md`.
