---
id: I-0018
status: open
implements: FS-0003
blocked_by: [I-0014]
labels: [blocked]
title: "FS-0003 slice 5: proto generation, RegisterLedgerServiceServer, gRPC handler wiring"
---
Implements FS-0003 §API surface, §Requirements 16, 18-19

**Author: agent**

## What to Build

Generate from slice 1's `ledger.proto` and wire the handler so the RPC is reachable.

- Regenerate `common/api/proto/ledger/ledger.pb.go` and `ledger_grpc.pb.go`. **Generated Go is
  never hand-edited** (root CLAUDE.md) — if the output is wrong, fix the `.proto` and regenerate.
- `RegisterLedgerServiceServer` against the new service definition. The old `CreateLedger` /
  `GetLedger` registrations go away with §Req 18.
- Handler wiring: request decode, call into the service layer, response encode. Follow
  `wallet-service`'s gRPC handler for shape.

**Identity comes from transport metadata, never the request body** (§Req 16). Note the trap:
the retired scaffold took its subject from `commonauth.MemberIDFromCtx`, because it was a
member-facing RPC. `AppendLedgerTx` is service-to-service — the `account_id`s in the payload are
*data about whose gold moved*, not an assertion of who is calling. Do not reach for
`MemberIDFromCtx` to populate them.

**Do not implement error mapping.** `mapError` is a stub left empty by I-0015 and filled by
I-0021. Wire the handler to call it; do not add case arms.

## Acceptance Criteria

- [ ] `ledger.pb.go` and `ledger_grpc.pb.go` regenerate cleanly from the `.proto`; no hand edits
- [ ] `git diff` on generated files shows only regeneration output
- [ ] `RegisterLedgerServiceServer` registers `AppendLedgerTx`; no `CreateLedger` / `GetLedger`
- [ ] The RPC is reachable end-to-end against a running service (a call arrives at the handler)
- [ ] No `MemberIDFromCtx` in the `AppendLedgerTx` path
- [ ] `mapError` still contains zero case arms after this slice
- [ ] `openapi.yaml` and `game-client/src/api/generated/` are untouched (§Req 19)
- [ ] `make lint` green

## Blocked By

I-0014 — the proto is authored there.

## Spec Reference

FS-0003 §API surface (request/response/enum shapes), §Requirements 16 (identity from
transport), 18 (proto rewrite), 19 (gRPC only — no HTTP surface, no client generation).

## Notes

Transport plumbing only. Leg validation and sum-to-zero are slice 7 (I-0020); this slice must
not validate anything beyond what the generated types enforce.
