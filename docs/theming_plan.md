# Theming Plan — The Age of Barrowspire

Look-and-feel **plan and status**. The authoritative art spec is the design guideline at
[`/game-client/docs/design-guideline.md`](../game-client/docs/design-guideline.md) — **that file
wins on any concrete visual decision; this doc does not duplicate it.** This is the
plan/status; the design guideline is the spec.

---

## Direction (chosen)

- **Dark gothic medieval barrow extraction-crawl** — torch-lit, oppressive, barrow-deep.
- **Medium: PRE-RENDERED 3D on a 2:1 isometric camera**
  ([ADR-0020](adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md)).
  Everything that stands up is modelled in 3D and baked at build time to 2D sprite sheets;
  Phaser draws only those. Target look: Ultima Online. Pixel art was the previous choice and was
  dropped as "too pixel art and cute".
- **Characters are authored in code, never sourced**
  ([ADR-0021](adr/0021-characters-are-authored-in-code-not-sourced.md)): one shared skinned rig
  in the bake tool, hand-keyed clips, owner approval of a contact sheet before they go in.
- **The projection is presentation only.** World positions, input and every WS message are
  unchanged; the server is untouched.
- **Typography: fully medieval.** Pirata One (blackletter) for display/titles, EB Garamond for
  HUD/body. No bitmap font. The cleaner classical serif (Cinzel-style) was **dropped as too
  modern**.
- **Two palettes, one per medium**
  ([ADR-0025](adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md)). They are not
  required to agree, so going from the menus into a delve is a deliberate change of register.
  Full values live in the design guideline.
  - **Game canvas: the barrow ramp** (warm torch amber/ember against cold charcoal/umber darks,
    arcane lich green, oxblood, brass, vellum), in `BARROW` / `BARROW_HEX`. Guideline Part I.
  - **Web UI: Bone & Soot** (bone `#e9dfc9` as the one torch per view, on neutral soot `#121212`,
    with grey stone surfaces and iron structure), plus the token-derived **Atmosphere** layer.
    Chosen by eye from a live comparison of 18 palettes on the home page, 2026-10-21. Defined in
    `globals.css` `:root` and mirrored by the UI table in `theme.ts`. Guideline Part II.

---

## Status

### ✅ Done
- **Client theme tweaks** — initial look-and-feel changes in the client.

### 🔨 In progress — [FS-2325V](specs/2325V-pre-rendered-isometric-art.md) (pre-rendered isometric art)
- Slice 1: guideline rewrite + isometric projection in hub and run on placeholder graphics.
- Slice 2: bake pipeline and world/prop art.
- Slice 3: world art in scenes, occlusion, light-map lighting.
- Slice 4: container view (satchel).
- Slice 5: characters and creatures, including the default wizard (authored in code, ADR-0021).

### ✅ Done: [FS-8TCN2](specs/8TCN2-bone-and-soot-web-ui-palette.md) (Bone & Soot web UI palette, ADR-0025)
- Slice 1: amend the design guideline, `game-client/CLAUDE.md` and this plan for a separate UI
  palette (done).
- Slice 2: retire raw palette rgba literals and extend the CSS fence (done).
- Slice 3: swap in the Bone & Soot tokens, split the UI table from `BARROW`, measure contrast in
  the browser (done).
- Slice 4: the Atmosphere layer (done).

### ⏳ Planned / Not Started
- **Fully medieval typography** wired into the canvas (Pirata One display + EB Garamond body).

---

## Pointers
- Authoritative art spec → [`/game-client/docs/design-guideline.md`](../game-client/docs/design-guideline.md)
- Client conventions → [`/game-client/CLAUDE.md`](../game-client/CLAUDE.md)
- Overall refactor status → [`refactor_plan.md`](refactor_plan.md)
