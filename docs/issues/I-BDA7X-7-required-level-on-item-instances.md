---
id: I-BDA7X-7
status: done
implements: FS-BDA7X
blocked_by: []
labels: [ready-for-agent]
title: "FS-BDA7X slice 7: Item instances carry their required level (gRPC and HTTP)"
---
Implements FS-BDA7X §Requirements (Level requirements on equipment 30; Gateway read 37–38), §API surface

**Domain:** proto (items) + items-service + api-gateway + generated client · **Touches `internal/game/session.go`:** no · **Lane:** agent-ready.

## What to Build

Every owned item says what level it needs, end to end.

- `items.proto` `ItemInstance` gains `required_level` (additive). items-service fills it from
  `item_templates.required_level` (default 1) everywhere an `ItemInstance` is built, including
  `GetLoadoutWithItems` and `ListItemInstances`. Regenerate.
- Gateway `list-item-instances`: each `ItemInstance` gains `required_level` (int32 ≥ 1,
  snake_case like the rest of that wire). `make openapi && make client`; commit together.
- Coordinate field naming with FS-4R9M9 (it will later derive the value from item level; the
  field stays).

## Acceptance Criteria

- [ ] `GetLoadoutWithItems` and `ListItemInstances` return `required_level` from the template.
- [ ] `list-item-instances` response carries `required_level`; `openapi.yaml` and the generated
      client regenerated; `make gates` passes (additive change, no ratchet break).
- [ ] items-service repo test: an instance of a level-7 template reports 7.

## Blocked By

None

## Spec Reference

FS-BDA7X §Requirements 30, 37–38; §API surface (`list-item-instances` row); §Acceptance Criteria
"Level requirements" row 1. User Stories 20.

## TDD Approach

- RED: items-service test expecting `required_level` on a listed instance.
- GREEN: join/scan the template column; map to proto; extend the gateway wire.
