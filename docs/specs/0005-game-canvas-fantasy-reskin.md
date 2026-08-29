# FS-0005: Fantasy-medieval presentation in the game canvas

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "## Capabilities" → "### Presentation" → "Fantasy-medieval presentation in the game canvas" → this FS · Art SSOT: [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md) Part I · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) · Sibling: [FS-0004](0004-web-platform-fantasy-reskin.md) (web platform, shipped) · Related ADRs: [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (token-only styling, fence-enforced)

## Summary

The Phaser canvas is the half of the client FS-0004 did not touch. It still draws in a cold
sci-fi blue-grey, renders 56 of its 59 text objects in Phaser's default sans, opens on an
unthemed stock loading bar, and is lit from nowhere. It also now disagrees with the DOM: FS-0004
lifted the base surfaces and swapped the display face out from under it.

This feature brings the canvas onto the same palette, the same type, and the same world — a
torch-lit crypt rather than a tech demo. It introduces a **semantic canvas palette** so scenes
name intent (`palette.wall`, `palette.interactable`) rather than colour, adds a **static vignette
plus a torch pool that follows the delver**, and gives gameplay its **own accent rule**, because
"one torch per view" is a rule about emphasis on a web page and would actively hide interactables
in a dungeon.

Still code-only: no sprites, no tiles, no 9-slice frames. Everything is drawn with the primitives
already there. The Part I rules that presuppose art assets stay pending against a future asset FS.

## Requirements

### A. Amend Part I of the visual SSOT (prerequisite)

Same shape as FS-0004 §A: the guideline holds the values, this spec states the properties the
amendment must satisfy. Part I currently describes a pixel-art game that does not exist yet, and
gives gameplay no accent rule at all.

1. **A gameplay accent rule is added**, distinct from Part II's one-torch rule and explicitly
   scoped to the canvas. In gameplay, colour is a **readability channel, not emphasis** — an
   interactable a player cannot find at a glance is a broken game, not a busy screen. The rule
   assigns semantic channels: amber = interactable / actionable, arcane green = safe / friendly /
   restorative, oxblood = damage / danger / hostile, vellum = neutral HUD and labels, brass =
   frame and chrome. The amendment must say plainly that **one-torch does not govern the canvas**,
   and why, so the two rules are not read as a contradiction.
2. **Part I typography is amended** to blackletter display + old-style serif body, matching
   FS-0004, and **recorded as a deliberate deviation** from Part I's current "medieval
   pixel/bitmap font (Alagard)". Rationale to state: a bitmap font is a *pairing with pixel art*,
   and there is no pixel art yet; pairing one with vector primitives reads as an accident. The
   amendment must note that the pixel font becomes correct again when the asset FS lands.
3. **The ≥28px blackletter bound applies to the canvas too**, and the amendment names its
   permitted canvas surfaces. HUD text is small by nature, so in practice this is the main-menu
   title and the end-of-run overlay heading, and nothing else.
4. **A lighting rule is added**: static vignette at the canvas edges plus a warm pool centred on
   the delver. The amendment must state the readability floor — the vignette may never make an
   entity at the canvas edge unreadable, and enemies whose accent is "glowing eyes" are the case
   that tests it.
5. **The amendment names which Part I rules remain pending on assets** — nearest-neighbour
   rendering, dithered shading, selective dark outlining, 9-slice pixel borders,
   `image-rendering: pixelated`. FS-0005 does not discharge them, and the guideline must not read
   as though it did.

### B. The canvas palette module

6. A new module exposes the canvas palette **semantically**: `palette.wall`, `palette.floor`,
   `palette.door`, `palette.container`, `palette.interactable`, `palette.enemy`, `palette.player`,
   `palette.damage`, `palette.hud`, `palette.frame`, and whatever else the scenes actually need.
   Names describe **what the thing is**, never what colour it is.
7. Every value resolves from `BARROW_HEX`. The module introduces **no new hex literal**; if the
   palette lacks a needed value, it is added to `theme.ts` *and* `globals.css` first (ADR-0013).
8. The canvas base agrees with the DOM. The world background is currently `0x0d0b0a` — the base
   FS-0004 lifted to `0x1c1613`. Canvas and DOM must not disagree about what "dark" means.
9. Scenes import the semantic module, **not `BARROW_HEX` directly**. `BARROW_HEX.slate` at a call
   site says nothing about whether slate is right for a door; `palette.door` does, and it makes
   the next retheme one file instead of another 377-site sweep.

### C. Typography

10. **Fix the regression FS-0004 introduced.** Three text objects declare
    `fontFamily: "Cinzel, Georgia, serif"`, and Cinzel is no longer loaded — they are silently
    falling back to Georgia today.
11. **All 59 `add.text` objects declare a font.** Only 3 do; the other 56 fall through to Phaser's
    default sans, which is the single loudest non-medieval signal on the screen.
12. Font families reference the same faces the DOM loads. Phaser cannot read CSS custom
    properties, so the canvas needs its own constant — defined once, in the palette module or
    beside it, never repeated per call site.
13. Blackletter only on the surfaces §R3 permits, never below 28px. Everything else — HUD,
    labels, buttons, tooltips, counters — uses the body serif.

### D. Recolour the canvas

14. All **377 presentation colour sites** move to the semantic palette:
    `BarrowspireScene.ts` (245), `MainMenuScene.ts` (62), `EquipmentPanel.ts` (40),
    `LoadoutScene.ts` (16), `spriteGenerator.ts` (8), `PreloadScene.ts` (3), and the three
    user-visible connection-status colours in `SocketManager.ts`.
15. The off-palette values are removed. Known set: the sci-fi slate ramp `0x4a5568` (13×),
    `0x3a4556` (10×), `0x2a3040`, `0x5a6577`, `0x6b7280`; mint `0x4ecca3` (8×); raw `0xffffff`
    (11×) and `0x000000` (11×); off-ramp glow `0xffaa44` (8×), `0xaaddff`, `0xf2e3b8`; and
    `0xff4466`, `0x4a4a44`, `0xb8d08a`. The fence defines completeness, not this list.
16. Amber's 65 uses are re-examined against §R1 — not reduced for scarcity's sake, but each one
    must now mean *interactable or actionable*. An amber thing the player cannot act on is the
    defect this requirement exists to catch.
17. **`spriteGenerator.ts` is the delver.** Its cloak, ink and hood-shadow values are already
    barrow-toned but hardcoded, and its `ink` is the stale `0x0d0b0a` base. The player character
    is the most-looked-at object in the game and gets the same treatment as everything else.
18. **`PreloadScene` is themed end to end** — the `0x222222` box, the white progress bar, and the
    literal string `"Loading..."`. It is the first thing a player sees and currently reads as a
    stock Phaser demo.

### E. Lighting

19. A **static vignette** darkens the canvas edges.
20. A **warm torch pool** is centred on the delver and moves with them. The pool is what makes the
    scene read as *carrying a torch* rather than merely dark; the vignette does the atmospheric
    work around it.
21. The overlay is **built once and depth-sorted above the world, then repositioned per tick —
    never rebuilt.** `BarrowspireScene` redraws from a full-state broadcast every tick; allocating
    a new overlay inside that loop is a per-frame cost at 60Hz for a layer that never changes
    shape.
22. **Readability is verified, not assumed** (§R4's floor). Entities at the canvas edge, and
    enemies read by their eyes against dark, must stay legible with the overlay active.

### F. Voice

23. `operator` / `Operator` (`BootScene.ts:42,47`) and the version string in
    `MainMenuScene.ts:296` conform to [`CONTEXT.md`](../../game-client/CONTEXT.md) and
    `CLAUDE.md`'s Wording & Tone list — the same list that already forbade `operator` while it
    shipped.
24. `"Loading..."` in `PreloadScene` takes the lore voice, subject to the same rule as everywhere
    else: a message the player needs in order to act stays plain.

### G. Extend the fence

25. The ADR-0013 fence widens to cover the canvas layer. FS-0004 scoped it to the DOM surface and
    printed the uncovered files by name; those names come off the list here.
26. **Two exclusions survive, both named and justified in the config, neither a colour exemption:**
    - **Dead code** — `GameScene.ts` (5), `GameOverScene.ts` (8), `src/game/`. Unregistered, no
      importers, renders nothing. Restyling code nothing draws is waste; deleting it is a
      separate decision, not a styling one.
    - **Devtools console styling** — `gameStateLogger.ts` (13) and the one `console.log('%c…')` in
      `SocketManager.ts`. Browser-console colour is not presentation and is not governed by the
      art direction.
27. Both exclusions stay **visible in the fence output**, exactly as the DOM/canvas gap was. A
    green check must never read as "the tree is clean" when it means "the tree minus a named list
    is clean".
28. The widened fence is proven with the `lint-fence.sh` pattern — asserted to reject a fixture
    *and* accept the tree — per ADR-0013.

## User Stories

1. As a **delver entering a run**, I want the world to look like a torch-lit crypt, so that the
   game matches the site that sold it to me.
2. As a **delver**, I want warm light around me and dark pressing in at the edges, so that I feel
   like I am carrying a torch into a barrow rather than looking at a dark screen.
3. As a **delver**, I want the walls, floor and doors in earth and stone tones, so that the world
   reads as a dungeon and not as a wireframe.
4. As a **delver**, I want to spot what I can interact with at a glance, so that colour helps me
   play rather than merely decorating the screen.
5. As a **delver**, I want damage and danger to read instantly as hostile, so that I can respond
   without parsing the HUD.
6. As a **delver**, I want friendly and restorative things to read as safe, so that I do not
   hesitate over a health pickup mid-fight.
7. As a **delver**, I want HUD text in the same serif as the rest of the game, so that the
   interface does not look like a debug overlay.
8. As a **delver**, I want the main menu title in blackletter, so that the game announces itself
   the way the site does.
9. As a **delver**, I want HUD numbers and labels legible at small sizes, so that atmosphere never
   costs me information I need in a fight.
10. As a **delver**, I want the loading screen to belong to the game, so that the very first frame
    is not a stock progress bar.
11. As a **delver**, I want my character to look like a cloaked figure with a lantern, so that the
    thing I control reads as a delver.
12. As a **delver**, I want enemies readable against dark ground even at the screen edge, so that
    the vignette never costs me a fight.
13. As a **delver**, I want the frame rate to hold with the lighting on, so that atmosphere does
    not cost responsiveness.
14. As a **delver**, I want to be called a delver in-game as well as on the site, so that the two
    halves speak one language.
15. As an **implementer**, I want to write `palette.door` rather than a hex, so that I am stating
    intent and not guessing whether slate suits a door.
16. As an **implementer**, I want one place to change a colour, so that a retheme is not a
    377-site sweep across a 4.4k-line file.
17. As an **implementer**, I want the canvas and the DOM to agree on the palette, so that "dark"
    means one thing in the client.
18. As a **reviewer**, I want a 245-site recolour to read as intent rather than as a wall of hex,
    so that the diff can actually be reviewed.
19. As a **reviewer**, I want a lint failure rather than a judgment call when someone types a raw
    hex in a scene, so that the canvas does not drift the way it already did once.
20. As a **reviewer**, I want the fence to name what it does not cover, so that a green check is
    never mistaken for full coverage.
21. As the **next person to touch the canvas**, I want the gameplay accent rule written down, so
    that "why is this amber" has an answer that is not taste.

## Acceptance Criteria

- [ ] Part I carries a gameplay accent rule with semantic channels, and states that one-torch does not govern the canvas
- [ ] Part I typography is amended, with the pixel-font deviation recorded and its revisit condition named
- [ ] The ≥28px blackletter bound and its permitted canvas surfaces are stated
- [ ] A lighting rule with a readability floor is stated
- [ ] The Part I rules still pending on assets are named as pending
- [ ] A semantic canvas palette module exists; names describe intent, not colour
- [ ] Every palette value resolves from `BARROW_HEX`; the module adds no new hex
- [ ] The canvas base matches the DOM base
- [ ] No scene imports `BARROW_HEX` directly
- [ ] No text object references Cinzel; the Georgia fallback regression is gone
- [ ] All 59 `add.text` objects declare a font family
- [ ] Blackletter appears only on permitted canvas surfaces, never below 28px
- [ ] All 377 presentation colour sites resolve from the semantic palette
- [ ] Every off-palette value in §R15 is gone
- [ ] Every remaining amber use marks something interactable or actionable
- [ ] The delver sprite's colours resolve from the palette, including its stale base
- [ ] `PreloadScene` is fully themed, progress bar and copy included
- [ ] A static vignette renders at the canvas edges
- [ ] A torch pool follows the delver
- [ ] The overlay is allocated once and repositioned, not rebuilt per tick
- [ ] Entities at the canvas edge remain legible with the overlay active, verified in a running game
- [ ] No `operator` or sci-fi version string in canvas copy
- [ ] The fence covers the canvas layer
- [ ] Only the two §R26 exclusions remain, named and justified in the config
- [ ] The fence prints its exclusions on every run
- [ ] The widened fence is proven to reject a fixture and accept the tree
- [ ] `npm run build`, `npm run lint`, `npm test` and `./lint-fence.sh` pass

## Edge States

- **The overlay hides an enemy at the canvas edge.** The failure this feature is most likely to
  ship. The vignette is atmosphere; an unreadable hostile is a bug. If the two conflict, the
  vignette yields — reduce its strength or its reach, and say so.
- **The torch pool at a wall or corner.** The delver against the canvas edge or in a corridor must
  not produce a pool clipped into an obviously wrong shape, or a hard visible edge where the pool
  meets the vignette.
- **Frame cost at 60Hz.** The overlay plus a full-state redraw every tick is unmeasured. If it
  costs frames, the overlay is the thing that gives, not the tick rate.
- **Reconnect and scene restart.** `BarrowspireScene` can be re-entered on reconnect. The overlay
  must not be allocated twice, and must not survive as an orphan into the next run.
- **`current_player === null`** (the delver escaped or died). The torch pool has nothing to follow.
  It must resolve to something deliberate — fade out, or fall back to the static vignette — rather
  than tracking a stale position or throwing.
- **Blackletter in the end-of-run overlay.** The one heading permitted it, and also the moment a
  player most wants to read the result. If the size bound and the message conflict, the message
  wins and the heading takes the body serif.
- **A colour the semantic palette lacks.** Adding it means `theme.ts` *and* `globals.css`, in that
  order, as a visible palette change. Never an inline literal, and never a raw `BARROW_HEX` lookup
  smuggled into a scene to dodge the module.
- **HUD text at small sizes on a busy background.** The canvas has no contrast floor the way the
  DOM does, because it draws over arbitrary world colour. Where HUD text sits on the world rather
  than on a panel, it needs its own ground — a plate, a shadow, or an outline.
- **The dead scenes come back.** If `GameScene` or `GameOverScene` is ever registered, it enters
  the fence's scope and this FS's exclusion no longer applies to it.

## Risks and fallbacks

- **The 245-site `BarrowspireScene` recolour is the bulk of the diff** and is mechanical but very
  wide. The semantic palette (§R6) exists largely to make it reviewable; if the module's names
  turn out not to fit what the scene actually draws, fix the names rather than falling back to raw
  lookups — the module is the deliverable, not the shortcut.
- **The gameplay accent rule is new and untested against real play.** It is written from the
  screen, not from a session. If amber-as-interactable turns out to over-mark the screen, the
  channel assignment is the thing to revise, not the principle that gameplay colour is functional.
- **Blackletter in-game is riskier than on the web.** HUD text is small and read under pressure.
  The ≥28px bound leaves very little canvas surface eligible, which is intended; if even the menu
  title proves hard to read at size, the FS-0004 fallback applies here too (Grenze, MedievalSharp,
  IM Fell).

## Out of Scope

- **All image assets** — sprites, tiles, 9-slice frames, textures. Parked as a later FS, along
  with the Part I rules that depend on them (§R5).
- **Procedural `CanvasTexture` generation.** Considered and rejected: it approaches pixel art
  without asset files, but hand-authored tiles supersede it, so it is throwaway work.
- **Tile grid size, world projection, camera, and the animation rig's frame counts and
  directions** — layout and logic, not art, per the guideline's own out-of-scope list.
- **Full dynamic lighting with wall occlusion.** A rendering feature, not a styling pass.
- **Deleting the dead `GameScene` / `GameOverScene` / `src/game/` code.** Excluded from the fence,
  not removed; deletion is its own decision.
- **Devtools console styling** (`gameStateLogger.ts`). Not presentation.
- **Game logic, networking, ECS, `ClientGameState` interpretation, anything under `game-server/`.**
- **Endpoint changes.** This feature adds and changes no HTTP or WS surface, which is why this
  spec carries no API surface section.
- **The web platform** — [FS-0004](0004-web-platform-fantasy-reskin.md), shipped.
