---
id: I-77AB6-12
status: done
implements: FS-77AB6
blocked_by: [I-77AB6-11]
labels: [ready-for-agent]
title: "Re-review fixes: item pickup ownership/range check; loadout fetch deadline"
---
Implements FS-77AB6 §Requirements (server-authoritative interaction) and FS-4R9M9 R49 (one owner per item) — re-review findings N1 (HIGH) and N2 (MED) on 7539c79...4aa7c91. User approved (2026-10-09).

**Domain:** game-service (game/session.go handleInteract item-pickup branch ~1441-1510; addPlayerLocked loadout fetch ~827). · **Lane:** agent.

## What to fix
1. **HIGH N1 — pickup duplicates items.** The `isItemEntity` branch of `handleInteract` appends any item entity id to the caller's satchel without checking that the item lies in an open container (chest or drop pile) the delver is within interact range of, and that it is not carried/worn by any delver. Its "already carried" check compares entity ids against `targetItem.TemplateID` (never matches). Fix: only pick up an item that is currently in a container's ItemIDList, the container is open and within range (same range rule as other interactables), then move it (remove from the container, add to the satchel) atomically on the tick (intents already run on the tick since I-77AB6-11). Reply frames for existing valid pickups stay byte-identical.
2. **MED N2 — loadout fetch without deadline under the lock.** `GetLoadoutWithItems(context.Background(), …)` inside `addPlayerLocked` (called under s.mu by Admit/AddPlayer). Give it a bounded timeout ctx (same 3 s constant style as `rarityLoadTimeout`); on timeout, seat without the loadout (empty) and log a warning — never hold the lock indefinitely.

## Acceptance Criteria
- [ ] Crafted interact on another delver's carried or worn item, on an item in a closed or out-of-range container, or on a ground-less item id is refused and nothing moves; a valid pickup still works and the item leaves the container.
- [ ] A hanging items client at seat time returns within the timeout and the delver is seated without loadout.
- [ ] `go test -short -skip TestPublishMatchCompleteIntegration ./...` and -race on the new tests green.
