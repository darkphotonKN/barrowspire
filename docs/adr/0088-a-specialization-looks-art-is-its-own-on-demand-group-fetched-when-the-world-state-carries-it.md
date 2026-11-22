# ADR-0088 — A specialization look's art is its own on-demand group, fetched when the world state carries a player with that specialization

Status: accepted
Date: 2026-11-21
Scope: `game-client` only: which atlas group each spec look's sheet is packed in, and when a world
scene loads it (`src/render/art/` and its scene art table, the world scenes' `preload()`, the
player bodies' roster). Not the server, the wire (FS-E1ZDG puts `specialization` on it), the bake's
format, the manifest's format, or any group but the eight spec-look groups.
Specified by [FS-1J1CB](../specs/1J1CB-specialization-looks.md) §C R18-R24 (R27 the memory).
Amends: [ADR-0059](0059-scene-scoped-atlas-groups-are-evicted-with-their-animations-once-the-next-scene-has-loaded.md)
Decision 1 ("the four class groups ... resident"): the class groups stay resident, but a player
body's art is no longer only resident; a spec look's group is scene-scoped and on demand.
[ADR-0071](0071-the-blood-demons-art-is-its-own-group-fetched-on-demand-when-one-first-appears.md)
Decision 2 (a fetch is triggered by a monster archetype in a snapshot): this is the new trigger its
Decision 6 reserves for an ADR, for spec-look groups only. ADR-0059 Decisions 3-5, ADR-0071
Decisions 3 and 5, and [ADR-0081](0081-a-spire-variants-art-is-its-own-on-demand-group-scoped-to-the-floor-whose-pool-names-it.md)
stand unchanged.
Builds on: ADR-0071 and ADR-0081 (the on-demand shape: a group of its own, a stand-in on a group
the scene holds, the swap in place, cancellation with the scene), [ADR-0086](0086-which-interface-goes-in-the-ui-scene-and-which-stays-in-the-world.md)
Decision 2.1 (a body drawn at a world position is the world's)

## Context

Settled at write-a-spec for FS-1J1CB on 2026-11-21 as the spec's v1 (R18, "the ADR-0071/0081
pattern"), recorded under the owner's charter approval of 2026-11-21. Recorded without adversarial
review: no `challenge-me` pass was run.

Forces:

- **Eight new player sheets.** FS-1J1CB §A gives each of the eight specializations (FS-E1ZDG) a look
  of its own: a re-dress of its class's figure on the same rig and clips, baked as
  `char_<base>_<spec>`, alone in group `<base>_<spec>` (R15). Estimated from today's manifest, a
  look costs about what its class does (the knight's 45.4 MB, the archer's 41.1, the wizard's 32.9,
  the mercenary's 45.0 decoded), the Berserker's about 70 MB with its off-hand clips, and all eight
  about 370 MB (R27).
- **ADR-0059 made every class group resident** because any world may draw any class (other
  players, the party busts). Making the looks resident the same way would add about 370 MB to
  every scene, the menus included (more than twice the four class groups' 164.4 MB together), for
  looks that a game with no level-20 player never draws.
- **The client learns a body's specialization only from the world state.** `current_player` and
  every `other_players` entry carry `specialization` once picked (FS-E1ZDG §B.9); nothing tells
  the client ahead. The selected character's read also carries it (FS-E1ZDG §B.6), so the
  player's own look is known before the world scene starts.
- **A player's own figure is the one they watch.** A stand-in on someone else is a moment's
  plainness; on yourself it reads as the pick not having taken.
- **A specialization can appear mid-scene.** The pick takes effect when FS-8RZ51 applies the
  spend to the character in play (FS-E1ZDG §B.8, ADR-0082), so a body can change look while the
  scene runs.
- **The base class sheet is already the right stand-in.** It is resident, it is the same rig and
  silhouette, and it is what every specialized body drew before FS-1J1CB. No tint is needed: the
  class still reads, only plainer.
- **The interface now lives in a separate scene.** The UI scene (ADR-0084) is launched once and
  survives every world switch; ADR-0086 Decision 2.1 keeps anything drawn at a world position and
  following a world object (a player body) in the world scene. The party frames' busts are in the
  UI scene. A UI-scene object built on a scene-scoped group would outlive the world scene that
  holds the group, which ADR-0059 Decision 5 forbids.

## Decision

1. **Each spec look's sheet is its own atlas group, scene-scoped and on demand.** No spec-look
   group is resident, and none is in any scene's declared preload set. The four class groups stay
   resident, as ADR-0059 Decision 1 has them. A game with no specialized player holds no
   spec-look art.
2. **The world state triggers the fetch.** A world scene (town, field, run) queues a look's pages,
   on its own loader while it runs, the first time a game-state snapshot carries a player
   (`current_player` or an `other_players` entry) with that specialization, whether or not that
   body is in sight. Two bodies with one look are one fetch. A specialization the client does not
   know, or whose look the manifest does not carry, fetches nothing and draws the base.
3. **The player's own look is preloaded with the world scene.** When the selected character's read
   carries a specialization, the world scene's `preload()` queues that look's group with the
   scene's declared groups, so after the boot bar the player's own body is never a stand-in. This
   is the one spec-look group a scene loads at entry, and it is decided per character at preload,
   not listed per scene. A specialization the read did not carry (a pick applied since) falls back
   to Decision 2.
4. **The base class sheet stands in until the group lands.** Until every page of a look's group
   is in and its frames are registered, its body draws its base class sheet, untinted; never the
   placeholder, never nothing, and with no placeholder warning. On landing, each such body is
   re-dressed on its own sprite with a new animator for the look's sheet, between one frame and the
   next, keeping its facing and its current clip's place (ADR-0071 Decision 3's swap). A body whose
   specialization first appears mid-scene is re-dressed the same way once its group is in.
5. **Eviction, failure and cancellation are the on-demand rules, unchanged.** A spec-look group
   is evicted by the next scene's completed preload, animations first (ADR-0059 Decisions 3-4),
   unless that scene preloads it (Decision 3); a floor change keeps it. A failed fetch leaves the
   base look for the rest of that scene with one warning and no retry; a fetch is called off with
   its scene (ADR-0071 Decision 5).
6. **Spec-look art is drawn by world scenes only.** The UI scene, the menus, the character list,
   character creation and the party frames' busts draw the resident class sheets. A UI-scene piece
   may never build on a spec-look group, because the UI scene outlives the world scene that holds
   it (ADR-0059 Decision 5). Showing a look there is a new decision, not a table change.
7. **The scene art table names every look.** `sceneArt.ts` lists one row per look (its group, the
   class and specialization that fetch it, the base class sheet as its stand-in) beside
   `ON_DEMAND_ART`, and the coverage test holds each stand-in to a resident group. A new look joins
   by a row, as ADR-0071 Decision 6 allows. Changing what triggers a spec-look fetch, preloading
   other players' looks, or a stand-in other than the resident base sheet needs a new ADR.

## Consequences

- **Spec looks cost nothing until someone wears one.** The menus, and any world with no
  specialized player, hold exactly what they held before FS-1J1CB.
- **A run holds at most four looks**, one per party member: up to about 205 MB by R27's estimates
  (the Berserker, the Guardian and both mercenaries), on top of the run's own groups. A run that
  meets the blood demon with such a party is the worst case and is not yet measured.
- **The town can hold all eight**, about 370 MB on top of the hub's groups, when eight looks are
  in it at once. Accepted for v1 (R27); a busy town is the first place to look again if memory
  bites. The browser check records the measured figures once the looks are baked.
- **Others' looks can be seen as the base for a moment.** While a teammate's or a stranger's look
  downloads, they draw their class's figure; on a slow connection a whole fight may pass so. The
  player's own body is spared that by Decision 3, at the cost of a download at world entry for
  every specialized character.
- **The animator is rebuilt once per specialized body per look per scene**, the swap cost
  ADR-0071 already accepted, paid only when a look lands or a pick applies.
- **Party busts stay plain.** A teammate's frame shows the base class bust even while their body
  wears the look; the title beside it (FS-E1ZDG) says what they became.
- **The coverage test (FS-C4JWH §E R21) gains eight rows**, and may list all eight before any is
  baked, because an unbaked look resolves to its base (FS-1J1CB R16, R26).
- **Code-review can flag** a spec-look group made resident or added to a scene's declared set, a
  spec look preloaded for anyone but the player's own character, a specialized body drawn as the
  placeholder or hidden while its look loads, a UI-scene piece built on a spec-look group, or a
  download that survives its scene's stop.
