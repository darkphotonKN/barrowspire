---
id: I-8EGFA-1
status: open
implements: FS-8EGFA
blocked_by: []
labels: [ready-for-agent]
title: "FS-8EGFA slice 1: item status on owned instances"
---
Implements FS-8EGFA §Requirements 11, 18, 19, §API surface

## What to Build

`GET /api/items/instances` tells a delver which of their relics can be listed.

- Add `status` (`AVAILABLE` | `LISTED` | `IN_ESCROW`) to proto `items.ItemInstance`.
- Read it in the `ListItemInstances` query. The column has existed since migration 000016.
- Map it through the gRPC handler and onto the gateway's `list-item-instances` wire as a
  snake_case `status` field.
- The change is additive only: no existing field changes.
- Regenerate the proto Go, then run `make openapi && make client`. Commit the handler,
  `openapi.yaml` and `game-client/src/api/generated/` together.

## Acceptance Criteria

- [ ] Every instance returned by `list-item-instances` carries `status`.
- [ ] A seeded item reserved by create-listing reads `LISTED`; an untouched one reads `AVAILABLE`.
- [ ] No existing `ItemInstance` field is renamed or removed, and the breaking-change gate passes.
- [ ] The proto Go is regenerated, not hand-edited, and regenerating the client leaves no diff after commit.
- [ ] Tests pass.

## Blocked By

None

## Spec Reference

FS-8EGFA §Requirements 11, 18, 19; §API surface (`ItemInstance.status`); stories 19, 22.

## TDD Approach

- RED: a repository or query test asserting that a LISTED instance comes back with status `LISTED`.
- GREEN: select the column and map it through the proto and the gateway wire.
