---
id: I-4R9M9-16
status: done
implements: FS-4R9M9
blocked_by: [I-77AB6-11]
labels: [ready-for-agent]
title: "Review fixes + user decisions: rarity load, item_type on the wire, one trail, Vitality, retaliation leash"
---
Implements FS-4R9M9 R36/R40/R54, FS-77AB6 R26, FS-BDA7X R19 — code-review findings and USER DECISIONS of 2026-10-09 (these decisions supersede the FS text where they differ; note them in the FS when it is next touched).

**Domain:** game-service. · **Lane:** agent (user approved).

## What to fix
1. **MED — rarity loading.** `game/loadout_item.go:59-63` `seatingRarities` calls ListItemRarities(context.Background()) while `addPlayerLocked` holds `s.mu` (no deadline; hub retries every seat if empty) and lazily writes `s.lootRarities` that the tick reads unlocked (monsterDrops→dropLoot). Load rarities once at session build with a timeout ctx; never write lootRarities after the loop starts.
2. **MED — `item_type` on ItemState.** Add `item_type` to game-service `types.ItemState` for every item (additive R54) so the client stops guessing "ring" for statless items.
3. **USER DECISION — retaliation vs leash (FS-77AB6 R26).** A monster's retaliation target is exempt from the leash until the monster has closed inside its leash radius of that target once; then normal leash applies. No free kills from beyond the leash (arrows 550 > troll leash 480). Update `TestMonsterAISystem_OldHit_IsNotAnsweredTwice` accordingly.
4. **USER DECISION — one burning trail per wearer (FS-4R9M9 R36).** A new Ashwalk dash replaces the wearer's previous live trail.
5. **USER DECISION — Vitality adds max HP.** Vitality (base class stat, per-level growth, gear/floor_attributes bonus) adds max HP via one tuning constant (default +5 max HP per point) in the tuning table. Never heals; follows the existing AppliedMaxHealth delta rules (gain never heals, loss clamps). Seated delvers still start at full.

## Acceptance Criteria
- [ ] Tests per item; rarity load has a deadline and no lazy write; a statless non-ring is not called a ring by the server wire; a kiting archer beyond the leash is chased; one live trail per wearer; +N Vitality raises max HP by N×constant without healing.
- [ ] Suite green apart from known pre-existing failures.
