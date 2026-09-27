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
- **Palette: the barrow ramp** (warm torch amber/ember against cold charcoal/umber darks,
  arcane lich green, oxblood, brass, vellum). Full values live in the design guideline.

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

### ⏳ Planned / Not Started
- **Fully medieval typography** wired into the canvas (Pirata One display + EB Garamond body).

---

## Pointers
- Authoritative art spec → [`/game-client/docs/design-guideline.md`](../game-client/docs/design-guideline.md)
- Client conventions → [`/game-client/CLAUDE.md`](../game-client/CLAUDE.md)
- Overall refactor status → [`refactor_plan.md`](refactor_plan.md)
