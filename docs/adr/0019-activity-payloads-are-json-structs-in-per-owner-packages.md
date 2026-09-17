# ADR-0019 — Activity payloads are plain JSON structs in a package owned by the executing service

Status: accepted
Date: 2026-09-17
Scope: `game-server/common/api/activity`, every service running a settlement activity
Builds on: [ADR-0011](0011-settlement-write-path-is-a-temporal-activity-per-owning-service.md) — addresses, but does not close, its "no schema gate" gap
Realized by: FS-NXP1W (draft)

## Context

Recorded without adversarial review.

ADR-0011 made activity input/output structs a cross-service contract and explicitly left open how
to guard it. The contract is also a *replay* contract: Temporal replays old event histories against
current type definitions, so a removed or retyped field breaks runs that are already past their pivot.

Two encodings were considered:

- **Plain Go structs with JSON tags**, via Temporal's default data converter.
- **Proto messages** with a proto payload converter — one schema language across the repo, and
  `buf breaking` as the gate that ADR-0011 found missing.

Precedent already exists: the ledger thread defined `common/api/activity/append.go`, package
`ledgeractivity`, as plain JSON structs. And `docs/agents/contract.md` records that plane-2 proto
governance (`buf lint`, `buf breaking`) is declared but **not yet wired** — so proto today would add
the ceremony without the gate that justifies it.

## Decision

**Activity payloads are plain Go structs with explicit JSON tags, in one package per executing
service under `common/api/activity/`** — `ledgeractivity` (existing), `walletactivity`,
`itemsactivity`, `marketplaceactivity`. Each package holds that service's activity name constants
and its input/output types. The workflow consumes them; the owning service implements them.

**Changes are additive-only**: never remove a field, never retype one, never change a JSON tag.

**Each struct gets a golden-JSON fixture test** as a stopgap guard: serialized output is compared
against a committed fixture, so a rename or retype fails a PR rather than a running workflow.

Rejected: **proto + payload converter** — the gate that would justify it is not wired, ledger's
existing structs would have to migrate, and proto would enter the saga path of services that do
not otherwise need it.

## Consequences

- **Consistent with what exists.** Ledger's activity contract needs no migration.
- **Ownership is legible from the import path.** `walletactivity.CommitHoldInput` is wallet's
  contract; the package boundary mirrors ADR-0011's ownership boundary.
- **Cheap to author.** No generation step between changing a struct and using it.
- **Cost: the guard is a convention plus a fixture, not a tool.** Golden fixtures catch renames and
  retypes only for structs someone remembered to fixture, and a fixture can be regenerated to make
  a breaking change pass. It is weaker than `buf breaking`.
- **Cost: revisit when plane-2 governance is wired.** If `buf breaking` becomes real, proto
  payloads become the stronger option, and this decision should be reconsidered then — while
  histories are few, because switching encodings with long-lived histories in flight is painful.
