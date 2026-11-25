---
id: I-9JV5K-2
status: done
implements: FS-9JV5K
blocked_by: [I-5FZ4J-5]
labels: [ready-for-agent]
title: "FS-9JV5K slice 2: the ANTIDOTE template and drinking it from the bag with use_item"
---
Implements FS-9JV5K §D R16–R17

**Hotspot:** game-service `session.go`, `gameserver/hub.go` (`gameActions` routing only; never the
matchmaker), `types/messages.go`. One writer at a time.

## What to Build

- items-service: an additive migration (next number, current pattern, with a down) adding the
  `ANTIDOTE` consumable and its template ("Antidote", common, no healing or mana), tradeable and
  droppable as a small potion.
- game-service: the template is kept out of the Spire's random loot pool (containers and kill drops),
  yet available to the session by code for the merchant (slice 3).
- `use_item { item_entity_id }` routed for runs and parsed; on the tick: an antidote in the user's
  bag while poisoned → FS-5FZ4J's cure, the item removed (consumed recorded for a seated item, as a
  drunk potion). Replies per R17 (`not_poisoned`, `not_in_bag`, `not_usable`, success).

## Acceptance Criteria

- [ ] Migration up/down present; a migration-shape test if the service has one.
- [ ] Over a seed sweep, no container or kill drop yields `ANTIDOTE`.
- [ ] `use_item` on a bagged antidote while poisoned ends poison and removes it; not poisoned → `not_poisoned` and kept; not in bag / not usable refusals.
- [ ] `make test` and `make check` green in game-service; `make test` in items-service.

## Blocked By

I-5FZ4J-5 (poison and its cure).

## Spec Reference

FS-9JV5K §D R16–R17.

## TDD Approach

- RED: a poisoned delver's `use_item` on a bagged antidote clears poison.
- GREEN: the use_item branch.
