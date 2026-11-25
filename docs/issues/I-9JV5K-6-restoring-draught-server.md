---
id: I-9JV5K-6
status: open
implements: FS-9JV5K
blocked_by: []
labels: [ready-for-agent]
title: FS-9JV5K slice 6: the Restoring Draught template, the merchant's ware and drinking it
---
Implements FS-9JV5K §Change: The Restoring Draught

## What to Build
The server half of the draught, added the way the antidote was (commits 83977105, 12da9a2e,
0c0887e7 are the pattern):
- items-service: `migrations/000033_restoring_draught_template.{up,down}.sql` with fixed ids, and a
  migration test beside `internal/items/antidote_migration_test.go` (D1).
- game-service: the item pool holds the draught apart from loot by its name (as `IsAntidote` /
  `pool.Antidote`); the merchant's third ware `WareRestoringDraught` at `MerchantDraughtPrice` 50,
  `MerchantDraughtStock` 3 (D2); `use_item` drinks it: +50 % of the pool's max (rounded down, at
  least 1), capped, spent; `resource_full` refusal (D3–D4). The ware kind on the wire is a new
  string value only.
- `game-server/scripts/seed-dev.sh`: the template count excludes the draught too (D5).

## Acceptance Criteria
- [ ] The FS section's items-service, game-service and seed-dev criteria.
- [ ] `make test` in items-service (unit; the DB test is opt-in) and `make test` + `make check` in
      game-service green.

## Blocked By
None

## Spec Reference
FS-9JV5K §Change: The Restoring Draught D1–D5, Acceptance Criteria (server rows), Edge States.
