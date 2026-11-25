# ADR-0097 — A run NPC's art is its own on-demand group, fetched when the run state carries its key

Status: accepted
Date: 2026-11-25
Scope: `game-client` only: the wandering merchant's and the encounter cast's atlas groups and when
the run scene loads them (`src/render/art/sceneArt.ts` `NPC_ART` / `ENCOUNTER_ART`, the run scene's
merchant and encounter sets, the monster roster's fetch for `cutthroat` / `contract_mark`). Not the
server, the wire, the bake's format or the manifest's format.
Specified by [FS-9JV5K](../specs/9JV5K-wandering-merchant.md) §G R26 and
[FS-4EC7Z](../specs/4EC7Z-dungeon-encounters.md) §H R36.
Amends: [ADR-0071](0071-the-blood-demons-art-is-its-own-group-fetched-on-demand-when-one-first-appears.md)
Decision 2 (a group is fetched the first time a snapshot lists its monster) and Decision 6 ("changing
what triggers a fetch" needs an ADR): two more triggers, below. Builds on
[ADR-0088](0088-a-specialization-looks-art-is-its-own-on-demand-group-fetched-when-the-world-state-carries-it.md),
which added the first non-monster trigger.

## Context

The Spire now holds NPCs that are not monsters: the wandering merchant (FS-9JV5K) on about a third of
floors 2+, and the encounter cast (pilgrims, captives, cutthroats) on about 40% of floors 2+, plus the
contract mark and hostile cutthroats drawn on the monster path (FS-4EC7Z). Their sheets are big
character sheets (the encounter group is about 63 MB decoded after trimming; it was 202 MB untrimmed).
Making them resident would load them into every run whether or not a floor ever holds one.

ADR-0071 made the blood demon an on-demand group fetched when a snapshot first lists one, and its
Decision 6 says a new sheet may go on demand by a table change, but changing what triggers a fetch
needs an ADR. ADR-0088 added a trigger keyed on the world state carrying a player with a
specialization. The merchant and the encounter cast need the same shape keyed on their own state.
The build (I-9JV5K-4, I-4EC7Z-5/6) did this; this ADR records it after the fact, as the merchant's
art slice flagged.

Recorded without adversarial review: by the orchestrating session under the owner's 2026-11-25
Spire charter.

## Decision

1. **The merchant's sheet and the encounter cast's sheets are each one scene-scoped, on-demand group**
   (`merchant`, `encounter`), packed apart, preloaded by no scene and not loaded at boot.
2. **Two new fetch triggers.** The run scene queues the `merchant` group the first time a snapshot
   carries the `merchant` key; it queues the `encounter` group the first time a snapshot carries a
   non-empty `encounter_npcs` or lists a monster of archetype `cutthroat` or `contract_mark`. One fetch
   serves both askers of the `encounter` group.
3. **Until a group lands, a resident stand-in is drawn** (the mercenary's sheet under a tint named for
   the NPC, `palette.merchantStandIn` / `palette.encounterStandIn`), as ADR-0071 draws the demon's.
4. **Character sheets in these groups are trimmed** (ADR-0058/0076's per-frame trim) and their decoded
   size is pinned by a test (the encounter group under 70 MB).

ADR-0071's other decisions (scene-scoped, evicted with the scene's animations) stand.

## Consequences

- A run with no merchant or encounter never pays for their art; one that meets them pays once per
  delve (the groups are scene-scoped, not floor-scoped, so they stay until the run scene ends).
- **Memory, flagged for the owner:** ADR-0071's budget did not foresee these groups. A delve that meets
  a blood demon, an encounter and the merchant holds all three on demand at once (about 173 + 63 +
  the merchant's page decoded). Making the encounter group floor-scoped (ADR-0081's shape) is the
  lever if that proves too heavy.
- A fourth kind of trigger later needs its own amendment, as Decision 6 says.
