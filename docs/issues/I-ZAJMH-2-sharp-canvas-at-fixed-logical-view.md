---
id: I-ZAJMH-2
status: in-progress
implements: FS-ZAJMH
blocked_by: [I-ZAJMH-1]
labels: [ready-for-agent]
title: "FS-ZAJMH slice 2: the canvas drawn at the screen's density, logical view still 1080×720 (game-client)"
---
Implements FS-ZAJMH §Requirements 2, 3, 4, 5, 6, 10 (DPR change), 15, 16 (render scale), 24, 25

**Lane: agent (AFK).** No server change. Use the mechanism recorded in I-ZAJMH-1 `## Answer`.

## What to Build

The canvas looks the same size and layout as today but is drawn at render scale
`min(devicePixelRatio, 2)`. The logical view stays a fixed 1080×720 in this slice (fitting and a
variable width come in I-ZAJMH-3).

- One viewport module (e.g. `src/render/viewport/`) owns logical width/height and render scale,
  exposes them, and emits a change. The cap (2) is one named constant (R3). Fractional scales are
  valid; `roundPixels` stays on (R4).
- `PhaserGame.tsx` builds the game through it, applying the I-ZAJMH-1 mechanism.
- Every scene and HUD reader of `cameras.main.width/height/centerX/centerY` reads the logical size
  from the module instead (MainMenu, CharacterCreation, Barrowspire, Hub, Field, Preload, Game,
  GameOver scenes; `utils/Background`; `ui/ChatWindow`, `ui/PartyReadyCheck`, `ui/PartyInvitePrompt`).
- `crispText` rasterises at the render scale, not bare DPR (R5).
- LightMap and blackout render textures follow the backing store and stay aligned (R6).
- Every HUD hit test that reads `pointer.x/y` maps to logical units (R15): ChatWindow, GearOverlay,
  gearOverlayLayout, LetterPanel, PartyPanel, ContainerView, MainMenuScene, BarrowspireScene.
  World aim keeps `pointer.worldX/worldY`.
- The DOM chat input stays over the chat window at render scale 2 (R16).
- A `devicePixelRatio` change (window moved to another monitor) re-applies the render scale (R10, DPR part).
- Docs: `game-client/SPECIFICATION.md` "Reference — Phaser integration" bridge line no longer says
  "1080×720, pixelArt" (R24); FS-ZAJMH § Terms added to `game-client/CONTEXT.md` § Rendering terms (R25).

## Acceptance Criteria

- [ ] DPR 2 at 1080×720 CSS px → backing store 2160×1440; DPR 1 → 1080×720 and the picture matches today's.
- [x] Render scale never exceeds the named cap (2); a 1.25 / 1.5 DPR gives a fractional scale.
- [x] No scene or HUD code reads `cameras.main.width/height/centerX/centerY` for layout.
- [ ] HUD widgets sit exactly where they do today.
- [x] Every listed HUD hit test lands on the control under the cursor at render scale 1, 1.5 and 2.
- [x] `pointer.worldX/worldY` gives the same world point as before; camera follow centred and bounds hold in hub, run, field.
- [x] Light-map and blackout aligned at render scale 2.
- [x] Canvas text rasterises at the render scale.
- [ ] DOM chat input stays over the chat window; IME still works.
- [x] DPR change re-applies the render scale without a reload.
- [x] SPECIFICATION.md reference line and CONTEXT.md terms updated.
- [x] Tests pass (`npm test`, typecheck, lint).

## Blocked By

I-ZAJMH-1

## Spec Reference

FS-ZAJMH §A R2, §B R3–R6, §C R10 (DPR), §D R15–R16, §F R24–R25; user stories 1, 2, 3, 5, 14, 15, 18, 19, 26, 28, 29.

## TDD Approach

- RED: viewport module — render scale for DPR 1 / 1.5 / 2 / 3 at 1080×720 (3 → capped at 2); logical size stays 1080×720.
- GREEN: the module; then pointer-to-logical mapping test for one HUD hit test (GearOverlay layout), then the rest.

## Watch for

- `src/scenes/BarrowspireScene.ts` is a hotspot (~4.4k lines): HUD construction, pointer reads, camera bounds all live there.
- Tests that stub `cameras.main` at 1080×720 / 800×600 (blackoutMask, buildingView, blackout, FieldScene, BarrowspireScene tests) will need the module stubbed instead.
