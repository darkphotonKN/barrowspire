# FS-PQ2TW: Arrival card

> Status: work-order · SPECIFICATION.md: none. This is a change FS with no thin line of its own (`docs/specs/README.md`, The FS ledger). Each owning FS carries the stub `## Change: Arrival card → FS-PQ2TW`: [FS-F6F88](F6F88-multi-floor-delves.md) (req 32, the floor card), [FS-KE075](KE075-floor-1-dungeon.md) (§H.41, the veil held for the map), [FS-29KSH](29KSH-hub-world-and-delve-entry.md) (the hub scene), [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md) (the field scene), [FS-KYPQ9](KYPQ9-remainder-restyle-town-dressing-and-effects.md) (§B.6, the effect rules) · Related ADRs: [ADR-0073](../adr/0073-every-arrival-in-a-place-plays-the-arrival-card-through-one-shared-piece.md) (every arrival plays the card, through one shared piece), [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (a floor change is not a world switch; a town building adds no world), [ADR-0057](../adr/0057-the-client-runs-phaser-4-pixel-rounding-by-vertex-round-mode-masks-by-the-mask-filter.md) (Phaser 4; masks only through `maskInView`), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (the canvas palette) · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (arrival, arrival card) · Surface: game-client only

> Promoted `--from-thread` on 2026-11-11 from the owner's charter ("進場卡", approved "核准"). The
> thread is the charter's locked decisions. Requirements marked **(charter default)** are those
> decisions, each with its reason. Those marked **(spec)** fill an acceptance-level gap the charter
> did not settle, and are this spec's own; the three the owner should look at are listed under
> *Open for the owner*. Every number and every subtitle line is a starting value. Code citations
> are against the tree at `28a7a377`.
>
> **The owner's tune, 2026-11-12.** Looking at the card on a climb, the owner asked: "地圖卡顯示在
> 中間偏上方一些 字體可以再大一些 粒子再細一點多一點", then "中心偏上３０％好了", then "粒子擴散得再遠
> 一點". His values replace the starting values where this spec stated them: the card's place and
> type (R10, R16) and the dust's speed, drag, duration, size and count (R26, R27, R32, R33).
>
> | Value | Was | Now |
> |---|---|---|
> | the card's centre | the view's centre | 30% of the view's height above it (about 20% from the top) |
> | heading | 26 px | 34 px |
> | subtitle | 15 px | 19 px |
> | heading, rule, subtitle from the card's centre | −14, +8, +26 px | −18, +10, +33 px (scaled with the type) |
> | a mote's size | about 2 view px (`fx_dust` × 0.25) | about 1.2 view px (× 0.15) |
> | particle cap | 600 | 1500 |
> | start speed | 15–60 px/s | 25–110 px/s |
> | drag | 1.6/s | 1.0/s |
> | the dust's duration | 1000 ms | 1300 ms |
>
> **The owner's second tune, 2026-11-12.** Then he asked: "地圖卡顯示時間改成３秒", and, asked
> whether that meant the card fully shown, "對，卡片完整顯示3秒"; then "粒子再多1倍 多一些飄散的感覺",
> and "飄散的軌跡速度可以加一點快到慢的感覺". His values replace the first tune's where they differ:
> the card's hold (R10), and the dust's count, speed, drag, lean, duration and a sideways sway
> (R26, R27, R32, R33, R34). The dark's hold, the card's fade-in and the view's return are
> unchanged.
>
> | Value | Was | Now |
> |---|---|---|
> | the card's hold, fully shown, before it breaks | 1400 ms | 3000 ms |
> | particle cap | 1500 | 3000 |
> | motes per view px² of ink | 1 | 2 |
> | start speed | 25–110 px/s | 40–160 px/s |
> | drag | 1.0/s | 2.0/s (fast out, then slow) |
> | the upward lean | 0.5 | 0.7 (under 1) |
> | the dust's duration | 1300 ms | 1800 ms |
> | a mote's sideways sway | none | 1.5–4 px to either side, a 700–1200 ms period, its own phase, growing as the mote slows |
>
> **The owner's third tune, 2026-11-12.** Looking at the second tune, he said: "粒子散的開一點
> 感覺都還是散在文字旁邊而已": the motes stayed close beside the letters (a mote went at most
> about 80 px, typically about 50). Spread them much wider, keeping the fast-then-slow feel.
> Before it was built he added: "應該是說也要往內散 目前都是散在同一個方向": the motes all went one
> way (out from the card's centre, leaned well up); scatter them every way, inward over the card
> included. Each mote's heading is now drawn at random over the full turn, then leaned only a
> little up, so motes off the heading's lower edge may cross down through the subtitle, and motes
> cross each other. His values replace the second tune's where they differ: the dust's heading,
> lean, start speed, drag and sway (R26), and R33's start-speed cap. The duration, cap, density
> and size are unchanged; the sway's period, phase and its growing as the mote slows are
> unchanged.
>
> | Value | Was | Now |
> |---|---|---|
> | a mote's heading | out from the card's centre | random over the full turn, inward included |
> | the upward lean | 0.7 | 0.2 (under 1) |
> | start speed | 40–160 px/s | 80–320 px/s |
> | drag | 2.0/s | 1.6/s (still fast out, then slow; a mote goes at most about 200 px, typically about 125) |
> | a mote's sideways sway | 1.5–4 px to either side | 4–10 px to either side |
> | R33's start-speed cap | 160 px/s | 320 px/s |
>
> **The owner's fourth tune, 2026-11-12.** Looking at the third tune, he said: "目前散得很平均
> 但似乎太快太遠": the even scatter is right, but the motes go too fast and too far (a mote went
> about 0.59 × its start speed, 47–188 px, about 117 on average). Slow them and bring them
> nearer, keeping the fast-then-slow feel. His values replace the third tune's where they
> differ: the dust's start speed, drag and sway (R26), and R33's start-speed cap. The headings
> (random over the full turn), the lean, the duration, cap, density and size are unchanged; the
> sway's period, phase and its growing as the mote slows are unchanged.
>
> | Value | Was | Now |
> |---|---|---|
> | start speed | 80–320 px/s | 50–200 px/s |
> | drag | 1.6/s | 1.8/s (still fast out, then slow; a mote goes about 0.53 × its start speed, about 27–107 px, about 66 on average) |
> | a mote's sideways sway | 4–10 px to either side | 3–7 px to either side |
> | R33's start-speed cap | 320 px/s | 200 px/s |
>
> **The owner's fifth tune, 2026-11-12, a trial.** Then he said: "粒子6000個試試": try 6000
> particles. A usual card already reached the 3000 cap at two motes per view px² of ink, so the
> density doubles with the cap, or a card would not reach it. His values replace the fourth
> tune's where they differ: the dust's cap and density (R32), and R33's particle cap. It is a
> trial: he judges it in the browser and may take it back. Everything else is unchanged: the
> speed (50–200 px/s), the drag (1.8), the sway (3–7 px), the full-turn headings, the lean
> (0.2), the duration (1800 ms) and the size (× 0.15).
>
> | Value | Was | Now |
> |---|---|---|
> | particle cap | 3000 | 6000 (trial) |
> | motes per view px² of ink | 2 | 4 (trial) |
> | R33's particle cap | 3000 | 6000 (trial) |
>
> **The owner's change, 2026-11-12, a trial.** He asked whether the card could go like smoke
> ("如果做成像煙一樣散掉有可能嗎", then "換成煙的效果試試"), and, before it was built: "並存 先保留粒子的
> 模組 煙另外做". The smoke is built as a leave of its own beside the dust; the dust stays the
> card's leave in the game, and he compares the two in the gallery. See *Change: Smoke, a trial
> alternate leave* at the end.
>
> **The owner's sixth tune, 2026-11-12.** Looking at the dust, he said: "粒子調整不要散這麼遠":
> the dust should not spread so far (a mote went about 0.53 × its start speed, about 26, 65 and
> 104 px at the slowest, middling and fastest start). Bring the motes nearer with a slower
> start, keeping the drag and so the fast-then-slow feel, and narrow the sway with them. His
> values replace the fourth tune's where they differ: the dust's start speed and sway (R26), and
> R33's start-speed cap. The full-turn headings, the lean (0.2), the drag (1.8), the duration
> (1800 ms), the cap (6000, the fifth tune's trial), the density (4) and the size (× 0.15) are
> unchanged; the sway's period, phase and its growing as the mote slows are unchanged. The
> smoke and the switch are untouched.
>
> | Value | Was | Now |
> |---|---|---|
> | start speed | 50–200 px/s | 30–120 px/s (at drag 1.8 a mote goes about 16–62 px, about 39 on average) |
> | a mote's sideways sway | 3–7 px to either side | 2–5 px to either side |
> | R33's start-speed cap | 200 px/s | 120 px/s |
>
> **The owner's seventh tune, 2026-11-12.** Looking at the sixth tune, he said: "粒子在減少２０％擴散
> 距離": cut the dust's spread by another 20% (a mote went about 0.53 × its start speed, about 16,
> 39 and 62 px at the slowest, middling and fastest start). At a fixed drag and duration a mote's
> travel is in proportion to its start speed, so the start speed falls by 20% and the drag stays,
> keeping the fast-then-slow feel. His values replace the sixth tune's where they differ: the
> dust's start speed (R26), and R33's start-speed cap. The sway (2–5 px), the full-turn headings,
> the lean (0.2), the drag (1.8), the duration (1800 ms), the cap (6000, the fifth tune's trial),
> the density (4) and the size (× 0.15) are unchanged; the sway's period, phase and its growing as
> the mote slows are unchanged. The smoke and the switch are untouched. With the sway kept, the
> slowest mote (about 12.5 px) may now end up to about 22° off its heading (a 5 px sway over
> 12.5 px), no longer within 20°, so R26's acceptance bound on where a mote ends follows to 22°.
>
> | Value | Was | Now |
> |---|---|---|
> | start speed | 30–120 px/s | 24–96 px/s (at drag 1.8 a mote goes about 12.5–50 px, about 31 on average) |
> | R33's start-speed cap | 120 px/s | 96 px/s |
>
> **The owner's second change, 2026-11-12, a trial.** He asked whether the card could go as ash
> ("地圖卡有可能像是灰燼的方式消失嗎"), then: "好 做灰燼試試 一樣獨立模組". The ash is a third leave,
> its own module, beside the dust and the smoke in the gallery; the dust stays the game's leave.
> See *Change: Ash, a trial alternate leave* at the end.
>
> **The owner's pick, 2026-11-12.** Having compared the leaves in the gallery, he said:
> "幫我把煙的效果套到遊戲中" (put the smoke into the game). The smoke becomes the card's leave in the
> game: every arrival and every climb now leaves as smoke. The dust and the ash stay as
> alternates, in the code and in the gallery, not deleted; their modules, numbers and tests are
> unchanged, and so are the smoke's. Only the switch moves (R41, R53, and their criteria), with
> the summary, §D's place and R30's criterion following it. See *Change: Smoke, a trial alternate
> leave* at the end, which keeps its name as the anchor of the code that built it.
>
> **The owner's second pick, 2026-11-12, superseding the smoke pick of the same day.** He said:
> "幫我把遊戲中的效果換成灰燼" (make the game's effect the ash). The ash becomes the card's leave in
> the game: every arrival and every climb now leaves as ash. The dust and the smoke stay as
> alternates, in the code and in the gallery, not deleted; their modules, numbers and tests are
> unchanged, and so are the ash's. Only the switch moves (R41, R53, and their criteria), with the
> summary, §D's place and R30's criterion following it. See *Change: Ash, a trial alternate
> leave* at the end, which keeps its name as the anchor of the code that built it.

## Summary

Coming into a place shows its name. Today only a climb does this: the view goes dark and comes
back with "The Second Floor" and a line under it. After this change the same card plays on every
arrival: into the town, into a field, onto the Spire's first floor, and on every climb as before.
When the card goes, a burn front crosses its letters from the left and they come off as burnt
flakes and embers that rise and fade (§Change: Ash, the owner's pick of 2026-11-12, superseding
that day's smoke pick); the dust (§D) and the smoke stay as alternates.

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
    fades in; the view comes back up; the card holds, then leaves (§D). Timings are today's
    (Fact 1) but the hold: the card stands fully shown for 3000 ms before it breaks, counted from
    the view's return as today (the owner's second tune of 2026-11-12, "對，卡片完整顯示3秒"). The
    look is today's but for the owner's tune of 2026-11-12: the card's centre stands
    30% of the view's height above the view's centre (about 20% from the top), one named value;
    the heading is 34 px and the subtitle 19 px, same faces, colours and letter-spacing; heading,
    rule and subtitle keep their spacing to each other, scaled with the type (−18, +10, +33 px
    from the card's centre). The dark still covers the whole view. All named in one place.
    **(charter default: "the motion is the climb's"; place and type, the owner's: "地圖卡顯示在中間
    偏上方一些 字體可以再大一些", "中心偏上３０％好了".)**
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
16. **The card follows the view.** On a resize it re-covers the view and re-places the card,
    centred across and at its height (R10) in the new view, as the climb's does (FS-ZAJMH R13).
    **(spec.)**
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

Since the owner's picks of 2026-11-12 the dust is not the game's leave: the ash is (R41, R53;
the smoke was, earlier that day). §D stays as the dust's work order; the dust is an alternate,
kept in the code and the gallery.

24. **The card leaves as dust.** When its hold ends, the heading, the rule and the subtitle break
    into particles together; the text itself is gone as the particles appear in its place.
    **(charter default: the owner's "變成粒子粉末的方式向周圍散開".)**
25. **The particles rise from the strokes.** Each starts on a drawn pixel of the letters, read
    from the two texts' own rendered canvases, and along the rule's line. None starts in the
    empty space between letters or around the card. **(charter default: "from the strokes of the
    letters themselves, not from a box around them". Feasible: Fact 9.)**
26. **They scatter every way, a little upward, and fade.** Each mote's heading is drawn at random
    over the full turn, inward over the card as much as out, then leaned up by 0.2 (under 1, so a
    mote drawn downward still goes down); motes may cross the subtitle and each other. A drift,
    not a burst: each starts at 24–96 px/s, none faster than 96 px/s, and all slow as they go,
    each losing 1.8 of its speed per second (a drag): fast out, then slow. Each mote also sways gently
    sideways off its straight path, 2–5 px to either side over a 700–1200 ms period, each its
    own amplitude, period and phase, the sway growing as the mote slows, so a path is not a
    straight line; the sway never turns a mote back along its own heading, and it ends near it.
    **(charter default; the speed cap is the spec's, to keep it dust and not confetti; speed and
    drag, the owner's tune of 2026-11-12, "粒子擴散得再遠一點"; the faster start, stronger drag,
    lean and sway, his second tune, "多一些飄散的感覺", "飄散的軌跡速度可以加一點快到慢的感覺"; the
    wider start speed, lighter drag and wider sway, his third tune, "粒子散的開一點"; the random
    heading and the lighter lean, the same tune, "應該是說也要往內散 目前都是散在同一個方向"; the
    slower start, stronger drag and narrower sway, his fourth tune, "目前散得很平均 但似乎太快太遠"; the
    slower start and narrower sway again, his sixth tune, "粒子調整不要散這麼遠"; the start 20% slower
    again, his seventh tune, "粒子在減少２０％擴散距離".)**
27. **About 1.8 seconds.** 1800 ms, one fixed duration. It passes FS-KYPQ9 §B.2's 1200 ms
    ceiling, under the exception of R33; never over 1800 ms. **(charter default; the duration, the
    owner's tunes of 2026-11-12: the dust carries further and needs the time to fade.)**
28. **Colour.** Every particle starts in the heading's colour (`hudText`, vellum), the subtitle's
    included, and darkens to `hudLabel` (vellumDark) as it drifts, while its alpha falls to 0.
    Tokens only, two of them, no new colour. **(charter default.)**
29. **The dark fades as today, with the particles drawn over it** and under the HUD.
    **(charter default.)**
30. **The climb's card leaves the same way.** There is one card. **(charter default.)**
31. **Reduced motion: no particles.** With `prefersReducedMotion()` true the card fades out as it
    does today (600 ms). **(charter default; the helper is the repo's convention, Fact 11.)**
32. **How many.** Four particles per view px² of ink, at most 6000 for the whole card, spread over
    the strokes in proportion to their ink, each about 1.2 view px across (`fx_dust` × 0.15),
    drawn from the existing `fx_dust` sheet; one emitter. **(spec: enough to hold the letters'
    shapes; no new baked art, Bounds. Size and cap, the owner's tune of 2026-11-12: "粒子再細一點
    多一點"; count and cap doubled, his second tune, "粒子再多1倍"; doubled again, as a trial, his
    fifth tune, "粒子6000個試試".)**
33. **An exception to FS-KYPQ9 §B.6 and §B.2's ceiling, and only these.** The dust is more than
    12 particles (at most 6000), it scatters every way (no particle starts faster than 96 px/s), and
    it lasts 1800 ms, past §B.2's 1200 ms. It still calls no `explode`, and every other rule of §B
    holds for it: one fixed duration, the easing allowlist, no scale bounce, no shake, tokens only,
    at most 3 colours, teardown on end and on scene shutdown. The tests that hold §B.2 and §B.6
    keep holding them for every other effect. **(charter default: the owner's request cannot be met inside §B.6; named here so
    the rule is not quietly broken. Open for the owner, O3.)**
34. **Its numbers are data.** Duration, particle cap, density, speed, drift, sway, the two tokens and the easing
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

- [ ] The card's five timings are today's but its hold, 3000 ms fully shown; its centre is 20% of the view's height from the top (30% above the middle, one named value), its heading 34 px and its subtitle 19 px; all named in one place. (R10)
- [ ] On a world arrival nothing of the place is visible before the dark. (R11)
- [ ] The dark lifts only after the town's or field's first game state is drawn, and only after a run's floor is built from its map; a place built in time lifts on today's schedule. (R12)
- [ ] On a run arrival the card fades in at the first broadcast. (R13)
- [ ] Under the card: state applies, the HUD and notices are readable, input works. (R14)
- [ ] The veil is over the world and atmosphere and under the HUD in all three world scenes. (R15)
- [ ] A resize during the card keeps the view covered, the card centred across and its centre 20% of the new height from the top. (R16)
- [ ] Heading and subtitle use the body serif. (R17)

### The words

- [ ] Each place shows the title and line of the R19 table. (R19–R22)
- [ ] The words live in one table; a field id without an entry fails the type check. (R23)

### The dust

- [ ] At the end of the hold, heading, rule and subtitle break up together and the text is gone. (R24)
- [ ] Every particle starts on a pixel the text drew or on the rule; none in the gaps between letters. (R25)
- [ ] Each particle's heading is drawn at random over the full turn, a card's headings covering all four quadrants, leaned up by 0.2, at 24–96 px/s at the start, slowing at 1.8/s, and all are gone at 1800 ms. (R26, R27)
- [ ] Once a mote has slowed its path sways sideways, not a straight line, at most 5 px off it; it never turns back along its own heading, and ends within 22° of it. (R26)
- [ ] Particles start `hudText`, end `hudLabel`, and no other colour appears. (R28)
- [ ] The dust is drawn over the veil and under the HUD. (R29)
- [ ] The climb's card leaves as an arrival's does, by the one switch (the ash, R41, R53). (R30)
- [ ] With reduced motion, no particle is made and the card fades over 600 ms. (R31)
- [ ] The card makes four particles per view px² of ink, at most 6000, about 1.2 view px across, from one emitter, with no `explode` call. (R32, R33)
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
  outward". R33 makes it the one exception and keeps the drift slow. Since the owner's tune of
  2026-11-12 the exception also covers §B.2's 1200 ms ceiling; since his second tune that day
  the dust lasts 1800 ms, at most 3000 particles; since his third tune it scatters every way,
  inward included; since his fourth tune none starts faster than 200 px/s; since his fifth
  tune, a trial, at most 6000 particles; since his sixth tune none starts faster than 120 px/s; since his seventh,
  none faster than 96 px/s.
- **O4. The subtitle lines** for the town, the two fields and the dev test room are starting
  lines for the browser check.

## Change: Smoke, a trial alternate leave
Status: work-order
Date: 2026-11-12

**An alternate again.** The owner's pick, 2026-11-12: "幫我把煙的效果套到遊戲中" (put the smoke
into the game) made the smoke the card's leave on every arrival and climb. Later that day his
second pick superseded it: "幫我把遊戲中的效果換成灰燼" (make the game's effect the ash). The ash
(§Change: Ash) is now the game's leave; the smoke, like the dust (§D), stays as an alternate in
the code and the gallery, not deleted, its module, numbers and tests unchanged. The heading
keeps its name, the anchor the code was built against.

The owner, on the 6000-mote trial (2026-11-12): "如果做成像煙一樣散掉有可能嗎" (could it go like
smoke?), then "換成煙的效果試試" (try a smoke effect). Offered soft puffs rising off the strokes, a
shader dissolve of the text, or both, the puffs were recommended and taken. Before it was built he
added: "並存 先保留粒子的模組 煙另外做": both stand, the dust's module stays as it is, the smoke is
built apart. **Built as a trial, the game's leave for part of a day, an alternate again:** the
smoke is a second leave, its own module, beside the dust (§D unchanged, the fifth tune's 6000
motes included) in the gallery; the owner said which the game plays, first the smoke, then the
ash (§Change: Ash). Every number below is a starting value.

### Requirements

41. **Two leaves, one switch.** The card can leave as dust (§D) or as smoke (below). One named
    value in the shared card (`src/ui/arrivalCard.ts`) picks which one the game plays, and it
    is **ash** (R53; the owner's second pick, 2026-11-12: "幫我把遊戲中的效果換成灰燼", superseding
    that day's smoke pick, "幫我把煙的效果套到遊戲中"). Each world scene hands the card both leaves; no scene picks. A play may name
    the other leave for itself (the gallery does); a scene's play never does.
    **(the owner's "並存 先保留粒子的模組 煙另外做".)**
42. **The smoke is its own module** (`src/render/effects/cardSmoke.ts`, its own tests). The dust's
    module, its numbers and its tests are unchanged. The smoke reads the strokes as the dust does
    (R25: the two texts' canvases and the rule's line, never a box), through the dust's own
    reading, not a copy of it. **(the owner, as R41.)**
43. **The card leaves as smoke.** When the hold ends, the letters soften: the heading and the line
    blur (a blur growing from none), the heading, the rule and the line drift up a little and fade,
    while soft, round, semi-transparent puffs rise from the strokes. Each puff starts small on a
    point of ink and swells as it rises; puffs overlap, so the smoke reads as one body and not as
    dots, and it thins out as it goes. Without a blur (no WebGL), the letters still drift and fade.
    **(the owner's "像煙一樣散掉"; option A.)**
44. **Slow and soft, never a burst.** Each puff rises at 10–30 px/s on a heading within 35° of
    straight up, at a steady speed, with no drag and no fast start. It curls and wobbles as it
    goes: a sideways sway, 4–10 px to either side over a 1000–1600 ms period, its own amplitude,
    period and phase, growing from none over its life; and a slow turn of the puff itself,
    −30 to 30° a second. **(the owner's brief: "slow and soft, not a burst".)**
45. **Swelling.** A puff's size grows over its life from 0.3 to 1.5 of `fx_smoke`'s frame (about
    10 to 48 view px), easing out, and never shrinks; within FS-KYPQ9 §B.4's 1.6. Its alpha falls
    from 0.35 to 0, easing in: it holds, then thins out.
46. **Colour.** Every puff starts in the card text's colour (`vellum`, `hudText`) and goes to a
    grey (`slateLight`) as it rises. Tokens only, two of them, no new colour (ADR-0013).
47. **How many, and from what.** 0.2 puffs per view px² of ink, at most 400 for the whole card,
    spread over the strokes in proportion to their ink, from one emitter, drawn from the existing
    `fx_smoke` sheet (a baked soft puff, three variants; FS-KYPQ9 §B.10). No new art, no runtime
    texture.
48. **About 2 seconds.** 2000 ms, one fixed duration for every puff and for the smoke; the
    letters are gone by 1200 ms of it.
49. **An exception to FS-KYPQ9 §B.6 and §B.2's ceiling, for the smoke, and only these.** The
    smoke is more than 12 particles (at most 400) and lasts 2000 ms, past §B.2's 1200 ms. It
    never sprays: no puff starts faster than 30 px/s or more than 35° off straight up. It calls no
    `explode`, and every other rule of §B holds for it: one fixed duration, the easing allowlist,
    a scale that only grows and ends at ≤ 1.6, no shake, tokens only, at most 3 colours, teardown
    on end and on scene shutdown. Named as R33's is, beside it; the tests that hold §B.2 and §B.6
    keep holding them for every other effect.
50. **As the dust, for everything else.** Over the veil and under the HUD (R29); reduced motion:
    no smoke, the card fades over 600 ms (R31); a stroke read that fails or finds no ink, or no
    `fx_smoke` sheet: no smoke, the card fades, logged once (R35, Edge States); gone at once on a
    stop, a new card, a view change or a scene's end (R9, R36, the resize edge state).
51. **Its numbers are data.** The smoke's duration, cap, density, speed, heading spread, sway,
    turn, size, alpha, the two tokens, the easings and the letters' blur, rise and fade are one
    typed record in `cardSmoke.ts`, asserted by a vitest; a retune is an edit there.
52. **The gallery shows both.** Two replayable cards, "Arrival card dust" and "Arrival card
    smoke", each playing the whole card (dark, card, hold, leave) with its own leave, on the one
    gallery card, so a replay of either replaces the card still up (R9). Added in the same change
    (`Content: FS-1819Q`).

### Acceptance Criteria

- [ ] The shared card names one switch, and it is ash (R53); a scene's play that names no leave leaves as ash; a play naming the smoke or the dust leaves as that; every world scene hands the card both leaves and none names one. (R41)
- [ ] `cardDust.ts` and its tests are unchanged; the smoke is `cardSmoke.ts` with its own tests and reads the strokes through `strokeCells` / `ruleCells` / `seedPoints`. (R42)
- [ ] Every puff starts on a pixel the text drew or on the rule; none in the gaps between letters. (R42)
- [ ] Played as smoke, the card's letters are not hidden at once: they blur from none, drift up and fade by 1200 ms. (R43, R48)
- [ ] Puffs rise on average, at 10–30 px/s within 35° of up, at a steady speed; each sways and turns; the sway grows from none. (R44)
- [ ] A puff's size grows from 0.3 to 1.5 and never shrinks; its alpha goes 0.35 to 0. (R45)
- [ ] Puffs start `vellum` and end `slateLight`, and no other colour appears. (R46)
- [ ] The card makes 0.2 puffs per view px² of ink, at most 400, from one `fx_smoke` emitter, with no `explode` call. (R47, R49)
- [ ] The smoke is gone at 2000 ms. (R48)
- [ ] With reduced motion, no puff is made and the card fades over 600 ms. (R50)
- [ ] A failed read, no ink or no sheet: no puff, a fade, logged once. (R50)
- [ ] A stop or a new card takes the puffs and the letters' tweens away at once. (R50)
- [ ] The smoke's numbers are one typed record with a vitest on it. (R51)
- [ ] `/dev/gallery` has a dust card and a smoke card that replay the whole card; `effects.test.ts` passes. (R52)

### Edge States

- **No WebGL** (the canvas renderer): no blur filter; the letters drift and fade, the puffs rise.
- **The switch set to smoke** (the owner's pick, 2026-11-12, superseded the same day by the
  ash): every arrival and climb would leave as smoke; nothing else changes.
- **A replay of the other leave in the gallery while a card is up:** the card up is removed, with
  its puffs or motes, and the new one plays (R9).

### Out of Scope

- Taking the dust out, or changing any of its values (the fifth tune's trial stands); it stays an
  alternate in the code and the gallery. Taking the smoke out: since the ash pick it is an
  alternate too, kept in the code and the gallery.
- A shader dissolve of the text (option B), or both at once (option C).
- A setting that lets a player choose; any new art, colour or texture.

## Change: Ash, a trial alternate leave
Status: work-order
Date: 2026-11-12

**Now the game's leave.** The owner's second pick, 2026-11-12, superseding that day's smoke
pick: "幫我把遊戲中的效果換成灰燼" (make the game's effect the ash). The ash is no longer a trial
alternate: it is the card's leave on every arrival and climb. The dust (§D) and the smoke
(§Change: Smoke) stay as alternates in the code and the gallery, not deleted. The heading keeps
its name, the anchor the code was built against.

The owner, beside the smoke trial (2026-11-12): "地圖卡有可能像是灰燼的方式消失嗎" (could the card go
the way ash does?), then "好 做灰燼試試 一樣獨立模組" (good, try ash, again its own module). Locked
with him: a burn front crosses the card's text with a faint ember glow on its edge; the strokes it
passes char and darken; the charred parts flake off as irregular ash flakes, larger than the
dust's motes, dark grey with a dim ember rim, that rise slowly, tumbling, and fade; about 1 s for
the front, about 1 s more for the flakes; a few hundred flakes; reduced motion only fades. **Built
as a trial, now the game's leave:** the ash is a third leave behind the same switch as the smoke
(R41), its own module, shown in the gallery beside the dust (§D unchanged) and the smoke; the
owner said which the game plays, and it is the ash. Every number below is a starting value. The front's shape was left to the build:
it sweeps from one side, the left, the way the words read, ragged by noise.

**The owner's look at the ash, 2026-11-12.** In the gallery he said: "灰燼左到右燒感覺不錯 但是燒掉後的
質感很差 不夠高級 灰燼像泡泡一樣怪怪的": the burn from left to right is good, but what comes off it looks
cheap, not premium, and the flakes look odd, like bubbles. The cause: each flake was a small round
five-to-seven-sided blob of one flat `slate`, ringed all round by an `ember` rim at 0.6, all of
one size range, at one steady speed; a closed ring round a round shape reads as a bubble. The
burn front stays exactly as built (R55: its time, its ragged edge, its ember-to-char band). What
comes off it is reworked toward burnt paper and embers, not shapes: R56 is replaced, R64 (the
embers) is added, and R57–R61 and the criteria follow them. No smoke wisp is added.

| Value | Was | Now |
|---|---|---|
| a flake's shape | a round 5–7-sided blob, the same both ways | a jagged shard, torn at its edge, mostly longer than wide (1.1–2.8 : 1) |
| a flake's size | 3–6 view px across | 1.5–8 view px along its length, many tiny and a few larger |
| a flake's colour | flat `slate`, an `ember` rim all round at 0.6 | `slate` mottled toward `slateLight`; no rim; a third carry an `ember` patch on one edge that dims to grey over their first 500 ms |
| a flake's motion | a steady 12–32 px/s, spinning 90–270°/s | 12–32 px/s, slowing (drag 0.5/s); turning slowly, 20–70°/s; flipping over on one axis every 500–1300 ms; swaying 1.5–4 px |
| sparks | none | at most 40 ember sparks of 1–2 view px, 0.012 per view px² of ink, off the front, at 40–80 px/s, flickering, each gone within 300–600 ms |

**The owner's tune of the ash, 2026-11-12.** With the ash the game's leave, he said: "灰燼燒的速度稍微
慢一點" (the ash should burn a little slower), then "左到右的速度拉長一點" (draw the left-to-right out
a little longer), and gave the number: "2" (two seconds). The front's crossing goes from 1000 to
2000 ms, the same `Linear` ease, the same ragged edge and grain, the same band widths. The ash's
one fixed duration goes from 2000 to 3000 ms, so the last flakes, let go as the front finishes,
still live their 1000 ms. Flakes and sparks are otherwise unchanged. His values replace the
starting values where R55, R57 and R59 stated them, and R57's criterion follows; R59's exception
past §B.2's 1200 ms ceiling now covers 3000 ms. A tune (`Tunes FS-PQ2TW`): R61 names the front's
time and the duration as the record's data.

| Value | Was | Now |
|---|---|---|
| the front's crossing, left to right | 1000 ms | 2000 ms |
| the ash's one fixed duration | 2000 ms | 3000 ms |

**The owner's second tune of the ash, 2026-11-12.** Watching the slower ash, he said: "灰燼感覺不錯
不過灰燼的碎屑再大片一點 有點不明顯 碎屑可以再加一些快滅掉的火光嗎": the ash is good, but the flakes
should be larger, they are hard to see; and could the flakes carry more dying ember light. The
flakes grow: their lengths run 3–14 view px instead of 1.5–8, with a weaker bias toward the small
(1.2 instead of 1.6, so the middle flake is about 8 px instead of about 3.6), and their least
width rises with them, from 1.5 to 3 view px (their shortest length either way, so a small
one stays a shard, not a line); their aspect is unchanged. More of them glow, and the glow dies
like an ember, not a fade: two thirds of the flake shapes carry the `ember` patch instead of a
third; it dims over 700 ms instead of 500, holding its heat at first and going at the end, and
flickers once or twice on the way, a quick dip of about 0.6 of its heat and a recovery within
about 100 ms; it is drawn in 20 frames over those 700 ms, from 12 shades of the patch, instead of
8 frames. The glow stays on the flake, in `ember` only. The front, the timing, the sparks, the
flutter and the motion are unchanged, and so are the flakes' density (0.1 per view px² of ink)
and cap (300): R59's counts stand. His values replace the starting values where R56 stated them,
and R56's criteria follow. A tune (`Tunes FS-PQ2TW`): R61 names the flakes' length, its bias, the
glowing share and its dimming, and now its flicker, as the record's data.

| Value | Was | Now |
|---|---|---|
| a flake's length, its long side | 1.5–8 view px | 3–14 view px |
| the lengths' bias toward the small | 1.6 (middle flake about 3.6 px) | 1.2 (middle flake about 8 px) |
| a flake's least width | 1.5 view px | 3 view px (its shortest length, as before) |
| the share of flake shapes that glow | a third | two thirds |
| a glow's dimming to grey | 500 ms, even steps, 8 frames | 700 ms, holding then going (`Sine.easeIn`), 20 frames from 12 shades |
| a glow's flicker | none | once or twice, between 15% and 70% of its dimming: a dip of 0.6 of its heat and back within 100 ms |

**The owner's third tune of the ash, 2026-11-12.** Watching the larger flakes, he said: "灰盡碎屑稍微散遠
一點 因為從左往右燒 所以灰燼可以稍微往左往上散": spread the flakes a little farther, and since the
front burns from left to right, let the ash drift up and a little to the left, back over what has
already burned, as if the burn's draught carries it. The flakes' heading is now centred 30° left
of straight up instead of straight up, with the same spread of 30° either way about that centre,
so a flake leaves somewhere between straight up and 60° left of up, never to the right of up. Left
is the screen's left, always: the card never turns. They leave faster, 18–45 px/s instead of
12–32, and slow less, a drag of 0.4 of their speed a second instead of 0.5; their life stays
1000 ms, so they go about 1.5 times as far (the average flake about 26 px instead of about
17, the farthest about 37 px instead of about 25). The sparks lean with them, by half: their
heading is centred 15° left of up instead of straight up, their spread (25° either way) and speed
(40–80 px/s) unchanged, so a spark leaves between 10° right of up and 40° left of it. In the same
look he added "灰燼 碎屑的火星在稍微多一些" and, asked whether he meant the sparks, "余光": not more
sparks (their density, 0.012, and cap, 40, are unchanged) but more of the flakes' own afterglow,
the ember light left on the paper. More of the flake shapes glow, 0.85 of them instead of two
thirds (20 of the 24 shapes instead of 16); the glow lasts 900 ms instead of 700, the same
hold-then-go (`Sine.easeIn`), the same one or two flicker dips, the same 20 frames from 12 shades,
so each frame holds a little longer; and the ember patch covers more of a glowing flake, about 1.5
times its area today (about 14% of the flake's pixels at full heat instead of about 10%): its
burnt edge starts 0.28 of the way from the flake's middle to its far side instead of 0.4, and
deepens at the same rate. It is still `ember` only, still on one side, never round the whole
outline (under half of it); a plain flake's grey burnt edge is unchanged. The front, the sizes,
the flicker, the flutter, the sway, the sparks' count and the timing are unchanged. Two of
R59's bounds move with his values: no flake starts faster than 45 px/s or more than 60° off
straight up, no spark more than 40° off it. And the sparks no longer outpace every flake at
leaving (the fastest flake, 45 px/s, now passes the slowest spark, 40): they still rise faster
on average (60 px/s against about 31), which R64's "faster than any flake" now means. His values
replace the starting values where R56, R59 and R64 stated them, and their criteria follow. A tune
(`Tunes FS-PQ2TW`): R61 names the flakes' and the sparks' heading lean beside their spread as the
record's data, and the glowing patch's size (where its burnt edge starts) beside its share and
its dimming.

| Value | Was | Now |
|---|---|---|
| a flake's heading, its centre | straight up | 30° left of straight up (screen-left) |
| a flake's heading, its spread about that centre | 30° either way (30° left to 30° right of up) | 30° either way (straight up to 60° left of up) |
| a flake's start speed | 12–32 px/s | 18–45 px/s |
| a flake's drag | 0.5 of its speed a second | 0.4 of its speed a second |
| how far a flake goes in its 1000 ms | about 17 px on average, at most about 25 | about 26 px on average, at most about 37 |
| a spark's heading, its centre | straight up | 15° left of straight up (screen-left); spread (25° either way) and speed unchanged |
| the share of flake shapes that glow | two thirds (16 of 24) | 0.85 (20 of 24) |
| a glow's dimming to grey | 700 ms, holding then going (`Sine.easeIn`), 20 frames | 900 ms, the same ease, flicker and 20 frames |
| a glowing flake's ember patch | its burnt edge from 0.4 of the way out, about 10% of its pixels hot | from 0.28 of the way out, about 14% of its pixels hot (about 1.5 times the area) |

**The owner's fourth tune of the ash, 2026-11-12.** Watching the ash drift up and to the left, he
said: "灰燼 碎屑少２０％": 20% fewer ash flakes. The flakes' density goes from 0.1 to 0.08 per view
px² of ink, and their cap from 300 to 240, both by a fifth, so a card makes 20% fewer flakes
whether or not it reaches the cap ("The Second Floor" with its line, at the card's 34/19 px type,
about 2400 view px² of ink: about 240 flakes before, about 190 now). The sparks (their density,
0.012, and cap, 40), the sizes, the afterglow, the heading, the speeds, the front and the timing
are unchanged. His values replace the starting values where R56 and R59 stated them, and their
criteria follow. A tune (`Tunes FS-PQ2TW`): R61 already names the flakes' density and cap as the
record's data.

| Value | Was | Now |
|---|---|---|
| the flakes' density | 0.1 per view px² of ink | 0.08 per view px² of ink |
| the flakes' cap, for the whole card | 300 | 240 |

**The owner's fifth tune of the ash, 2026-11-12, and the fire's colour.** Watching the fewer
flakes, he said: "灰燼碎屑再多一點燒焦感": the flakes should look more charred, burnt paper rather
than grey chips. Then, in the same look: "火的顏色有辦法擬真一點嗎": can the fire's colour be more
realistic. Both are folded into one tune of the ash's look; its numbers, its motion and its timing
are unchanged.

*Charred.* A flake's body is char, not slate: near-black (`pitch`) at its core, lifting toward
`slate` by its torn edge (0.08 of the way at its core, 0.55 by its edge, the core reached 2 view px
in), so its core is its darkest part. Its mottling is char blotches, darker spots (0.6 of the way
back toward `pitch`, in patches as before), not lighter speckle; `slateLight` leaves the flake.
Its torn edge goes pale as burnt paper's does as it turns to ash: a dusty ash rim toward
`vellumFaint` (0.85 of the way at the very edge, about 0.75 view px deep), palest on the flake's
burnt side, and broken round the outline, coming and going with the bearing (where its wave falls
under 0.45 the char reaches the edge), so it is never a closed ring. On the dark floor the black
flake keeps its shape by that pale rim and its glow. The glow is now a thin glowing seam on the
edge, the ember eating into it, instead of a patch reaching into the middle: on the flake's burnt
side (from 0.28 of the way out, as before), within about 0.75 view px of the edge, between the
black char and the pale ash it leaves. Its share (0.85 of the shapes), its 900 ms, its flicker and
its area (about 14% of a glowing flake at full heat) are as they were. No curl or fold line was
added: the char and the rim read as burnt paper without it.

*Fire.* Every hot thing was one flat `ember`; fire runs a temperature ramp, hottest near
white-yellow, then orange, then deep red, cooling to char. Three new tokens make the ramp around
`ember`, hottest first: `fireCore` (`#f5d98f`, a pale white-yellow), `fireHot` (`#ea7f26`, orange),
`ember`, `fireDeep` (`#8a2913`, a deep red). They are for fire effects only and never mark an
interactable (amber does; the guideline says so beside the palette). Each hot thing runs it its own
way:
- **The burn's band** (R55): across its fire share (0.06 of the band, unchanged) a pixel goes from
  its ink to `fireCore` in the first tenth (a thin pale leading edge), down to `fireHot` by 0.35,
  `ember` by 0.65 and `fireDeep` at its end; then across the char share (0.08, unchanged) from
  `fireDeep` to `slate`. The front's time, shape, grain and band widths are unchanged.
- **A flake's seam** (R56): it starts `fireHot` and cools down the ramp with its heat, `ember` at
  0.6 of it and `fireDeep` at 0.3, then from `fireDeep` to the pale ash it leaves; its hold, its
  flicker dips and its 20 frames from 12 shades are unchanged.
- **The sparks** (R64): born `fireHot`, cooling to `ember` by 0.45 of their life and `fireDeep` at
  its end, the colour filling the spark (Phaser's fill tint), still drawn additively; their count,
  size, speed, heading, flicker and life are unchanged.

R59's colour bound moves with his words: the ash now uses seven tokens of its own (`fireCore`,
`fireHot`, `ember`, `fireDeep`, `slate`, `pitch`, `vellumFaint`), an exception to FS-KYPQ9 §B.7's
three, and still never `amber`, `amberBright` or `oxblood`. His values replace the starting values
where R55, R56, R58, R59 and R64 stated them, and their criteria follow. A tune (`Tunes
FS-PQ2TW`): R61 names the band's ramp stops, the char's lift and depth, the ash rim's depth,
paleness and gap, the seam's depth and cooling, and the sparks' cooling as the record's data, beside
the tokens.

| Value | Was | Now |
|---|---|---|
| a flake's body | `slate`, mottled lighter toward `slateLight` (up to 0.6) | char: `pitch` at its core lifting to 0.55 of the way to `slate` by its edge, blotched darker toward `pitch` (up to 0.6) |
| a flake's edge | the same paper as its body; one side greyer toward `slateLight` | a broken ash rim toward `vellumFaint` (0.85 at the edge, about 0.75 view px deep), palest on its burnt side, never a closed ring |
| a glowing flake's glow | an `ember` patch on one side, from 0.28 of the way out | a seam on that side's edge band (about 0.75 view px deep), between the char and the ash; share, time, flicker and area unchanged |
| a glowing flake's colour as it dies | `ember` to grey | `fireHot` → `ember` → `fireDeep` → the ash rim |
| the burn's band | its ink to `ember`, then `ember` to `slate` | its ink to `fireCore` (thin), `fireHot`, `ember`, `fireDeep`, then `fireDeep` to `slate` |
| a spark's colour | `ember` throughout | born `fireHot`, cooling to `ember` and then `fireDeep` as it fades |
| fire's tokens | `ember` | `fireCore`, `fireHot`, `ember`, `fireDeep` (new: fire effects only) |
| the ash's own colours | 3: `ember`, `slate`, `slateLight` | 7: `fireCore`, `fireHot`, `ember`, `fireDeep`, `slate`, `pitch`, `vellumFaint` |

**The owner's sixth tune of the ash, 2026-11-12.** Watching the charred flakes, he said:
"灰燼碎屑少一點": a few fewer ash flakes. Read as his fourth tune was, another fifth fewer: the
flakes' density goes from 0.08 to 0.064 per view px² of ink, and their cap from 240 to 192, so a
card makes 20% fewer flakes again whether or not it reaches the cap ("The Second Floor" with its
line, about 2400 view px² of ink: about 193 flakes before, about 155 now). The sparks (their
density, 0.012, and cap, 40), the flakes' look (char, ash rim, seam), the sizes, the afterglow,
the heading, the speeds, the fire's ramp, the front and the timing are unchanged. His values
replace the fourth tune's where R56 and R59 stated them, and their criteria follow. A tune
(`Tunes FS-PQ2TW`): R61 already names the flakes' density and cap as the record's data.

| Value | Was | Now |
|---|---|---|
| the flakes' density | 0.08 per view px² of ink | 0.064 per view px² of ink |
| the flakes' cap, for the whole card | 240 | 192 |

**The owner's seventh tune of the ash, 2026-11-12.** Watching the fewer flakes, he said:
"灰燼碎屑消失的快一點": the flakes should vanish a little faster. Read as 30% sooner: a flake lives
700 ms instead of 1000, its alpha still falling from 1 to 0 (`Sine.easeIn`) over that life. A
glowing flake's seam dies over 630 ms instead of 900, so it still goes out before its flake: the
same hold-then-go (`Sine.easeIn`), the same 20 frames from 12 shades (each frame shorter), the same
one or two flicker dips at the same shares of its dying (between 15% and 70% of it), each still a
dip of 0.6 of its heat and back within about 100 ms. The ash's one fixed duration goes from 3000 to
2700 ms, the front's 2000 ms and then the last flakes' 700 ms. Their speeds, drag and heading are
unchanged, so in their shorter life the flakes travel less far, about a quarter to 30% less (the
average flake about 19 px instead of about 26, the farthest about 27 px instead of about 37), and
turn 14–49° in it instead of 20–70° (their turn, 20–70° a second, is unchanged); a flip still goes
edge-on at least once in a life (its half-turn, at most 650 ms, is inside 700). The sparks (their
count, life, speed and colour), the front, the counts, the sizes, the heading, the speeds, the drag
and the char look are unchanged. His values replace the third and the first tunes' where R56, R57
and R59 stated them, and their criteria follow. A tune (`Tunes FS-PQ2TW`): R61 already names the
flakes' life, the glow's dimming and the duration as the record's data.

| Value | Was | Now |
|---|---|---|
| a flake's life (alpha 1 → 0, `Sine.easeIn`) | 1000 ms | 700 ms |
| a glow's dying to ash | 900 ms, holding then going, one or two flicker dips, 20 frames | 630 ms, the same ease, dips (at the same shares of it) and 20 frames |
| the ash's one fixed duration | 3000 ms (the front's 2000 + a flake's 1000) | 2700 ms (the front's 2000 + a flake's 700) |
| how far a flake goes in its life | about 26 px on average, at most about 37 | about 19 px on average, at most about 27 |

### Requirements

53. **Three leaves, one switch.** The card's switch (R41) takes a third value, **ash**; it is
    **ash** for the game (the owner's second pick, 2026-11-12: "幫我把遊戲中的效果換成灰燼",
    superseding that day's smoke pick, R41). Every world scene hands the card the ash with the
    other two, as it hands it the smoke; no scene picks. A scene's play names no leave and so
    leaves as ash; only the gallery names a leave for a play.
    **(the owner's "一樣獨立模組".)**
54. **The ash is its own module** (`src/render/effects/cardAsh.ts`, its own tests). The dust's and
    the smoke's modules, numbers and tests are unchanged. The ash reads the card's ink as the dust
    does (R25), through the dust's own reading (`strokeCells` / `ruleCells` / `seedPoints`), never
    a box. **(the owner, as R53.)**
55. **The burn, per pixel.** When the hold ends, the card's letters and rule are replaced, in
    their exact place, by one image of them that burns. Each pixel of it carries a fixed
    threshold: how far along it lies from the left edge, made ragged by smooth noise (and a
    little grain, so the edge crumbles). A front sweeps that threshold from 0 past 1 over 2000 ms
    (the owner's tune of 2026-11-12, "左到右的速度拉長一點"; was 1000 ms), linear. Each frame, a pixel the front has not reached is **whole**, drawn as the card drew
    it; a pixel within the band behind the front is **burning**: down fire's ramp from its leading
    edge, a thin pale `fireCore`, then `fireHot`, `ember` and `fireDeep`, charring to `slate`
    toward its trailing edge (the owner's fifth tune of 2026-11-12, "火的顏色有辦法擬真一點嗎"; was
    `ember` to `slate`); a pixel past the band is **gone**.
    The band is 0.06 of ember and 0.08 of char, in threshold units. When the front has crossed,
    every pixel is gone. **(the owner's locked burn; the threshold, the spec's.)**
56. **The flakes: burnt paper.** *(Replaced at the owner's look of 2026-11-12, "灰燼像泡泡一樣怪怪的".)*
    Flakes start where stroke pixels have just burned out: their start points are drawn over the
    strokes and the rule as the dust's are (R25), and each is let go on the frame its pixel goes.
    0.064 flakes per view px² of ink, at most 192 for the whole card, from one emitter (the
    owner's sixth tune of 2026-11-12, "灰燼碎屑少一點"; was 0.08 and 240, and before his fourth,
    "灰燼 碎屑少２０％", 0.1 and 300).
    - **Shape.** A flake is a jagged shard of burnt paper: an uneven many-cornered outline,
      torn at its edge (edge pixels missing or thinned at random), mostly longer than wide
      (1.1–2.8 : 1). Sizes spread wide: 3–14 view px along its length (the owner's second tune
      of 2026-11-12, "碎屑再大片一點"; was 1.5–8), drawn so that the smaller are more, the middle
      flake about 8 px, and no side under 3 view px unless the whole shard is. There is **no
      outline ring**: a flake's edge is the same paper as its body.
    - **Colour.** *(The owner's fifth tune of 2026-11-12, "灰燼碎屑再多一點燒焦感"; was a dark `slate`
      body with faint lighter mottling toward `slateLight`, an `ember` patch dying to grey.)*
      Charred paper: a near-black `pitch` core lifting toward `slate` by the edge, blotched darker,
      its torn edge a broken pale ash rim toward `vellumFaint`, never a closed ring; the glow below
      is a thin seam on the burnt side's edge band, cooling `fireHot` → `ember` → `fireDeep` to the
      ash ("火的顏色有辦法擬真一點嗎"). About 0.85
      of flakes (the owner's third tune of 2026-11-12, "灰燼 碎屑的火星在稍微多一些", "余光"; was two
      thirds, and a third before his second tune, "再加一些快滅掉的火光") carry a glowing `ember` patch on one edge, never round the whole outline, that dies
      like an ember over its first 630 ms (the owner's seventh tune of 2026-11-12, "灰燼碎屑消失的快一點";
      was 900 ms, and before his third, "余光", 700 ms, and before that 500 ms), covering about 1.5 times the area it did before that tune: holding its heat, then going to ash
      grey, and flickering once or twice on the way, a quick dip and a recovery.
    - **Motion: flutter, not spin.** Each rises at 18–45 px/s on a heading within 30° of
      30° left of straight up, so between straight up and 60° left of it, drifting back over what
      has burned (the owner's third tune of 2026-11-12, "往左往上散"; was 12–32 px/s within 30°
      of straight up), slowing a little as it goes (a drag of 0.4 of its speed a second; was
      0.5). It turns
      slowly, 20–70° a second either way, and turns over in depth: its scale on one axis swings
      through zero and back (edge-on, then its other face) once every 500–1300 ms, its own
      period and phase, so every flake goes edge-on at least once in its life. It sways gently
      sideways, 1.5–4 px over 900–1600 ms. Its size is otherwise unchanged; its alpha falls
      from 1 to 0 (`Sine.easeIn`) over its 700 ms life (the owner's seventh tune of 2026-11-12,
      "灰燼碎屑消失的快一點"; was 1000 ms, so it now travels about a quarter to 30% less far).
    - **Drawn at runtime, at the render scale**, so a flake stays crisp at 1, 1.5 and 2.

    **(the owner's "larger than the dust's motes, dark grey ... rise slowly ... and fade", and
    his look of 2026-11-12, "燒掉後的質感很差 不夠高級"; the numbers, the spec's.)**
57. **About 2.7 seconds.** The front takes 2000 ms and a flake lives 700 ms; a spark is gone
    within 600 ms of the front's passing. The ash is gone by 2700 ms, one fixed duration (the
    owner's seventh tune of 2026-11-12, "灰燼碎屑消失的快一點"; was 3000 ms with a 1000 ms flake,
    and before his first tune about 2 seconds: 1000 ms, then 2000 ms).
58. **Colour.** Fire's ramp, `fireCore`, `fireHot`, `ember`, `fireDeep`, for the burning band,
    the flakes' seams and the sparks (the owner's fifth tune of 2026-11-12, "火的顏色有辦法擬真一點嗎";
    was `ember` alone); `slate` for the band's char and the flakes' bodies; `pitch` for a flake's
    char core and blotches; `vellumFaint` for its ash rim (was `slateLight` for its mottling and
    grey; "灰燼碎屑再多一點燒焦感"); the card's own ink (its texts' colours and the rule's `brass`, as
    the card drew them) until a pixel burns. Never `amber` or `amberBright`: the glow is fire, not
    something to act on (guideline, "Gameplay accent"). Tokens only (ADR-0013): the three fire
    tokens were added for this tune, for fire effects only.
59. **An exception to FS-KYPQ9 §B.6, §B.2's ceiling, §B.4 and §B.10, for the ash, and only
    these.** The ash is more than 12 particles (at most 192 flakes, the owner's sixth tune of
    2026-11-12, was 240, and 300 before his fourth; and 40 sparks); its debris
    rises instead of falling or settling, and never sprays: no flake starts faster than 45 px/s
    or more than 60° off straight up, and none heads right of it; no spark faster than 80 px/s or
    more than 40° off it (the owner's third tune of 2026-11-12; was 32 px/s and 30° for a flake,
    25° for a spark). It
    lasts 2700 ms (the owner's seventh tune of 2026-11-12, "灰燼碎屑消失的快一點"; was 3000 ms, and
    2000 ms before his first), past §B.2's 1200 ms. A flake's flip sets its scale on one axis apart from the
    other (§B.4's "no tween sets `scaleX` and `scaleY` to different values"): it is a turn in
    depth, never a squash, a stretch or a bounce; its scale never grows past its size and its
    size never changes otherwise. Its textures are drawn at runtime from tokens, not baked: the
    burning image is the card's own letters, and no baked sheet is a paper shard or a one-pixel
    spark (no baked art is added). It calls no `explode`, and every other rule of §B holds for
    it: one fixed duration, the easing allowlist, no shake, tokens only, teardown on end and on
    scene shutdown. Its colours are the one further exception, to §B.7's three: seven of its own
    (`fireCore`, `fireHot`, `ember`, `fireDeep`, `slate`, `pitch`, `vellumFaint`; the owner's fifth
    tune of 2026-11-12; was three, `ember`, `slate`, `slateLight`). Named as R33
    and R49 are, beside them; the tests that hold §B.2, §B.4, §B.6 and §B.10 keep holding them
    for every other effect.
60. **As the dust, for everything else.** Over the veil and under the HUD (R29); reduced motion:
    no burn, the card fades over 600 ms (R31); a stroke read that fails or finds no ink, or a
    canvas texture that cannot be made: no burn, the card fades, logged once (R35); gone at once,
    its burning image, its texture, its flakes and its sparks with it, on a stop, a new card, a
    view change or a scene's end (R9, R36, the resize edge state).
61. **Its numbers are data.** The front's time and shape, the band and (since the owner's fifth
    tune of 2026-11-12) its ramp's stops; the flakes' density, cap,
    shapes, length and its bias toward the small, aspect, mottling, (since the fifth tune) char lift
    and depth, ash rim depth, paleness and gap, glowing share, seam depth and cooling, and its dimming
    (and, since the owner's second tune of 2026-11-12, its flicker), speed, drag, heading lean
    (since his third tune) and spread, turn, flip, sway, life and alpha; the sparks' density, cap, size,
    speed, drag, heading lean (since his third tune) and spread, life, flicker and (since his fifth)
    cooling; the tokens and the easings are one typed record
    in `cardAsh.ts`, asserted by a vitest; a retune is an edit there.
62. **The gallery shows all three.** A third replayable card, "Arrival card ash", beside "Arrival
    card dust" and "Arrival card smoke", on the one gallery card (R52), so a replay of any
    replaces the card still up (R9). Added in the same change (`Content: FS-1819Q`).
63. **Its cost is measured.** The burn redraws its image on the CPU and uploads it each frame of
    the front. Its per-frame cost on a card of the game's size is measured in a browser and
    reported with the change, so the owner judges the look knowing the price. **(spec: the
    owner accepted a per-frame redraw if measured.)**
64. **Embers.** *(Added at the owner's look of 2026-11-12, "不夠高級".)* As the front passes, a
    sprinkle of tiny ember sparks comes off it: 0.012 per view px² of ink, at most 40 for the
    whole card, from a second emitter, each let go from a start point on the strokes or the rule
    on the frame the front reaches it. A spark is 1–2 view px, born `fireHot` and cooling to
    `ember` and then `fireDeep` as it fades (the owner's fifth tune of 2026-11-12, "火的顏色有辦法擬真一點嗎";
    was `ember` throughout), drawn additively so it reads as light; it rises faster than the flakes, 40–80 px/s within 25° of 15° left of
    straight up (the owner's third tune of 2026-11-12, "往左往上散"; was within 25° of straight up;
    since that tune the fastest flake passes the slowest spark, and the sparks are faster on
    average, 60 px/s against about 31), slowing
    a little (1.5 of its speed a second), flickers (its alpha beating at 6–14 Hz as it falls to
    0), and dies out within 300–600 ms of leaving. A spark brightens by its additive blend and
    fire's ramp, never by `amber`. Drawn at runtime at the render scale, as the flakes are.

### Acceptance Criteria

- [ ] The switch's values are dust, smoke and ash, and it is ash; a scene's play that names no leave leaves as ash; every world scene hands the card the ash with the others and none names one. (R53)
- [ ] `cardDust.ts`, `cardSmoke.ts` and their tests are unchanged; the ash is `cardAsh.ts` with its own tests and reads the strokes through `strokeCells` / `ruleCells` / `seedPoints`. (R54)
- [ ] Played as ash, the card's letters are hidden and a burning image of them stands in their place. (R55)
- [ ] The front advances from the left: the burned share of the ink only grows, and its burning band moves right on average; every stroke pixel is gone when the front has crossed. (R55)
- [ ] The burning band runs fire's ramp, hottest at its leading edge: a thin `fireCore`, then `fireHot` and `ember`, then `fireDeep`, then `slate` char at its trailing edge; pixels ahead of the front are as the card drew them. (R55, R58; the owner's fifth tune of 2026-11-12, was `ember` to `slate`)
- [ ] Every flake starts on a stroke pixel or the rule, never in a gap, and only once that pixel has burned out. (R56)
- [ ] Flakes rise on average, starting at 18–45 px/s and slowing a little (a drag of 0.4), over a 700 ms life, so they go about a quarter to 30% less far than over 1000 ms (about 19 px on average, at most about 27); their mean heading leans about 30° left of up, none heads right of straight up or more than 60° left of it; each turns slowly, 20–70° a second; 0.064 per view px² of ink, at most 192, from one emitter, with no `explode` call. (R56, R59; the owner's third tune of 2026-11-12, was 12–32 px/s within 30° of up; his fourth, "灰燼 碎屑少２０％", was 0.1 and 300; his sixth, "灰燼碎屑少一點", was 0.08 and 240; his seventh, "灰燼碎屑消失的快一點", was a 1000 ms life, about 1.5 times as far as at 12–32 px/s and 0.5)
- [ ] Each flake flips: its scale on one axis passes through edge-on (zero) and changes sign within its life, never growing past its size; the other axis keeps its size. (R56, R59)
- [ ] No flake draws a closed outline ring: its pale ash rim is broken, the char reaching its edge in places, and a glowing flake's fire lies on one side, on less than half of its outline. (R56; the owner's fifth tune of 2026-11-12)
- [ ] A flake is charred: its core darker than its body and its rim, its torn edge lighter than its body, its blotches darker spots; a glowing flake's fire lies on its edge band, within about a view px of its edge, mostly on the edge itself. (R56; the owner's fifth tune of 2026-11-12, "灰燼碎屑再多一點燒焦感")
- [ ] The flakes span a range of sizes (from about 3 to about 14 view px long, the middle one about 8, more of them small than large; no side under 3 view px unless the whole shard is) and of aspect ratios (some near 1, many longer than wide). (R56; the owner's second tune of 2026-11-12, was about 1.5 to about 8)
- [ ] A cold flake's pixels are mixes of `pitch`, `slate` and `vellumFaint`; 0.85 of the flake shapes glow, a glowing flake's seam covering about 14% of it at full heat (about 1.5 times the area before the owner's third tune), and cools from `fireHot` through `ember` to `fireDeep` and then to ash over its first 630 ms, never hotter or yellower than a moment before but for its heat dipping and recovering once or twice before it goes; no other colour appears but the card's own ink. (R56, R58; the owner's seventh tune of 2026-11-12, "灰燼碎屑消失的快一點", was 900 ms; his fifth, was `slate`, `slateLight` and `ember`; his third, "余光", was two thirds over 700 ms; his second, was a third over 500 ms)
- [ ] Sparks are few (0.012 per view px² of ink, at most 40), 1–2 view px, born `fireHot` and cooling only, through `ember` to `fireDeep` as they fade (the owner's fifth tune of 2026-11-12, was `ember`), additive, leave from the strokes as the front reaches them, rise at 40–80 px/s within 25° of a heading 15° left of up (faster than the flakes on average), flicker, and are gone within 600 ms. (R64, R59; the owner's third tune of 2026-11-12, was within 25° of straight up)
- [ ] The front crosses in 2000 ms, linear, a flake fades over 700 ms, and the ash is gone at 2700 ms. (R55, R57, R59; the owner's seventh tune of 2026-11-12, "灰燼碎屑消失的快一點", was a 1000 ms flake and 3000 ms)
- [ ] With reduced motion, no burn and no flake are made and the card fades over 600 ms. (R60)
- [ ] A failed read, no ink or no canvas texture: no burn, a fade, logged once. (R60)
- [ ] A stop or a new card takes the image, its texture, its flakes, its sparks and its front away at once. (R60)
- [ ] The ash's numbers are one typed record with a vitest on it. (R61)
- [ ] `/dev/gallery` has dust, smoke and ash cards that replay the whole card; `effects.test.ts` passes. (R62)
- [ ] The burn's per-frame cost is measured in a browser and reported. (R63)

### Edge States

- **No WebGL** (the canvas renderer): the burning image is a canvas texture either way; nothing changes.
- **The switch set to ash** (the owner's second pick, 2026-11-12, superseding the smoke): every
  arrival and climb leaves as ash; nothing else changes.
- **A resize while it burns:** the card and its ash are removed (R60), as for the dust.
- **A text drawn at another resolution than the other** (none today): the image is drawn at the
  finer one, the coarser text sampled up to it.

### Out of Scope

- Taking the dust or the smoke out, or changing any of their values. Both stay as alternates in
  the code and the gallery; the ash is the game's leave.
- A shader burn on the GPU; a burn spreading from several points.
- A setting that lets a player choose; any baked art; any new colour or token beyond the fire
  ramp's three (the owner's fifth tune of 2026-11-12).
- A wisp of smoke off the front (`fx_smoke` at a low alpha): offered with the rework of
  2026-11-12 as optional, not built; the ash stays free of the art library.
