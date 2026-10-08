---
id: I-77AB6-11
status: done
implements: FS-77AB6
blocked_by: [I-77AB6-10]
labels: [ready-for-agent]
title: "Review fixes: client actions reach the world through the tick; equip ownership; one slot list"
---
Implements FS-77AB6 §Requirements 1–7 (all damage on the tick), FS-F6F88 §16 (floor change atomic w.r.t. the tick), FS-4R9M9 R42 (ring equip) — code-review findings.

**Domain:** game-service (game/session.go handlers + step, systems/combat.go intent read, gear.go slot list). · **Lane:** agent (user approved, 2026-10-09).

## What to fix
1. **HIGH — equip without ownership crashes the process / duplicates items.** `handleEquip` (session.go ~1588-1796, ring case ~1766-1796; `removeItem` ~1828 does `make(..., len-1)`) never checks the item entity is in the delver's own `ItemIDList`. Equipping a ring id from a drop pile with an empty satchel panics (`makeslice: cap out of range`, no recover → whole game-service down); with a non-empty satchel the item is worn from the pile and can be extracted twice. Refuse unless the id is in the delver's ItemIDList (or already worn for unequip), for EVERY slot; make removeItem safe on a missing id.
2. **MED — handler/tick races.** Message handlers (manageClientMessages goroutine) mutate the world unlocked while the tick reads it: `AttackIntentComponent.Pending` append (session.go:1960) vs swap-to-nil (combat.go:225-227) loses attacks; handleEquip writes equipment slots/ItemIDList read every tick by GearSystem/snapshot/mitigation/serializer; handleInteract/loot during `regenerateFloor` (session.go:2531-2564) can lose carried items or leak chest items across floors. Make world mutations from client messages go through one session-owned, mutex-guarded intent queue drained at the start of `step()` on the tick goroutine (attacks/casts, equip/unequip, interact/loot, stairs). Keep reply/refusal frames behaviour unchanged.
3. **MED — one equipment slot list.** The 10 slots are hand-written in 4 places (session.go:2622-2627 floor keep rule, gear.go wornSlots, handleEquip, getRawMatchState). Make one canonical list used by all four so a new slot can't be silently deleted on a climb.

## Acceptance Criteria
- [ ] Crafted equip of a pile/other-delver item id is refused for every slot, with no panic and no duplication.
- [ ] A test drives handlers concurrently with `step()` under `-race` (attack, equip, interact during a floor change) with no race and no lost attack.
- [ ] One slot list; floor keep rule, gear, equip and extraction all use it.
- [ ] Suite green apart from known pre-existing failures.
