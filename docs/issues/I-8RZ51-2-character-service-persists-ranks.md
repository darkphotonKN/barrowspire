---
id: I-8RZ51-2
status: done
implements: FS-8RZ51
blocked_by: [I-8RZ51-1]
labels: [blocked]
title: "FS-8RZ51 slice 2: character-service saves a spend idempotently and the character read returns the ranks (character-service, common proto)"
---
Implements FS-8RZ51 §C (R11–R15), §B R9–R10, §API surface

**Author: agent.** DDD-lite layering: handler parses and formats, the rule lives in the service,
SQL only in the repository. DB errors via `commonhelpers.WrapDBErr`.

## Files it expects to touch

- `game-server/common/api/proto/character/character.proto` (`PassiveRank`, `Character.passive_ranks`,
  `SpendPassivePoint` RPC), regenerated Go via `make gen` in `game-server/common` (never hand-edited)
- `game-server/character-service/migrations/000004_create_passive_ranks_table.{up,down}.sql` (new)
- `game-server/character-service/internal/character/{model,repository,service,handler}.go` and
  their `_test.go`; `repository_trace.go` / `trace_gen.go` if the gowrap traces need regenerating
- `game-server/character-service/go.mod` only if the new common package needs it

## What to Build

- Table `passive_ranks (character_id → characters.id, node_id text, rank smallint 1..3,
  updated_at, PRIMARY KEY (character_id, node_id))`.
- `SpendPassivePoint(member_id, character_id, node_id, rank)`: in one transaction lock the character
  row (`SELECT … FOR UPDATE`, scoped by member and live), read level and ranks, run
  `passivetree`'s spend rule. Already held → OK, `applied = false`, nothing written. Allowed →
  upsert the rank, OK, `applied = true`. Refused → `errcode.Refusal` (FailedPrecondition +
  ErrorInfo) with the rule's code, nothing written. Unknown / other member's / deleted character
  → NotFound. Malformed ids or rank < 1 → InvalidArgument. The response carries all held ranks.
- `Character` carries `passive_ranks` on `GetCharacter`, `ListCharacters` (one query for the list,
  no N+1) and `CreateCharacter` (empty).
- The gateway's `characterFromProto` ignores the new field: no `openapi.yaml` change.

## Acceptance Criteria

- [ ] A spend writes one rank; the same call again is OK, `applied = false`, writes nothing.
- [ ] Two concurrent spends that together exceed the unspent points: one lands, one is refused
      `PASSIVE_NO_POINTS` (DB test, `make test-db`).
- [ ] Each refusal code reaches the gRPC caller with nothing written.
- [ ] Another member's, a deleted and an unknown character are NotFound.
- [ ] Get and List return held ranks; a new character has none.
- [ ] `make openapi` in api-gateway produces no diff.
- [ ] `make test` green in character-service and common.

## Blocked By

I-8RZ51-1 (the tree definition, spend rule and codes).

## Spec Reference

FS-8RZ51 §C R11–R15, §B R9–R10, §API surface rows 1–2, §Edge States (duplicate, two tabs,
deleted). User stories 15, 24, 30.

## TDD Approach

- RED: service test, a repeat spend answers `applied = false` and the fake repository saw no write.
- GREEN: the transaction with the row lock and the shared rule.
