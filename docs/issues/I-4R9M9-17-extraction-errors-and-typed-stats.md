---
id: I-4R9M9-17
status: done
implements: FS-4R9M9
blocked_by: []
labels: [ready-for-agent]
title: "Review fixes: extraction errors surface; extracted rows store only their type's stats"
---
Implements FS-4R9M9 R49/R50/R52/R59 — code-review findings.

**Domain:** items-service (internal/items/service.go, amqp consumer settle). · **Lane:** agent (user approved, 2026-10-09).

## What to fix
1. **MED — loot lost on a bad row.** `service.go:127` ignores `commonutils.ExecTx(...)`'s error and `ProcessItemsExtracted` always returns nil: one bad row rolls back the player's batch but the event is acked. Return the error so the consumer requeues/dead-letters it (check the consumer's settle logic does the right thing for transient vs malformed). Per-item validation that should SKIP (unknown template etc.) stays a skip-with-warning, not a batch failure.
2. **MED — stats stored for the wrong type.** `ConvertSingleProtoItemtoItemInstance` (~364-410) sets every stat pointer regardless of item type, storing 0/'' instead of NULL → listing detail shows "Defense 0 · Healing 0" on a weapon. Set only the item type's own stat columns (weapon: attack_power, critical_rate, weapon_type; armor: defense_rating, magic_resistance, armor_slot; consumable: healing/mana/buff; ring: none).
3. LOW (cheap, same file area): guard 000024's Fabled→Runed relabel against unique templates on a down→up cycle (`AND template_id NOT IN (SELECT id FROM item_templates WHERE rarity_id = '<fabled id>')`).

## Acceptance Criteria
- [ ] A batch failure is returned and not acked; skips stay skips.
- [ ] Mapped weapon/armor/consumable/ring rows carry NULL for stats not of their type.
- [ ] items-service `go test ./...` green (DB tests skip without DSN — report).
