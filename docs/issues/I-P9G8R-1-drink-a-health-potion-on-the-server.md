---
id: I-P9G8R-1
status: done
implements: FS-P9G8R
blocked_by: []
labels: [ready-for-agent]
title: "FS-P9G8R slice 1: drink_potion heals a delver and uses up the potion"
---
Implements FS-P9G8R §A (Requirements 1–12), §WebSocket message surface

**Lane: agent** (game-service). Foundation slice: the server half of the drink, end to end, with
no settlement yet (slice 3 carries the consumed record onto the extraction event).

## What to Build

- **The action.** `ActionDrinkPotion Action = "drink_potion"` beside `ActionForfeitRun` in
  `game-service/common/constants/game.go`. Do not reuse the dead `ActionUseItem`.
- **Routing on the hub loop, identity from the connection** (R2): a `case
  constants.ActionDrinkPotion` in `internal/gameserver/hub.go` beside `forfeit_run`, taking the
  player from `GetPlayerFromConn`, ignoring the payload. Not added to the `gameActions` map (that
  path reads `player_id` from the payload). Add `DrinkPotion(player *types.Player)` to the hub's
  `SessionManager` interface; `Server.DrinkPotion` (in `internal/gameserver/server.go`, beside
  `ForfeitRun`) resolves the player's current world and does nothing unless it is a run (R3).
- **The run queues it** (R4): a `Session` method (e.g. `Drink(playerID)`) that only
  `queueIntent`s the drink; every check runs when the intent applies on the tick.
- **The drink** (R5–R8): lowest of Consumable1→2→3 holding a health potion (consumable,
  `HealingAmount > 0`); refused silently (debug log, no reply) when not `systems.InPlay`, at full
  health, on cooldown, or with no health potion; otherwise `CurrentHealth = min(MaxHealth,
  CurrentHealth + HealingAmount)`, the item entity removed, the slot set to nil.
- **Cooldown** (R9): 1.0 s of simulation time per delver, shared across slots, started only by an
  allowed drink, counted down on the tick (deltaTime), never wall clock.
- **Consumed record** (R10–R12): when the drunk item has an `InstanceID`, append it to a record on
  the delver's entity. Cooldown and record are plain data in a new component (new
  `ecs.ComponentType`); the decision and the countdown are behaviour (a system or session
  function), not component methods. Add the component lazily on first drink or at body build;
  either way it must survive a floor change (player entities are kept by `persistentEntityIDs`).
- Keep the drink logic out of `session.go` where possible (a new `internal/game/drink.go` or
  `internal/systems/potion.go`); `session.go` should only gain the thin `Drink` method and, if
  needed, one call in `step()` for the countdown.

## Acceptance Criteria

- [ ] A delver in play, below max, off cooldown, with a health potion in Consumable1 is healed by
      its `HealingAmount` on the next tick; the item entity is gone and Consumable1 is nil.
- [ ] The heal caps at `MaxHealth`.
- [ ] Consumable1 empty or a mana potion, health potions in 2 and 3 → slot 2 is drunk.
- [ ] Refusals change nothing (health, slots, entities, cooldown, record) and send nothing: full
      health; dead; escaped; left behind; on cooldown; no health potion; hub; field; no world.
- [ ] Two drinks in one tick drink one potion; table test on the cooldown boundary (0.99 s
      refused, 1.0 s allowed).
- [ ] The drinker is the connection's player regardless of any `player_id` in the payload.
- [ ] A stored-loadout potion (with `InstanceID`) is recorded as consumed; an in-run looted one
      (nil `InstanceID`) is drunk but not recorded.
- [ ] The record and cooldown survive a floor change.
- [ ] `go test ./...` and lint pass in game-service.

## Blocked By

None.

## Spec Reference

FS-P9G8R §A Requirements 1–12; §Acceptance Criteria "Drinking (game-service)"; §Edge States
(concurrent presses, drink and lethal hit on one tick, floor change, run resolved, unauthorized,
hub / field); User Stories 1–9, 14, 19, 25, 26, 28.

## Files expected

- `game-server/game-service/common/constants/game.go` (the action)
- `game-server/game-service/internal/gameserver/hub.go` (case + `SessionManager` interface)
- `game-server/game-service/internal/gameserver/server.go` (`Server.DrinkPotion`)
- `game-server/game-service/internal/game/session.go` (thin `Drink` method; countdown call in `step()`) **hotspot, shared with slice 3**
- `game-server/game-service/internal/game/drink.go` or `internal/systems/potion.go` (new: the decision and countdown)
- `game-server/game-service/internal/components/potion.go` (new component) and `internal/ecs/entity.go` (component type)
- tests beside each (`*_test.go`); any hub test fakes implementing `SessionManager` gain `DrinkPotion`

## TDD Approach

- RED: a session test seating a delver at 50/100 health with a 25-heal potion in Consumable1,
  queuing a drink and stepping one tick, expecting 75 health, Consumable1 nil and the item entity
  gone.
- GREEN: the `Drink` intent and the drink function; then the refusal table, then the cooldown,
  then the consumed record, then the hub routing.
