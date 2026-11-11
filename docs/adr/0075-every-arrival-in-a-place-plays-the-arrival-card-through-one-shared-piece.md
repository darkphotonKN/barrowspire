# ADR-0075 — Every arrival in a place plays the arrival card, through one shared piece that no scene owns

Status: accepted
Date: 2026-11-11
Scope: `game-client` only: when the arrival card plays, and where the code that plays it lives
(`src/scenes/`, `src/ui/`, `src/components/worldRouting.ts`). Not the server, the wire, or what
the card looks like (that is [FS-PQ2TW](../specs/PQ2TW-arrival-card.md)).
Specified by [FS-PQ2TW](../specs/PQ2TW-arrival-card.md).
Builds on: [ADR-0015](0015-hub-and-runs-share-one-process-and-one-connection.md) (a floor change
is not a world switch), [ADR-0030](0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md)
(fields are entered by a world switch), [FS-29KSH](../specs/29KSH-hub-world-and-delve-entry.md)
§Requirements 15, 36 (`world_entered` is the one place the client learns its world).

## Context

The owner's decision on 2026-11-11, after a playtest: "我要再進入每個地方時都有這種效果
可以寫成一個adr". Recorded without adversarial review: no `challenge-me` pass was run.

Forces:

- **The card exists, in one scene, for one case.** The climb's floor card is
  `playFloorTransition` inside `BarrowspireScene.ts`, played only when `floor` increases
  (FS-F6F88 req 32). Entering the Spire's first floor, the town, or a field shows nothing: the
  owner went into floor 1 expecting the card he had seen on a climb, and it did not come.
- **There are three world scenes today and more to come.** `HubScene`, `FieldScene`,
  `BarrowspireScene`; a field is added by an id and a look (FS-3QHQZ added the Forest that way).
  A card copied into each scene is three cards to keep alike, and a fourth world would come
  without one until someone noticed, as floor 1 did.
- **A place is entered in two ways.** A world switch (`world_entered`, handled once at
  `worldRouting.ts`) and a climb (the run's `floor` going up, which ADR-0015 says is not a world
  switch). Both are arrivals to the player.
- **The server says the same thing for an arrival and a return.** `world_entered` is sent on
  entering a world, and again on a reconnect or a refresh into it, with the same payload. Whether
  it is an arrival is the client's to decide, and three scenes deciding it would decide it three
  ways.
- **The card is presentation.** State, the HUD and input carry on under it today, and nothing in
  the game waits for it.

## Decision

1. **Every arrival in a place plays the arrival card.** A place is a world (the town, a field, a
   run) or a floor of a run. An arrival is coming into a place the player was not just in. This
   holds for every world the client can enter, the ones not built yet included.
2. **These are not arrivals, and play nothing:** a reconnect or a page refresh back into the same
   place, and moving about inside a place (walking into a town building, which adds no world).
3. **One shared piece plays the card.** It belongs to no scene. A world scene hands it two things
   only: that its place is now built, and, for a run, which floor it is. The dark, the card, its
   timing, its leaving and its teardown are the piece's, the same in every scene.
4. **Whether a `world_entered` is an arrival is decided once,** where the world switch is made,
   and handed to the scene that starts. No scene works it out for itself. A climb stays the run
   scene's to detect (`floor` going up), and is played through the same piece.
5. **The card's words are one table, total over the places.** Every world type and every field id
   has an entry, held complete by the type checker, so a world added later does not build until
   it has a name and a line. A place gets no card code of its own, only its entry.
6. **The card never waits on the game and the game never waits on the card.** It holds the dark
   until the place is built, and that is the only thing it reads from a scene.

## Consequences

- **A world added later gets the card for one table entry** and the same two calls every world
  scene makes. Forgetting the entry fails the build; forgetting the calls is caught by the test
  that walks the world scenes (FS-PQ2TW).
- **The run scene loses its own card code.** `playFloorTransition` and its veil handling move out;
  the run keeps only the climb's detection and the per-floor rebuild.
- **Every arrival now costs the player about a second and a half of dark and card**, on the short
  walks between the town and a field as well. The owner chose this. The timings live in one place
  and are starting values.
- **The veil's place in the depth order becomes a rule for every world scene**: over the world and
  its atmosphere, under the HUD. A scene whose HUD sits lower would have it covered.
- **A page refresh cannot be told from an arrival by anything the server sends.** The client has
  to remember where it was; how is FS-PQ2TW's, and a flag on `world_entered` would be the exact
  answer but is a server change outside this decision.
- **Where the piece lives and how a scene calls it are mechanism.** A module the scenes call, as
  they call `preloadArt`, is what FS-PQ2TW asks for; a different shape that keeps Decisions 3 and
  4 needs no new ADR.

## Alternatives rejected

- **A card in each scene.** Three copies today; the fault that started this (floor 1 had none)
  is what a per-scene card produces.
- **A base class the world scenes extend.** It would own the card, and next the loading bar, the
  held messages and the fade: one parent for unrelated things. The scenes already share by
  calling modules.
- **Play it on every `world_entered`.** Simple, but a refresh would replay it, against FS-F6F88
  req 32 and the owner's rule.
