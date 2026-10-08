---
id: I-4R9M9-3
status: done
implements: FS-4R9M9
blocked_by: [I-4R9M9-1, I-4R9M9-2]
labels: [ready-for-agent]
title: "FS-4R9M9 slice 3: Gateway serves item level, affixes, required level and unique effect"
---
Implements FS-4R9M9 §Requirements (Gateway 57–58), §API surface

**Domain:** api-gateway + generated client · **Touches `internal/game/session.go`:** no · **Lane:** agent-ready.

## What to Build

The marketplace and the loadout can read what an item rolled, over the typed HTTP contract.

- `internal/gateway/item/wire.go` `ItemInstance` gains `item_level` (int32, minimum 1),
  `affixes` (`[]Affix`, always present, `nullable:"false"`), `unique_effect` (string, omitempty);
  `required_level`'s doc becomes "derived requirement: max of base and affix tiers; the template's
  for items from before item levels". `item_type` doc lists `ring`.
- `internal/gateway/listing/model.go` `ItemSummary` gains `itemLevel`, `requiredLevel`,
  `affixes` (always present), `uniqueEffect?`; `itemType` doc lists `ring`.
  `itemSummaryFromProto` maps them.
- `Affix` wire type `{stat, tier (0..3), value (≥ 0)}` per §API surface (one per package is fine;
  same field names on both wires).
- `make openapi && make client`; commit `openapi.yaml`, the generated client and the handlers
  together. Never hand-edit either artifact.

## Acceptance Criteria

- [ ] `list-item-instances` returns `item_level`, `affixes`, `unique_effect` (unique only) and the
      derived `required_level`.
- [ ] `browse-listings`, `get-listing`, `list-my-listings` return `itemLevel`, `requiredLevel`,
      `affixes`, `uniqueEffect` (unique only) on the embedded summary.
- [ ] A legacy item (ilvl 1, no affixes) serialises `affixes: []`, never `null`.
- [ ] `openapi.yaml` + generated client regenerated and match §API surface; `make gates`' contract
      gates pass (additive; the seam gate's existing red on legacy wallet writes is not this slice's).
- [ ] Wire tests (`wire_test.go`, listing model tests) cover the new fields.

## Blocked By

I-4R9M9-1 (instance/summary proto fields), I-4R9M9-2 (unique effect fields).

## Spec Reference

FS-4R9M9 §Requirements 57–58; §API surface (all rows and field tables); §Acceptance Criteria
"Protocol, gateway, client" row 2. User Stories 21, 23.

## TDD Approach

- RED: wire test — a proto `ItemSummary` with two affixes maps to a wire summary with both.
- GREEN: wire fields + mapping; regenerate.
