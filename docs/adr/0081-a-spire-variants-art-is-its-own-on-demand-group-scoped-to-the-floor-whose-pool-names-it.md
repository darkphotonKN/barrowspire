# ADR-0081 — A Spire variant's art is its own on-demand group, scoped to the floor whose pool names it

Status: accepted
Date: 2026-11-14
Scope: `game-client`'s run art (`src/render/art/`, the monster roster, BarrowspireScene) and one
optional list on game-service's `floor_map` message. Not the bake's format, the manifest's
format, the HTTP contract, or any group but the Spire's variant groups.
Specified by [FS-C8VM7](../specs/C8VM7-tiered-enemy-roster-and-floor-pools.md) §G R40-R44.
Amends: [ADR-0071](0071-the-blood-demons-art-is-its-own-group-fetched-on-demand-when-one-first-appears.md)
Decision 2 (what triggers a fetch) and Decision 4 (eviction only with the scene), for variant
groups only; this is the new ADR its Decision 6 asks for when a fetch's trigger changes.
[ADR-0060](0060-the-floor-map-is-sent-once-and-snapshots-are-cut-per-recipient.md) Decision 1
(the floor map carries the static layout) gains one non-layout list; its Decision 8 (room roles
stay server-only) stands. [ADR-0059](0059-scene-scoped-atlas-groups-are-evicted-with-their-animations-once-the-next-scene-has-loaded.md)
stands for every other group.

## Context

Settled at write-a-spec for FS-C8VM7 on 2026-11-14, under the owner's charter ("lock it",
2026-11-14), which left open how per-pool loading works ("likely an extension of ADR-0071's
on-demand groups"). Recorded without adversarial review: no `challenge-me` pass was run.

Forces:

- **Too much art to load with the run.** FS-C8VM7 adds 24 sheets (11 recolours of the old
  families, 13 on three new rigs). Today's `creatures` group holds 5 sheets on 5 pages of about
  114 MB decoded (width × height × 4 from `public/art/manifest.json`), about 23 MB a sheet.
  Loading all 24 with the run would add about 550 MB to a run that already holds about 397 MB.
- **A floor only shows its pool.** Each Spire floor draws a pool of 5 variants and spawns only
  those (FS-C8VM7 §C). The server knows the pool when it builds the floor, before it publishes
  the floor map (`session.go`: `populateMonsters` then `publishFloorMap`).
- **A floor climb is not a scene change.** ADR-0071 Decision 4 keeps an on-demand group for the
  rest of the scene. On a deep run, floors of 5 variants each would over a few floors hold most
  of the 24 sheets: the 550 MB the pool exists to avoid.
- **Fetching on sight alone shows stand-ins on every floor.** On a dungeon floor a monster is
  first listed within the 1600 px interest radius (ADR-0060 Decision 4); each first meeting of a
  variant would draw its stand-in while its pages download.
- **Height is server-only** (FS-M8CSE). Anything sent only on the top floor (its champion) would
  tell the client the floor is the top.
- **ADR-0071 already gives the shape**: a group of its own, a named stand-in on a group the scene
  holds, re-dressing in place, cancellation with the scene, one warning on failure.

## Decision

1. **Every Spire variant beyond the five tier-1 looks is in an atlas group of its own**, named by
   its variant id; a goblin variant's two looks share one group. The tier-1 looks stay in
   `creatures`, loaded with the run, because they are always unlocked and are the stand-ins.
2. **The floor map names the floor's pool.** A dungeon floor's `floor_map` carries an optional
   `enemy_pool`: every archetype id the floor's pool can spawn. It never names a boss: not the
   champion, the blood demon, Daa'gon or a summoned demon, so it says nothing of the floor's
   place in the run.
3. **A new floor's map triggers the fetch.** On a floor map for a new floor, the client fetches
   the groups of the pool's archetypes it does not hold, on the scene's loader, with no bar or
   fade (ADR-0071 Decision 5). ADR-0071 Decision 2's trigger also stands for variant groups: a
   variant listed in a snapshot whose group is neither held nor named by the floor's pool (a
   champion; any variant in a scene with no pool) is fetched on that first listing.
4. **A new floor's map evicts what it does not name.** On the same map, every held variant group
   the new pool does not name is evicted, animations first, as ADR-0059 evicts; a group both
   floors name is kept, and a download for a group the new pool does not name is called off as a
   stopped scene's is. A floor change has already cleared the old floor's monsters, so nothing
   drawn uses an evicted group. Leaving the run evicts every variant group with the scene.
5. **Stand-ins as ADR-0071 Decision 3**: until its group is in, a variant draws its family's
   tier-1 look, a new family's named stand-in on `creatures`, under a canvas-palette tint where
   one is named, at its own tier; never the placeholder and never nothing; re-dressed in place on
   landing.
6. **Scope.** Only variant groups are floor-scoped. The blood demon's group keeps ADR-0071's
   scene scope; every other group keeps ADR-0059's. A new variant joins by a table entry (its
   group, its stand-in), as ADR-0071 Decision 6 allows. Changing the trigger again, or scoping
   another kind of group to the floor, needs a new ADR.

## Consequences

- **A floor holds its pool's art, not the roster's.** Estimated at about 23 MB a sheet: a pool
  of five is about 115 MB, up to about 160 MB with two goblin variants (two sheets each), plus
  about 25 MB for a champion on the top floor. Re-measure once the 24 sheets are baked; brutes'
  sheets are larger than fodder's.
- **Stand-ins are rare.** The fetch starts as the floor's map arrives, while the arrival card
  plays and before any monster is in the 1600 px interest radius; a slow connection still sees
  stand-ins, which are still the right family.
- **A floor change costs a fetch and a decode.** A variant on consecutive floors is kept; one that
  returns after a floor without it is fetched again, usually from the browser's HTTP cache.
- **The floor map carries one non-layout field.** It is optional; a client that sees no
  `enemy_pool` falls back to fetching on sight and evicts nothing per floor. A modified client
  learns the floor's pool, which it would learn on sight anyway.
- **The coverage test learns floor-scoped groups**: a variant look passes only with a stand-in on
  a group every Spire floor holds.
- **Code-review can flag** a variant sheet packed in `creatures` or `boss`, a variant drawn as the
  placeholder, a floor map that names a boss, or a variant group surviving a floor whose pool does
  not name it.
