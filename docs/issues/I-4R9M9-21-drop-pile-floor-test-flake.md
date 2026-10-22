---
id: I-4R9M9-21
status: done
implements: FS-4R9M9
blocked_by: []
labels: [ready-for-agent]
title: "Test fix: the floor-change drop-pile test no longer depends on luck"
---
Implements FS-4R9M9 §Requirements 44–46 and §Edge States ("no template of a type at the ilvl … that item is skipped with a warning and the other items still drop") — /diagnose finding 2026-10-10.

**Domain:** game-service tests only (internal/game/monster_drops_test.go). · **Lane:** agent.

## Diagnosis
`TestRegenerateFloor_ClearsDropPilesAndTheirItems` (monster_drops_test.go:296) fails ~2.4% of runs (5/300; seed scan 44/2000, e.g. PCG seeds 87, 113, 151, 166, 188). Its run is built by `newRun(t, &countingItemsClient{})`, whose catalogue `lootTemplates(true)` (session_items_test.go:82-92) has no ring. The demon's split (loot_tuning.go:192-209) rolls rings 20%; when all 2–3 rolled types are ring, `dropLoot` skips them (chest_loot.go:53-60) and `monster_drops.go:40-42` correctly places no pile (R46). The test asserts a pile always appears and drives kills through `publishKills` with the unseeded global random source. Product behaviour is correct; the fixture is incomplete.

## What to change
- In that test only, right after `s := newRun(t, &countingItemsClient{})`, give the run a ring template (`s.itemPool.Rings = []lootTemplate{ironBand}`) as the real catalogue has, and tighten the pile-size assertion to 2–3 items. Do NOT add a ring to the shared `lootTemplates(true)` (item_pool_test.go, session_items_test.go, chest_loot_test.go count it).
- Add a test pinning the partial-skip edge state: a demon with an empty ring pool and a stub random source whose type rolls give weapon, ring, armor still places one pile holding 2 items.

## Acceptance Criteria
- [ ] `go test -count=1000 -run TestRegenerateFloor_ClearsDropPilesAndTheirItems ./internal/game/` → 0 failures.
- [ ] Partial-skip edge-state test passes and fails if skipped items abort the pile.
- [ ] No product code changes.
