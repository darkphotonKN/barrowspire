---
id: I-4R9M9-15
status: done
implements: FS-4R9M9
blocked_by: [I-4R9M9-1]
labels: [ready-for-agent]
title: "FS-4R9M9 slice 15: Extracted loot reaches its owner's inventory"
---
Implements FS-4R9M9 §Acceptance Criteria (Catalogue and storage: "An extraction event's item level, required level and affixes are stored") — prerequisite fix: today no extracted item is stored at all.

**Domain:** game-service + items-service · **Touches `internal/game/session.go`:** **yes** — `endSession` ordering only. · **Lane:** agent-ready (the user explicitly approved agent work here, 2026-10-09).

## Why

Added by the orchestrator after I-4R9M9-1 found that extraction is broken end to end; the user chose
"fix now as an item issue". Two independent defects, either one sufficient to lose all run loot:

1. **game-service:** `endSession` calls `ReturnPlayersToHub` (which `RemovePlayer`s every delver's
   entity) **before** `getRawMatchState`, so the `ItemsExtracted` / `GameMatchEnded` payloads carry no
   players or items. (Also noted in FS-F6F88 / FS-77AB6 watch notes.)
2. **items-service:** `ConvertSingleProtoItemtoItemInstance` / `MapProtoEquipmentToItemInstances` never
   set `TemplateID` (although `events.Item.template_id` is sent), `OwnerMemberID`, `Source` or `Status`,
   so the batch upsert violates the `template_id` FK and the `source` / `status` CHECKs.

## What to Build

- **game-service:** snapshot the match state (`getRawMatchState`) **before** any delver is removed from
  the run; publish from the snapshot. Keep the change to the ordering in `endSession` (plus a helper in a
  new file if needed). Don't change who extracts: every delver's gear still extracts as today
  (forfeit-on-death stays parked, user decision 2026-10-08).
- **items-service:** the extraction mapping sets `TemplateID` from `events.Item.template_id`,
  `OwnerMemberID` from the event's player, `Source = 'extracted'`, `Status = 'AVAILABLE'`; brought-in
  items (with `instance_id`) keep their stored owner, source, rarity and roll (never re-rolled). Item
  level, required level and affixes are carried as I-4R9M9-1 stores them.
- One end-to-end-shaped test per side without a live backend: game-service asserts the published
  payload of a resolved run contains each delver's equipment and satchel; items-service asserts the
  mapped rows satisfy the FK/CHECK-relevant fields (and the repo test under `ITEMS_TEST_DSN`, skipped if
  unset).

## Acceptance Criteria

- [ ] A resolved run publishes `ItemsExtracted` containing every delver's equipped and carried items (test drives a session to resolution and captures the publish).
- [ ] Mapped instances carry template id, owner member id, `source='extracted'`, `status='AVAILABLE'`, and the I-4R9M9-1 fields; brought-in items keep their instance id and stored owner/source.
- [ ] With `ITEMS_TEST_DSN` set, a two-item extraction batch inserts without FK/CHECK errors (skipped otherwise — report it).
- [ ] Existing suites green.

## Out of Scope

Forfeit-on-death / gear escrow (parked). `StartedAt`/`EndedAt` timing TODO. FS-QG1HR D5 beyond what already landed.
