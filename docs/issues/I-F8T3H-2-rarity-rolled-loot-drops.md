---
id: I-F8T3H-2
status: done
implements: FS-F8T3H
blocked_by: []
labels: [ready-for-agent]
title: "FS-F8T3H slice 2: rarity-rolled loot drops"
---
Implements FS-F8T3H §Requirements (R5–R15), §Edge States

## What to Build
- One small pure roll file in game-service (rarity pick weighted by `drop_rate_multiplier`, stat roll R8/R9, name roll R10) with an injectable random source.
- Load rarities at session start via items `ListItemRarities` (add to the game-service items client interface); fall back to unscaled/unrenamed drops if unavailable (R5).
- Fix the loot-path defects R13–R15 (swapped pools, loop bounds, empty-pool panic).
- Carry the rolled rarity id: ItemConfig → ItemComponent → extraction → new `rarity_id` field on `events.Item` in `common/api/proto/events/game.proto` (regenerate, never hand-edit) → items-service consumer writes `item_instances.rarity_id`; empty = NULL.

Name roll uses **exactly** these word lists (shared verbatim with I-F8T3H-1's seed):
- weapon prefixes: Keen, Notched, Blackened, Grim, Weeping, Barrow-touched
- armor prefixes: Stout, Weathered, Ashen, Grave-cold, Riveted, Tarnished
- suffixes (rare): of Ashes, of the Wight, of the Barrow, of Thorns, of the Fen, of Mourning
- grand suffixes (runed, fabled): of the Last King, of Barrowspire, of the Drowned Crown, of the First Dark, of the Hollow Oath, of Old Blood
- consumables: never affixed; only healing scales.

## Acceptance Criteria
- [ ] Roll unit tests (seeded rand): weights respected over many samples; per-tier stat ranges; crit clamp [0, 0.50]; base 0 stays 0; name form per tier; consumables unaffixed.
- [ ] Tests: `InitializeItems` pools correct; `generateItems` exact per-type counts; empty single-type pool doesn't panic and other types still drop.
- [ ] Rarities unavailable → drops still happen, unscaled, base name.
- [ ] `events.Item.rarity_id` exists (regenerated); consumer persists it; empty → NULL; loadout re-extractions keep their stored rarity.
- [ ] `go test ./...` green in game-service and items-service.

## Blocked By
None for code. At runtime, real drops need I-F8T3H-1's rarity migration applied.

## Spec Reference
FS-F8T3H §Requirements R5–R15; user stories 2–11, 14–16, 24; §Edge States.
