# FS-BDRTJ: Dev test room

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Field worlds" and `game-client/SPECIFICATION.md` "### Dev tooling" → this FS · Related ADRs: [ADR-0030](../adr/0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md) (field channels), [ADR-0031](../adr/0031-field-visits-settle-as-match-ended-with-a-world-type-consumers-skip-fields.md) (visit settlement, which this room skips) · Builds on: [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md), [FS-0XMCP](0XMCP-hub-destination-gates.md) · Surface: game-service and game-client only

Scoped 2026-11-07 under a charter. Every decision here is a *charter default*, locked with the user before writing, except the notes marked *(from code)*, which record what reading the code showed the decisions need. Throwaway-grade dev tool: no polish.

## Summary

A dev-only field world where a developer tries a build against enemies by feel. They walk in through a hub gate, dress from chests of top gear at level 20, hit enemies that stand still and come back, and walk out with their real character exactly as it was. It never reaches players.

## Requirements

**Guards**

1. Server: on only when `strings.EqualFold(environment, "development")`, using `environment` from `cmd/server/main.go` (default `"production"`). No new env var, and not the lookup in `config/routes.go`, whose default is `"development"`. Unset, a typo and `production` are all off. It reaches the server as a boot option whose zero value is off (`SetupRouter` takes the bool from `main`).
2. Client: on only when `process.env.NODE_ENV !== "production"`, with no override.
3. Server off: no room built, no gate in the hub, `enter_field` answers `unknown_field`. Client off: a dev gate in a hub's state is ignored, with no label and no `enter_field` *(from code: a production-built client can meet a server that is on)*.

**Entry**

4. A new `GateDestination` `dev_test_room`, on a hub gate at about (120, 900), arrival (260, 900): clear of every wall, NPC and resident region. It reuses the field gate walk-in. It is added only when on, and kept out of `hubGates` *(from code: that table feeds the golden and lane tests)*.
5. A plain text label stands at the gate so it can be found. The field-name sign is not used for it *(from code: `signpostOf` picks the nearest signpost at any distance, which here is the Forest's)*.

**Room**

6. A field `dev_test_room`, 900x600, in the Meadows look, entrance (40, 300), arrival (180, 300). Registered only when on.
7. Its place has an empty layout, no creature table, `DropFactor` 0 and no `ChestRestockDelay` *(from code: a delay would make `restockFieldChests` wipe the chests; an empty layout leaves `fieldPopulation` holding nothing)*.

**Character**

8. Seated at `progression.MaxLevel` (20), on the room's body only. The level is set on the copy of the character passed to `SeatVisitor`. The real character and the record are untouched.
9. Entering makes no items-service call: no gear checkout, real gear left behind, the body starts naked. `SeatVisitor` gets an empty, non-nil loadout *(from code: a nil one is refused as `ErrNoLoadout`)*.

**Leaving**

10. `settleVisit` returns at once for this field: no outbox write, no XP or item write, no `ApplyRunProgress`. This is what keeps test items from ever reaching inventory.

**Items**

11. A fixed list in code, built with `CreateItemEntity`, with no rolls, no instance ids, in ECS memory only: top-tier weapons and armor at max affix values, rings, and all six uniques (`knownUniqueEffects`). Values are copied from `items-service/migrations/000024_catalogue_tiers_rings_and_uniques.up.sql` and the loot tuning; items-service itself does not change.
12. They stand in pre-opened chests (`IsOpen` and `HasBeenOpened` true, so nothing rolls), one each for weapons, armor, rings and uniques, near the arrival point.
13. A taken item reappears in its chest 2s later. The channel never shuts down.

**Enemies**

14. Level 20 Troll, elite Troll and Demon boss in the middle of the room, about (450, 150), (450, 450), (450, 300).
15. Each has its Velocity component removed at spawn. `MonsterAISystem` already skips those, so they never move or strike, and `resolveCollision` ignores them, so they can be walked through. No system changes.
16. 2s after death: the corpse is removed and a new one spawned the same way *(from code: this is ahead of `MonsterCorpseLifetime`, 4s; a corpse already gone is not an error)*. One call in `step` in `session.go`; the rest in a new file.
17. No drops. XP earned is discarded with the visit (`gainExperience` never lowers a level, so a body at 20 stays at 20).

## User Stories

1. As a developer, I want a gate in my dev hub, so that I can reach the room without any setup.
2. As a developer, I want every top item at hand at level 20, so that I can try any build at once.
3. As a developer, I want enemies that stand still and come back, so that I can keep hitting them and judge the build by feel.
4. As a developer, I want to leave with my real character unchanged, so that testing never touches my progress or inventory.
5. As a player, I never see this room, so that test gear cannot reach the game.

## Acceptance Criteria

- [ ] Off (unset, `production`, a typo): no room, no hub gate, `enter_field` answers `unknown_field`.
- [ ] On (`development`, `DEVELOPMENT`): the gate is in the hub state and walking in enters the room.
- [ ] Entering makes no items-service call, and the body is level 20 and naked.
- [ ] Every way out (leave, disconnect, leave_hub, enter_hub, normal close, and an entry aborted after seating) publishes no field visit and applies no progress. The record keeps its real level, XP and gear.
- [ ] The three enemies never move or strike, and can be walked through.
- [ ] A killed enemy is replaced 2s later, with no drop.
- [ ] Each listed item is in its chest with nothing rolled, and a taken one is back 2s later.
- [ ] No files change outside game-service and game-client.
- [ ] Client on: the label shows, the gate enters the room, and the room draws at 900x600 in the Meadows look with Troll and Demon art.
- [ ] Client with `production`: no label, and no `enter_field` from the gate.

## Edge States

- **Disconnect or leave mid-room:** the visit ends the usual way, unsettled. Worn items leave with the body and the chests are unaffected.
- **Two developers in one channel:** they share enemies and chests. A taken item restocks for the next one.
- **Items dropped on the ground:** they stay in memory in this channel until the pod restarts.
- **Server off, client on:** the hub state carries no gate, so nothing shows.

## Out of Scope

DPS meter, keybind, randomizing, polish, agent playtesting. Any change to items-service, character-service, proto, migrations, deploy manifests, the combat, gear or monster systems, or the matchmaker.
