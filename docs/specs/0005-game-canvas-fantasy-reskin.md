# FS-0005: Fantasy-medieval presentation in the game canvas

> Status: draft · SPECIFICATION.md: `game-client/SPECIFICATION.md` "## Capabilities" → "### Presentation" → "Fantasy-medieval presentation in the game canvas" → this FS · Art SSOT: [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md) Part I · Sibling: [FS-0004](0004-web-platform-fantasy-reskin.md) (web platform) · Related ADRs: [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (token-only styling, fence-enforced)

## Scoping notes (raw)

Session date: 2026-08-28. Same trigger as [FS-0004](0004-web-platform-fantasy-reskin.md) — one
scoping session, split into two work orders because the mediums diverge completely. Read
FS-0004's notes for the shared diagnosis and the guideline-amendment decision; this file carries
only what is specific to the Phaser canvas.

### State of the canvas

Part I of the design guideline (pixel art, blackletter display, medieval pixel/bitmap body font,
9-slice frames, torch-lit crypt) is **essentially unimplemented**. `docs/theming_plan.md` already
lists the canvas reskin as "Planned / Not Started" — this FS is that work, minus the assets.

Audit:

- **No sprites, no assets.** `public/` is empty. `BarrowspireScene.ts` (~4.4k lines) draws with
  primitives: 32 `add.graphics`, 3 `add.rectangle`, 1 `add.circle`, 23 `add.text`. The two
  `add.image` / three `add.sprite` calls have nothing to load.
- **Sci-fi slate survives.** `0x4a5568` (13×), `0x3a4556` (10×), `0x2a3040`, `0x5a6577`,
  `0x6b7280` — cold blue-greys with no place in the barrow ramp.
- **Raw white and off-ramp glow.** `0xffffff` (8×), `0xffaa44` (8×), `0xaaddff`, `0xf2e3b8`.
- **Off-palette mint.** `#4ecca3` (7×) — the same sci-fi residue found in the web CSS.
- **Fonts barely wired.** `fontFamily: "Cinzel, Georgia, serif"` appears in exactly **3** places
  across all scenes; the other 20 text objects fall through to the Phaser default sans.
- **`PreloadScene` is completely unthemed** — `0x222222` box, `0xffffff` progress bar, `#ffffff`
  text, the literal string `"Loading..."`. It is the first thing a player sees.
- **Sci-fi copy in-scene:** `operator` / `Operator` (`BootScene.ts:42,47`), `v0.1`
  (`MainMenuScene.ts:296`).
- `theme.ts` already exports `BARROW_HEX` as Phaser `0x` ints — the ramp is available, just
  unused in most of the drawing code.

### Decisions

**Depth — palette + type + lighting overlay.** The pass covers:
1. Apply the barrow ramp (`BARROW_HEX`) across every primitive; delete the sci-fi slate and the
   raw whites.
2. Wire the display and body faces into **all 23** scene text objects, not 3.
3. Theme `PreloadScene` end to end — it is the first impression and currently reads as a stock
   Phaser demo.
4. Add a **torch-glow + vignette overlay layer**, per the guideline's lighting rule (a soft
   non-pixel layer over crisp art is explicitly permitted).

Rejected "also generate textures procedurally" (runtime dithered stone/earth via
`CanvasTexture`): it gets closer to pixel art without asset files, but it is real graphics code
that hand-authored tiles would supersede anyway — throwaway work with a long tail. Rejected
"palette and fonts only": without the lighting overlay the canvas stays flat and lit from
nowhere, which is most of what makes it read as a tech demo rather than a crypt.

**Assets — out**, same call as FS-0004. Sprites, tiles and 9-slice frames are parked. This means
the guideline's Part I rules that *presuppose assets* — nearest-neighbour rendering, dithered
shading, selective dark outlining, 9-slice pixel borders, `image-rendering: pixelated` — are
**not discharged by this FS**. They stay pending against the future asset FS. What this pass
delivers is the palette, type and lighting of a torch-lit crypt drawn in primitives.

**Typography — blackletter display + serif body**, matching FS-0004 rather than Part I's
"medieval pixel/bitmap font" (Alagard). Rationale: a pixel/bitmap body font is a *pairing with
pixel art*, and there is no pixel art yet. Pairing a bitmap font with vector primitives would
look accidental. When the asset FS lands, revisit — the pixel font may become correct then.
**Recorded as a deliberate deviation from Part I, not an oversight.** The ≥24px blackletter
constraint from FS-0004 applies here too, and bites harder: HUD text is small by nature, so
blackletter is likely confined to the main menu title and end-of-run overlay headings only.

**Copy — in.** `operator`/`Operator` in `BootScene`, `v0.1` in `MainMenuScene`. Same voice target
as FS-0004.

### Constraints referenced

- Guideline "Out of Scope (do not change as art)": **tile grid size, world projection, and
  camera are layout/logic, not art.** Untouched here. Likewise the animation rig's frame counts
  and directions.
- Server-authoritative rendering — this is presentation only. No change to what the client sends
  or how it interprets `ClientGameState`.
- `theme.ts` `BARROW_HEX` and the CSS vars must keep agreeing (same palette, two forms). The
  base-surface lift decided in FS-0004 propagates here.
- [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md): token-only styling, no raw hex. In Phaser terms: pull `0x` ints from
  `BARROW_HEX`, never inline literals. The 36 inline hex literals in the scenes are what the
  fence would reject.

### Edge cases / open questions raised, not settled

- **Overlay vs. gameplay readability.** A vignette on a fixed 1080×720 canvas darkens the play
  field edges. Whether entities near the edge stay readable — especially enemies whose intended
  accent is "glowing eyes" against dark — was not tested.
- **Overlay and the server-driven render loop.** `BarrowspireScene` redraws from full-state
  broadcasts each tick. Whether the glow/vignette layer is built once and depth-sorted above, or
  rebuilt per tick, is an implementation call with real perf consequences at 60Hz. Not decided.
- **Dead scenes.** `GameScene.ts` and `GameOverScene.ts` are not in the registered scene list and
  `src/game/` (MockBackend/GameClient) has no importers. Restyling them is wasted work;
  deleting them is out of scope for a styling pass. Left as-is, flagged.
- **The 4.4k-line scene.** Recolouring 36 call sites inside one very large file is the bulk of
  the diff and is mechanical but wide. Whether it wants an intermediate semantic layer
  (`palette.wall`, `palette.door`) over raw `BARROW_HEX` lookups was not decided — it would
  make the ADR-0013 fence meaningfully easier to satisfy.
- **Loadout scene.** `LoadoutScene.ts` was not audited in detail; assumed to carry the same
  issues.
- Does the torch overlay need to track the player (a light source that moves) or is a static
  vignette enough? Static was assumed; not confirmed.

### Scoping honesty

As with FS-0004: every decision converged on the first recommendation with no pushback (not
challenged). Pre-lock gate evaluated, did not fire — presentation-only, reversible, no blast
radius beyond the client's appearance.

### Explicitly out of scope

- All image assets — sprites, tiles, 9-slice frames, textures (parked as a later FS, along with
  the Part I rules that depend on them)
- Procedural `CanvasTexture` generation
- Tile grid, projection, camera, animation rig — layout/logic per the guideline
- Game logic, networking, ECS, anything under `game-server/`
- Deleting the dead `GameScene` / `GameOverScene` / `src/game/` code
- The web platform — that is [FS-0004](0004-web-platform-fantasy-reskin.md)
