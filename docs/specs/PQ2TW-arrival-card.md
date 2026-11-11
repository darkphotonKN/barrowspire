# FS-PQ2TW: Arrival card

> Status: draft · SPECIFICATION.md: none. This is a change FS with no thin line of its own (`docs/specs/README.md`, The FS ledger). Each owning FS carries the stub `## Change: Arrival card → FS-PQ2TW`: [FS-F6F88](F6F88-multi-floor-delves.md), [FS-KE075](KE075-floor-1-dungeon.md), [FS-29KSH](29KSH-hub-world-and-delve-entry.md), [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md), [FS-KYPQ9](KYPQ9-remainder-restyle-town-dressing-and-effects.md) · Surface: game-client only

## Scoping notes (raw)

Scoped 2026-11-11 under the owner's charter ("進場卡"). The locked decisions below are the owner's
answers (approved 2026-11-11, "核准"); the lock preview was approved under the charter, nobody was
asked anything. Not challenged: presentation only, cheap to undo.

**Why.** Owner, playtest 2026-11-11: "之前好像進到不同地圖時會有一個全畫面的區域顯示 再慢慢淡出 剛進一樓似乎沒顯示".
What he remembered is the climb's floor card (`playFloorTransition` in
`game-client/src/scenes/BarrowspireScene.ts`, copy from `floorCard` in `src/ui/floor.ts`), played
only when `floor` increases (FS-F6F88 req 32): never on entering floor 1, never in the hub or a
field. Then: "我要再進入每個地方時都有這種效果 可以寫成一個adr" and "進場卡消失時可以有點特效嗎
像是消失時是變成粒子粉末的方式向周圍散開".

**Shape: a change FS with stubs, no new thin line.** Ownership check (`docs/specs/README.md`, five-bin
sorter), by what the thing does (a card that names the place the player has just come into):

- `game-client/SPECIFICATION.md` "Escape run" → "Floor transitions → FS-F6F88" already owns that
  card for a climb (req 32). A new line "Arrival card on entering a place" would claim the same
  card a second time: a duplicate, and the climb's card would have two ledgers.
- For the hub and the fields the card is a behaviour of entering them: "Hub scene → FS-29KSH",
  "Field world scene → FS-X2F2H". Their acceptance criteria change; their lines stay true.
- So it is one design change across several capabilities: its own change FS, a pointer stub on
  each owner, no line. Same shape as FS-M8CSE.
- Stubs: FS-F6F88 (req 32: the card also plays on floor 1, and leaves as dust), FS-KE075 (§H.41:
  the veil is held for the first floor's map too), FS-29KSH (the hub scene), FS-X2F2H (the field
  scene), FS-KYPQ9 (§B.6: the card's dust is more than 12 particles and drifts outward).
- No line reworded. No tuning. Content: one dev-gallery card (`Content: FS-1819Q`).
- Routed to record-decision: every arrival plays the card, through one shared piece.
- Routed to domain-model: **arrival**, **arrival card**.

**Locked decisions (owner).**

- A card plays on arriving in any world or floor: the hub (the town), every field (Gentle Meadows,
  the Forlorn Forest), the Spire's first floor, every climb (as today), a Master Spire. Walking
  into a town building (the Inn, the store) is not an arrival and plays nothing.
- The rule is an ADR; one shared piece plays the card for every scene (today it is inside the run
  scene).
- Motion is the climb's: full dark, the card fades in, the view comes back up, and only once the
  place is built (as FS-KE075 §H.41 holds a climb's veil until the floor's map is built).
- Title is the place's name: fields by their existing names, the Spire's floors as today, the hub
  by whatever name the specs already give it. No invented place name.
- One subtitle line per place, lore voice. Floor 1: "The barrow takes you in." The rest are
  starting lines, to be edited by the owner in the browser check.
- A reconnect or a refresh back into the same place plays nothing (FS-F6F88 req 32 says so for
  floors 2–3). Returning to the hub when a run ends is an arrival and plays.
- During the card the HUD, input and server state carry on: presentation only.
- Leaving as dust: the card's text breaks into particles that drift outward and a little upward
  and fade, about 1 s (starting value). Particles rise from the letters' strokes, not from a box;
  heading, rule and subtitle break up together; particles take the heading's colour and darken
  (tokens only); the veil fades as today with the particles over it. The climb's card leaves the
  same way. Reduced motion: no particles, the card fades.
- The effect gets a replayable dev-gallery card (`src/dev/gallery/effects.ts`).
- Bounds: game-client only. Not `game-server/`, proto, gateway, or a shipped FS's existing text.

**Facts found while scoping (verified in the tree at `28a7a377`).**

- The hub has no proper name. `game-client/CONTEXT.md` "Town": "the hub, as the owner and the lore
  say it… The screen may say town"; its Open list: "A proper name for the town (if it ever gets
  one) is still open." The main menu's button is "ENTER THE TOWN". Party copy says "village" in
  three places. So the title is "The Town", from CONTEXT.md; a proper name is the owner's call.
- Field names exist: `FIELD_NAMES` in `src/scenes/hubGates.ts` ("The Forlorn Forest", "Gentle
  Meadows", "Dev Test Room").
- Master Spire: FS-M8CSE R10 "No Master Spire card", and the client never learns the height. Read
  as: a Master Spire is a run, its floors play the same cards, nothing names it.
- Arrival or return: the server sends the same `world_entered` for both (`worldEnteredMessage`,
  `game-service/internal/gameserver/hub.go`); `WorldEnteredPayload` carries no flag. A socket
  reconnect with the page alive can be told: `gameStore` still holds the session id (`setWorld`
  compares it today to keep the floor map). A page refresh cannot: nothing of the world outlives
  the page. All three scenes are the same in this. The run alone has a second signal, for floors:
  `lastFloor` is unset on the first broadcast (`climbed`).
- Town buildings add no world (FS-B0H2D, ADR-0015): no `world_entered`, so nothing plays.
- FS-C4JWH A1.4: a world scene fades in from black over 200 ms as its `create` runs. The card's
  veil is up from `create`, so the fade reveals the veil.
- Engine (Phaser 4.2.1, installed source): a `Text` draws to its own 2D canvas (`Text.canvas`,
  `Text.context`, a `CanvasTexture` with `getPixel` / `getPixels`); an emitter takes a random zone
  from any object with `getRandomPoint`, and `emitParticleAt(x, y)`. So particles can be seeded
  from the letters' own pixels.
- FS-KYPQ9 §B.6 (shipped): "No confetti… A one-shot emits at most 12 particles… never sprays
  outward", and `sourceScan.test.ts` bans `explode(`. The dust needs hundreds of motes and drifts
  outward: an exception the owner's request makes, named on FS-KYPQ9's stub.
- Reduced motion: `prefersReducedMotion()` in `src/render/effects/mist.ts`, used by `PartyFrames`
  and `itemShine`; guideline lines 512, 716, 985, 1195.
- The gallery wants one card per module in `src/render/effects/` (`effects.test.ts`).

**Open, for the owner.** The hub's title; how a page refresh is told from an arrival; the
exception to §B.6; the starting subtitle lines.
