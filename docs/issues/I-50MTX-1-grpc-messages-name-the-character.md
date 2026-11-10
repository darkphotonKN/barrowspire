---
id: I-50MTX-1
status: done
implements: FS-50MTX
blocked_by: []
labels: [ready-for-agent]
title: "FS-50MTX slice 1: gRPC and event messages name the character"
---
Implements FS-50MTX §Moves, §Reads, §Run and field checkout, §Settlement

**Foundation, and the one writer on `common/api/proto`.** It goes first so the three service tracks
(I-50MTX-2, I-50MTX-5, I-50MTX-6) can run side by side.

## Files owned

- `game-server/common/api/proto/items/items.proto`, `items.pb.go`, `items_grpc.pb.go`
- `game-server/common/api/proto/events/game.proto`, `game.pb.go`

## What to Build

Add `character_id` as a new string field, at the next free number, to:

| Message | Field | Number | Meaning |
|---|---|---|---|
| `GetLoadoutRequest` | `character_id` | 2 | whose loadout (R22) |
| `GetLoadoutWithItemsRequest` | `character_id` | 2 | whose loadout (R28) |
| `ListItemInstancesRequest` | `character_id` | 2 | optional; empty is the stash only (R23) |
| `CheckOutRunGearRequest` | `character_id` | 3 | whose gear (R25) |
| `UpdateLoadoutRequest` | `character_id` | 4 | whose slot (R10) |
| `MoveItemInstanceRequest` | `character_id` | 3 | the character moving it, both directions (R18) |
| `ItemInstance` | `character_id` | 27 | its holder; empty for a stash item (R24) |
| `events.PlayerItems` | `character_id` | 6 | whose finds; empty on a pre-deploy event (R30, R32) |

Regenerate with `make gen` in `game-server/common`. Generated Go is never patched by hand. No number
is reused or renumbered. Comments cite FS-50MTX.

`ApplySettlementRequest` carries `events.ItemsExtractedEvent`, so `PlayerItems` reaches both the
direct call and the event copy with no further message change.

## gRPC compile

**Additive only, nothing breaks.** Every new field is a new optional-on-the-wire proto3 field, so
every caller in the workspace compiles unchanged. This slice updates no caller. The slices that
start requiring a value are I-50MTX-2 and I-50MTX-3, and each says how its callers stay compilable.

## Acceptance Criteria

- [ ] The eight fields exist with the numbers above, and the generated Go is regenerated, not patched.
- [ ] The `.pb.go` diff is only these additions. A version-header-only churn from a different `protoc` is reverted or called out.
- [ ] `go build ./...` passes from `game-server` for every module in `go.work`.
- [ ] `go test ./...` in `common` passes.

## Blocked By

None. Blocks I-50MTX-2, I-50MTX-5, I-50MTX-6.

## Spec Reference

FS-50MTX R18, R22-R25, R30, R32 (message shape only; behaviour is in the later slices).

## TDD Approach

Schema-only, no behaviour to drive. The check is the workspace build.
