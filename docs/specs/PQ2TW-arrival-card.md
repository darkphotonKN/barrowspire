# FS-PQ2TW: Arrival card

> Status: work-order · SPECIFICATION.md: none. This is a change FS with no thin line of its own (`docs/specs/README.md`, The FS ledger). Each owning FS carries the stub `## Change: Arrival card → FS-PQ2TW`: [FS-F6F88](F6F88-multi-floor-delves.md) (req 32, the floor card), [FS-KE075](KE075-floor-1-dungeon.md) (§H.41, the veil held for the map), [FS-29KSH](29KSH-hub-world-and-delve-entry.md) (the hub scene), [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md) (the field scene), [FS-KYPQ9](KYPQ9-remainder-restyle-town-dressing-and-effects.md) (§B.6, the effect rules) · Related ADRs: [ADR-0073](../adr/0073-every-arrival-in-a-place-plays-the-arrival-card-through-one-shared-piece.md) (every arrival plays the card, through one shared piece), [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (a floor change is not a world switch; a town building adds no world), [ADR-0057](../adr/0057-the-client-runs-phaser-4-pixel-rounding-by-vertex-round-mode-masks-by-the-mask-filter.md) (Phaser 4; masks only through `maskInView`), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (the canvas palette) · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (arrival, arrival card) · Surface: game-client only

> Promoted `--from-thread` on 2026-11-11 from the owner's charter ("進場卡", approved "核准"). The
> thread is the charter's locked decisions. Requirements marked **(charter default)** are those
> decisions, each with its reason. Those marked **(spec)** fill an acceptance-level gap the charter
> did not settle, and are this spec's own; the three the owner should look at are listed under
> *Open for the owner*. Every number and every subtitle line is a starting value. Code citations
> are against the tree at `28a7a377`.

## Summary

Coming into a place shows its name. Today only a climb does this: the view goes dark and comes
back with "The Second Floor" and a line under it. After this change the same card plays on every
arrival: into the town, into a field, onto the Spire's first floor, and on every climb as before.
When the card goes, its letters break into dust that drifts off and fades.

Why (owner, playtest 2026-11-11): "之前好像進到不同地圖時會有一個全畫面的區域顯示 再慢慢淡出
剛進一樓似乎沒顯示". He had seen the climb's card and expected it on floor 1. Then: "我要再進入
每個地方時都有這種效果" and "進場卡消失時可以有點特效嗎 像是消失時是變成粒子粉末的方式向周圍散開".

## Bounds

- **May touch:** `game-client` only: the world switch (`src/components/worldRouting.ts`,
  `PhaserGame.tsx`), the three world scenes' arrival flows, the card and its copy (`src/ui/`),
  the dust (`src/render/effects/`), their tests, and the dev gallery (`src/dev/gallery/effects.ts`).
- **May not touch:** `game-server/`, proto, the gateway, the wire, or the existing text of a
  shipped FS. No new colour, no new baked art, no new font.

## Facts this spec rests on

1. **The card today.** `playFloorTransition` (`BarrowspireScene.ts:4079`): a `pitch` rectangle
   over the whole view at depth 950 (over the world and its atmosphere, under the HUD at 1000),
   then a heading (body serif, 26 px, `hudText`, letter-spacing 4), a 180 px rule (`frame`, 0.6)
   and a subtitle (body serif italic, 15 px, `hudLabel`). Timings: dark hold 250 ms, card fade-in
   300 ms, view return 900 ms, card hold 1400 ms, card fade-out 600 ms. The veil lifts only once
   the floor is built (`veilRelease`, FS-KE075 §H.41). Copy from `floorCard` (`src/ui/floor.ts`).
2. **It plays on a climb only.** `climbed(lastFloor, state.floor)`; the first broadcast after a
   start is the baseline and plays nothing (FS-F6F88 req 28, 32; FS-M8CSE R9).
3. **One message names the world.** `world_entered {session_id, world_type, field?}`, handled once
   (`PhaserGame.tsx` → `switchWorld`). The server sends the same message on entering a world and
   on a reconnect or refresh into it (`worldEnteredMessage`, `game-service/internal/gameserver/hub.go`);
   there is no flag.
4. **What the client can tell today.** With the page alive, `gameStore` still holds the session id
   it was in (`setWorld` compares it to keep the floor map), so a socket reconnect into the same
   world can be told in every scene. After a page refresh nothing of the world is left in memory,
   so no scene can tell a refresh from an arrival. The hub's session id is its pod's, fixed for
   the pod's life (`server.go: hubSessionID`); a field's likewise (ADR-0030).
5. **A town building adds no world** (FS-B0H2D, ADR-0015): no `world_entered` is sent.
6. **A world scene fades in from black over 200 ms as its `create` runs** (FS-C4JWH A1.4), after
   its loading bar if one showed.
7. **Names.** Fields: `FIELD_NAMES` in `src/scenes/hubGates.ts` ("The Forlorn Forest", "Gentle
   Meadows", "Dev Test Room"). The hub has no proper name: CONTEXT.md calls it **the town**
   ("The screen may say town"), the main menu says "ENTER THE TOWN", and CONTEXT.md's Open list
   keeps "a proper name for the town" unsettled.
8. **A Master Spire is never named to the client** (FS-M8CSE R10, and its Out of Scope).
9. **The engine can read a text's pixels** (Phaser 4.2.1, installed source). A `Text` draws to
   its own 2D canvas (`Text.canvas`, `Text.context`; `Text.js:138, 275–278`), a `CanvasTexture`
   with `getPixel` / `getPixels`. A particle emitter takes a random zone from any object with
   `getRandomPoint` (`ParticleEmitter.js:1847`), and `emitParticleAt(x, y)`. Text is rasterised
   at the render scale (`crispen`, FS-ZAJMH), so canvas pixels are view px times that scale.
10. **The effect rules** (FS-KYPQ9 §B, shipped): fixed durations, none over 1200 ms; easing
    allowlist; no squash, no shake; §B.6 "No confetti": no radial `explode`, at most 12 particles
    per one-shot, debris "never sprays outward"; tokens only, at most 3 colours; teardown.
    `sourceScan.test.ts` bans the string `explode(` in `src/render/effects/` and the scenes.
11. **Reduced motion** is read by `prefersReducedMotion()` (`src/render/effects/mist.ts`), used by
    `PartyFrames` and `itemShine`; the guideline asks for it (lines 512, 716, 985, 1195).
12. **The gallery wants a card per effect module** (`src/dev/gallery/effects.test.ts`, FS-1819Q R12).

## Requirements

### §A. When the card plays

1. **Every arrival plays the card** (ADR-0073). An arrival is coming into a place the player was
   not just in. The places: the town, each field, a run's first floor, and each floor climbed to.
   **(charter default: the owner's "我要再進入每個地方時都有這種效果".)**
2. **The arrivals, in full:**
   - into the town: from the main menu, on return from a run (when the run ends, or on leaving it
     early), on return from a field, and on travel to a party leader's town;
   - into a field, from the town;
   - into a run: its first broadcast's floor, which is floor 1 for every entry there is today;
   - a climb: `floor` going up, as today.

   **(charter default; the list is the charter's, spelled out per entry path.)**
3. **A Master Spire is a run like any other.** Its floors play the same cards, and nothing on a
   card says the run is one (FS-M8CSE R10 stands). **(spec: the charter lists "a Master Spire"
   among the places that get the card; the client is never told the height, so the only reading
   that needs no server change is that its floors are not left out.)**
4. **Walking into a town building plays nothing.** **(charter default: it is not an arrival; it
   adds no world, Fact 5.)**
5. **A return plays nothing.** A reconnect, or a page refresh, that puts the player back in the
   place they were in shows that place with no dark and no card. On a run this holds for every
   floor, floor 1 included. **(charter default: FS-F6F88 req 32 already says so for floors 2–3.)**
6. **How a return is told.** The client keeps the last place it was in: world type, session id,
   and field id for a field. A `world_entered` naming that same place is a return; any other is an
   arrival. The place is kept in memory and, so it survives a page refresh, in the tab's session
   storage. **(spec: the server sends nothing that tells the two apart, Facts 3–4, and a flag on
   `world_entered` is outside Bounds. Open for the owner, O2.)**
7. **Entering from the main menu is always an arrival.** Pressing "ENTER THE TOWN" forgets the
   kept place before it asks. **(spec: without this, logging out and back in within one tab would
   come into the same hub session and show no card.)**
8. **Decided once.** Whether a `world_entered` is an arrival is worked out where the world switch
   is made and handed to the scene that starts. No scene compares places itself. The climb stays
   the run scene's to detect. **(charter default: ADR-0073 Decisions 3–4.)**
9. **A second arrival replaces the first.** If a card is still up, or its dust still in the air,
   when the next arrival or climb comes, it is removed at once and the new one starts.
   **(spec: as today's `floorVeil` is destroyed before a new one is made.)**

### §B. The card

10. **The motion is the climb's.** The view is fully dark; the card (heading, rule, subtitle)
    fades in; the view comes back up; the card holds, then leaves (§D). Look and timings are
    today's (Fact 1) and are named in one place. **(charter default: "the motion is the climb's".)**
11. **On a world arrival the dark is up from the scene's first drawn frame.** The veil is made in
    `create`, before anything of the place can be seen, so the world's 200 ms fade-in (Fact 6)
    opens on the dark. The loading bar, when one shows, comes and goes before it as today.
    **(spec: otherwise the place would flash before going dark.)**
12. **The view comes back up only once the place is built.**
    - the town and a field: once the scene has drawn its first game state;
    - a run, on arrival and on a climb: once the floor is built from its map (FS-KE075 §H.41).

    The wait is taken off the card's own hold, as today, so a place that is built in time loses
    nothing. **(charter default: "only once the place is built".)**
13. **A run's card waits for its floor.** The heading needs the floor number, so on a run arrival
    the dark is up from `create` and the card fades in at the first broadcast. In the town and a
    field the name is known at once and the card fades in after the dark hold. **(spec.)**
14. **Presentation only.** State keeps applying under the card; the HUD and notices stay above it
    and readable; input is never blocked; nothing sent to the server waits on it.
    **(charter default: "as today".)**
15. **The veil sits at the same depth in every world scene:** over the world and its atmosphere,
    under the HUD. **(spec: ADR-0073 Consequences.)**
16. **The card follows the view.** On a resize it re-covers the view and re-centres, as the climb's
    does (FS-ZAJMH R13). **(spec.)**
17. **Body serif, never the display face** (FS-F6F88 req 32's bound stands). **(charter default.)**

### §C. The words

18. **The title is the place's name; the subtitle is one line in the lore voice**
    (`game-client/CLAUDE.md` "Wording & Tone"). **(charter default.)**
19. **The table.** Every subtitle but floor 1's is a **starting line**: the owner edits them in the
    browser check.

    | Place | Title | Subtitle |
    |---|---|---|
    | The town (hub) | The Town | The Spire's shadow lies on every roof. *(starting line)* |
    | Gentle Meadows | Gentle Meadows | The grass is soft, and the Spire is far. *(starting line)* |
    | The Forlorn Forest | The Forlorn Forest | The dead have not left these trees. *(starting line)* |
    | Dev test room (dev builds only) | Dev Test Room | Nothing here is kept. *(starting line)* |
    | A run's floor 1 | The First Floor | The barrow takes you in. *(the owner's)* |
    | A floor climbed to, below the top | The Second Floor, The Third Floor, … | The dead walk heavier here. *(as today)* |
    | The top floor climbed to | as above | No stair climbs higher. Only the way out remains. *(as today)* |

    **(charter default: titles are existing names, Fact 7; floor 1's line is the owner's; the
    climb's two lines are today's `floorCard`, unchanged.)**
20. **The town's title is "The Town".** It is the word CONTEXT.md gives the hub for the screen,
    not a new name. **(spec: the charter forbids inventing a name and the hub has no proper one,
    Fact 7. Open for the owner, O1.)**
21. **Floor 1 always takes its own line**, whatever the run's height. **(spec.)**
22. **An arrival that lands above floor 1** (none exists today) takes that floor's climb card.
    **(spec.)**
23. **One table, total over the places.** The words for every world type and every field id live
    in one typed table beside `floorCard`; a field id with no entry does not compile.
    **(charter default: ADR-0073 Decision 5.)**

### §D. Leaving as dust

24. **The card leaves as dust.** When its hold ends, the heading, the rule and the subtitle break
    into particles together; the text itself is gone as the particles appear in its place.
    **(charter default: the owner's "變成粒子粉末的方式向周圍散開".)**
25. **The particles rise from the strokes.** Each starts on a drawn pixel of the letters, read
    from the two texts' own rendered canvases, and along the rule's line. None starts in the
    empty space between letters or around the card. **(charter default: "from the strokes of the
    letters themselves, not from a box around them". Feasible: Fact 9.)**
26. **They drift outward and a little upward, and fade.** Outward is away from the card's centre.
    A drift, not a burst: no particle starts faster than 60 px/s, and all slow as they go.
    **(charter default; the speed cap is the spec's, to keep it dust and not confetti.)**
27. **About one second.** 1000 ms, one fixed duration, a starting value, never over 1200 ms
    (FS-KYPQ9 §B.2 stands). **(charter default.)**
28. **Colour.** Every particle starts in the heading's colour (`hudText`, vellum), the subtitle's
    included, and darkens to `hudLabel` (vellumDark) as it drifts, while its alpha falls to 0.
    Tokens only, two of them, no new colour. **(charter default.)**
29. **The dark fades as today, with the particles drawn over it** and under the HUD.
    **(charter default.)**
30. **The climb's card leaves the same way.** There is one card. **(charter default.)**
31. **Reduced motion: no particles.** With `prefersReducedMotion()` true the card fades out as it
    does today (600 ms). **(charter default; the helper is the repo's convention, Fact 11.)**
32. **How many.** At most 600 particles for the whole card, spread over the strokes in proportion
    to their ink, each about 2 view px across, drawn from the existing `fx_dust` sheet; one
    emitter. A starting value. **(spec: enough to hold the letters' shapes at 26 px; no new baked
    art, Bounds.)**
33. **An exception to FS-KYPQ9 §B.6, and only this.** The dust is more than 12 particles and it
    drifts outward. It still calls no `explode`, and every other rule of §B holds for it: fixed
    duration, the easing allowlist, no scale bounce, no shake, tokens only, at most 3 colours,
    teardown on end and on scene shutdown. The tests that hold §B.6 keep holding it for every
    other effect. **(charter default: the owner's request cannot be met inside §B.6; named here so
    the rule is not quietly broken. Open for the owner, O3.)**
34. **Its numbers are data.** Duration, particle cap, speed, drift, the two tokens and the easing
    are one typed record in `src/render/effects/`, asserted by a vitest, as the effects table is.
    **(spec.)**
35. **If the strokes cannot be read** (the canvas read throws or returns nothing), the card fades
    out as under reduced motion, logged once. **Particles from within the text's bounds are not
    built** without the owner being told first. **(charter default.)**
36. **The dust never outlives its scene.** A scene stop, a world switch or a new card removes
    every particle at once. **(spec: FS-KYPQ9 §B.9.)**

### §E. One shared piece

37. **One piece plays the card for every scene** and belongs to none (ADR-0073 Decision 3). A
    world scene tells it two things: that its place is built, and, for a run, the floor.
    **(charter default.)**
38. **The run scene keeps no card code of its own.** `playFloorTransition`, the veil's relayout and
    its timings move to the piece; the climb's detection and the per-floor rebuild stay.
    **(charter default.)**
39. **Every world scene is held to it by a test** that walks `WORLD_SCENES` and fails for a world
    scene that does not hand its arrival to the piece. **(spec: so a world added later cannot
    come without the card, ADR-0073 Consequences.)**

### §F. Dev gallery

40. **The dust has a gallery card that can be replayed** (`src/dev/gallery/effects.ts`): it shows a
    card's heading, rule and subtitle and breaks them to dust on each play. Added in the same
    change as the effect (`Content: FS-1819Q`). **(charter default.)**

## User Stories

1. As a player, I want the place's name shown when I walk into the town, so that I know where I am.
2. As a player, I want a field's name shown when I enter it, so that the Meadows and the Forest feel like different places.
3. As a player, I want the Spire's first floor announced as the later floors are, so that going in feels like going in.
4. As a player, I want each climb marked as it is today, so that nothing I knew is lost.
5. As a player, I want the card again when a run ends and I am back in town, so that the return reads as a return.
6. As a player, I want no card when I only refreshed the page, so that a refresh does not make me wait.
7. As a player whose connection dropped and came back, I want no card, so that I am straight back in the fight.
8. As a player, I want no card when I step into the Inn or the store, so that the town does not keep interrupting me.
9. As a player, I want to move, see my HUD and read notices while the card is up, so that it never costs me a hit.
10. As a player, I want the dark to hold until the place is really there, so that I never see a half-built world.
11. As a player, I want the card to go as dust off the letters, so that it leaves like something in this world would.
12. As a player who asked for less motion, I want the card simply to fade, so that nothing swirls at me.
13. As a player on a slow connection, I want the card to wait with the dark and not vanish before I have seen the place.
14. As a player travelling to my party leader's town, I want the card there too, so that I know I moved.
15. As the owner, I want every subtitle in one table, so that I can rewrite them in one sitting.
16. As the owner, I want to replay the dust in the dev gallery, so that I can judge it without walking through a gate each time.
17. As a developer adding a world, I want the card to come with one table entry, so that I do not build it again.
18. As a developer, I want the build to fail when a new field has no card words, so that a place cannot ship without them.
19. As a developer, I want the arrival decision in one place, so that three scenes cannot disagree about what a return is.
20. As a developer, I want the dust's numbers in one tested record, so that a retune is one edit.
21. As a reviewer, I want the exception to the effect rules written down, so that "no confetti" still means something.

## Acceptance Criteria

### When it plays

- [ ] Entering the town from the main menu plays the card "The Town" with its line. (R1, R2, R7)
- [ ] Entering each field from the town plays that field's card. (R2)
- [ ] Returning to the town from a field plays the town's card. (R2)
- [ ] Entering a run plays "The First Floor / The barrow takes you in." (R2, R19, R21)
- [ ] A climb plays the floor's card with today's two lines; a height-10 run's floors play the same cards and no card names the run. (R2, R3)
- [ ] When a run ends, or is left early, the return to the town plays the town's card, after the settlement record is closed if one was open. (R2)
- [ ] Travel to a party leader's town plays the card. (R2)
- [ ] Walking into and out of a town building plays nothing. (R4)
- [ ] A socket reconnect into the same town, field or run plays nothing, on any floor. (R5, R6)
- [ ] A page refresh into the same town, field or run plays nothing, on any floor. (R5, R6)
- [ ] After a refresh on a run's floor, the next climb plays its card. (R2, R5)
- [ ] Logging out and entering again from the main menu in the same tab plays the card. (R7)
- [ ] The arrival is decided at the world switch and reaches the scene with its start; no scene reads the kept place. (R8)
- [ ] A climb during an arrival's card removes that card and its dust and plays the climb's. (R9)

### The card

- [ ] The card's look and its five timings are today's, named in one place. (R10)
- [ ] On a world arrival nothing of the place is visible before the dark. (R11)
- [ ] The dark lifts only after the town's or field's first game state is drawn, and only after a run's floor is built from its map; a place built in time lifts on today's schedule. (R12)
- [ ] On a run arrival the card fades in at the first broadcast. (R13)
- [ ] Under the card: state applies, the HUD and notices are readable, input works. (R14)
- [ ] The veil is over the world and atmosphere and under the HUD in all three world scenes. (R15)
- [ ] A resize during the card keeps the view covered and the card centred. (R16)
- [ ] Heading and subtitle use the body serif. (R17)

### The words

- [ ] Each place shows the title and line of the R19 table. (R19–R22)
- [ ] The words live in one table; a field id without an entry fails the type check. (R23)

### The dust

- [ ] At the end of the hold, heading, rule and subtitle break up together and the text is gone. (R24)
- [ ] Every particle starts on a pixel the text drew or on the rule; none in the gaps between letters. (R25)
- [ ] Particles move away from the card's centre with an upward lean, none faster than 60 px/s at the start, and all are gone at 1000 ms. (R26, R27)
- [ ] Particles start `hudText`, end `hudLabel`, and no other colour appears. (R28)
- [ ] The dust is drawn over the veil and under the HUD. (R29)
- [ ] The climb's card leaves as dust too. (R30)
- [ ] With reduced motion, no particle is made and the card fades over 600 ms. (R31)
- [ ] The card makes at most 600 particles from one emitter, with no `explode` call. (R32, R33)
- [ ] `table.test.ts` and `sourceScan.test.ts` still pass as written for every other effect. (R33)
- [ ] The dust's numbers are one typed record with a vitest on it. (R34)
- [ ] A failed stroke read falls back to the fade and logs once; nothing is emitted from the text's bounds. (R35)
- [ ] Stopping the scene mid-dust leaves no particle, emitter or tween. (R36)

### Shared piece and gallery

- [ ] `BarrowspireScene` has no card or veil code; the run's existing floor-card tests pass against the shared piece. (R37, R38)
- [ ] A test fails for a `WORLD_SCENES` entry that does not hand its arrival to the piece. (R39)
- [ ] `/dev/gallery` has a card for the dust that replays it; `effects.test.ts` passes. (R40)

## Edge States

- **The place is slow to build** (a late first state, a late floor map): the dark and the card
  stay; when it is built the view returns after whatever is left of the hold. The card does not
  leave over a dark screen: its hold is counted from the lift, as today.
- **The loading bar shows** (art still downloading at 300 ms): bar, then `create`, then the dark
  and the card. The card's clock starts at `create`.
- **World switch while a card is up or its dust is in the air:** the scene stops, everything of
  the card goes with it, and the next place's card starts clean.
- **The settlement record holds the town back** (FS-GV8WN R23): the town's card plays when the
  hub scene actually starts, not when the run ends.
- **Session storage unavailable or throwing:** the kept place lives in memory only. A socket
  reconnect still plays nothing; a page refresh plays the card. Nothing else breaks.
- **A refresh that lands on another server** (the hold expired, or a redirect to a new pod): the
  session id differs, so it reads as an arrival and the card plays.
- **A redirect back to the pod still holding the player** (FS-MCYWK): the same session id, a
  return, no card.
- **Two tabs:** each keeps its own place; nothing is shared.
- **Reconnect mid-card:** the scene restarts as a return; the card is gone and does not replay.
- **Reduced motion turned on while a card is up:** read once, when the card starts to leave.
- **A resize while the dust is in the air:** the dust is removed; the veil, if still fading, keeps
  covering the view.
- **A very long title** (none today): the card is not wrapped or shrunk; a place's name is the
  table's to keep short.
- **The fx sheet is missing** (no manifest): no dust; the card fades (FS-KYPQ9 §B.10's "play
  nothing", applied to the dust alone).

## Out of Scope

- A proper name for the town (CONTEXT.md Open), and any change to "village" in party copy.
- A flag on `world_entered` telling an arrival from a return, or any server change.
- A Master Spire card or anything that tells the client a run's height (FS-M8CSE R10).
- A card on entering a town building, or a name shown for a room inside a place.
- Sound.
- A card on the main menu, character creation, or the web pages.
- Changing the climb's two lines, the floor indicator, or the loading bar and world fade-in.
- Particles from the text's bounding box (R35), or dust on anything but the card.
- Skipping the card by a key or a click, and a setting to turn it off.

## Open for the owner

- **O1. The town's title.** The hub has no proper name anywhere in the specs or the code; the
  screen's word for it is "the town" (CONTEXT.md). R20 uses "The Town". A proper name is one
  table entry when he has one.
- **O2. Refresh or arrival.** Nothing the server sends tells them apart, in any scene. R6 keeps
  the last place in the tab's session storage, client only. The exact answer would be a flag on
  `world_entered`, which crosses Bounds.
- **O3. "No confetti."** The dust breaks FS-KYPQ9 §B.6's 12-particle cap and its "never sprays
  outward". R33 makes it the one exception and keeps the drift slow.
- **O4. The subtitle lines** for the town, the two fields and the dev test room are starting
  lines for the browser check.
