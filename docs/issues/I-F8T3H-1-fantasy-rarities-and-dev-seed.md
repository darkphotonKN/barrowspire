---
id: I-F8T3H-1
status: done
implements: FS-F8T3H
blocked_by: []
labels: [ready-for-agent]
title: "FS-F8T3H slice 1: fantasy rarities and dev seed script"
---
Implements FS-F8T3H §Requirements (R1–R4, R16–R19), §Edge States

## What to Build
1. items-service migration `000020_fantasy_rarities` (up/down): purge space-era templates/weapons/armors/consumables/rarities (cascade, loudly commented) and insert the five R1 tiers with these fixed ids:
   `f8700000-0000-0000-0000-000000000001` normal … `…05` fabled (in sort order). Down restores the four 000009 rarities only.
2. `game-server/scripts/seed-dev.sh` per R16–R19: signup admin + aldric/brenna/corwin/dunstan `@barrowspire.dev`, promote admin via SQL + re-signin, POST the 24 R3/R4 base items via `complete-*` at the `normal` id, deposit 10,000 gold per player (retry for ADR-0014 lag), psql-insert ~20 `AVAILABLE` `reward` instances (all tiers ≥2, all item types), print email / member id / instance count.

Seed names and stats must be ones the R9/R10 roll could produce, using **exactly** these word lists (shared verbatim with I-F8T3H-2):
- weapon prefixes: Keen, Notched, Blackened, Grim, Weeping, Barrow-touched
- armor prefixes: Stout, Weathered, Ashen, Grave-cold, Riveted, Tarnished
- suffixes (rare): of Ashes, of the Wight, of the Barrow, of Thorns, of the Fen, of Mourning
- grand suffixes (runed, fabled): of the Last King, of Barrowspire, of the Drowned Crown, of the First Dark, of the Hollow Oath, of Old Blood
- consumables: never affixed; only healing scales.

## Acceptance Criteria
- [ ] Migration up leaves exactly the five R1 rarities and no space-era item rows; down restores the four old rarities.
- [ ] `seed-dev.sh` on a freshly migrated stack exits 0 with 1 admin, 4 players at 10,000 gold, 24 base items, ~20 instances covering all five tiers ≥2.
- [ ] Every seeded instance's name/stats fit R9/R10 for its tier and use only the lists above.
- [ ] Re-running doesn't duplicate members, base items or instances.
- [ ] Script is short; top comment says "fresh DB" and points at the roll rules (FS-F8T3H R9/R10).

## Blocked By
None

## Spec Reference
FS-F8T3H §Requirements R1–R4, R16–R19; user stories 12, 13, 17–23; edge states on seeding.
