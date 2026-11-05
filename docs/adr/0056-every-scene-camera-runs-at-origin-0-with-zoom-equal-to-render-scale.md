# ADR-0056 — Every scene camera runs at origin 0 with zoom equal to the render scale

Status: accepted
Date: 2026-11-05
Scope: `game-client` only: `src/render/viewport/` (`camera.ts`, `game.ts`, `viewport.ts`,
`ViewportFit.ts`) and every Phaser scene's main camera. Specified by
[FS-ZAJMH](../specs/ZAJMH-hd-canvas-and-fullscreen.md) §A (mechanism, settled by the spike in
`docs/issues/I-ZAJMH-1-spike-render-scale-mechanism.md` `## Answer`, implemented in
`I-ZAJMH-2-sharp-canvas-at-fixed-logical-view.md`).
Builds on: [ADR-0020](0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md)
(2x baked art, the reason the render scale caps at 2)

## Context

Decided by Nick on 2026-11-05. FS-ZAJMH §A1 required a spike to settle how the render scale is
applied and to escalate the answer for an ADR if it turned out to be an architectural
constraint. It did: every scene, current and future, has to honour it.

The canvas used to be a fixed 1080×720 backing store, so on any screen with
`devicePixelRatio` above 1 the browser stretched it and the world went soft. FS-ZAJMH wants the
backing store drawn at the screen's real density while the **logical view** (what cameras and
HUD code work in, and what the player sees of the world) stays the same.

Forces:

- **Phaser 3.90 has no game-wide resolution option.** The only way to get density is a larger
  backing store plus camera zoom: backing size = logical view × render scale, render scale =
  min(`devicePixelRatio` × fit, 2).
- **Zoom about Phaser's default camera origin (0.5) breaks the HUD.** `setScrollFactor(0)`
  objects are scaled about the canvas centre, so at render scale 2 the HUD is pushed off the
  canvas.
- **A second, HUD-only camera breaks input.** `pointer.worldX/Y` is computed against the camera
  under the pointer, so it is wrong over interactive HUD objects, and every object must be sorted
  onto one camera or the other each frame.
- **Phaser's `zoom` game config is CSS-only.** It scales the displayed canvas and adds no pixels,
  which is the problem being solved.
- **At origin 0, HUD logical px × render scale = canvas px**, so the HUD lands where it always
  did, and the world maths only need a known correction.

The cost of origin 0, found in the spike and in I-ZAJMH-2:

- Phaser's follow, bounds, `worldView` and `midPoint` maths assume origin 0.5 and are wrong at
  origin 0. Bounds need a `((w − dw) / 2, (h − dh) / 2)` shift (dw, dh = display size in world
  units). `startFollow` needs `dw / 2, dh / 2` offsets plus a `setScroll` snap so the first frame
  is centred.
- Phaser 3.90 turns `roundPixels` off at non-integer zoom, so fractional render scales
  (Windows 125 % / 150 %) shimmer unless scroll is snapped to the 1/rs grid and rounding is
  forced (FS-ZAJMH R4).
- `DynamicTexture.setSize` keeps its GL render target at the old size, so screen-sized textures
  (the light-map, the indoor blackout) are wrong after a resize unless they are recreated.

Alternatives considered:

- **Zoom about origin 0.5** (Phaser's default). Rejected: the HUD scales about the canvas centre
  and leaves the canvas.
- **A separate HUD camera at zoom 1.** Rejected: breaks `pointer.worldX/Y` over interactive HUD
  and needs per-frame camera sorting.
- **Phaser's `zoom` config.** Rejected: CSS-only, adds no density.

## Decision

**Every scene's main camera runs at origin 0 with zoom = render scale. The game's backing size
is the logical view × render scale, render scale = min(`devicePixelRatio` × fit, 2).**

- **Scenes reach camera fit, follow and bounds only through `src/render/viewport`**: `fitCamera`,
  `boundCamera`, `followWith`, `viewRect` and `keepOnPixelGrid`. The module owns the origin-0
  corrections in one place.
- **Scenes never call `startFollow`, `setBounds` or `centerOn` on a camera directly, and never
  read `cam.worldView` or `cam.midPoint`.** All of these are wrong at origin 0; `viewRect` gives
  the visible world rectangle instead.
- **`keepOnPixelGrid` wraps the camera's `preRender`** to snap scroll to the 1/rs grid and force
  pixel rounding at any zoom, so `roundPixels` holds at fractional render scales (FS-ZAJMH R4).
- **Screen-sized dynamic textures (light-map, blackout) are recreated on resize**, never
  resized with `setSize`.

## Consequences

- **The HUD needs no change.** HUD code keeps working in logical-view units, and
  `pointer.worldX/Y` stays correct over world and HUD alike with one camera.
- **Density follows the screen up to 2×**, including fractional scales, without changing what
  the player sees of the world.
- **New scenes must go through the viewport module.** A scene that calls `startFollow`,
  `setBounds` or `centerOn`, or reads `worldView` / `midPoint`, is silently off by half a screen
  at render scale above 1. `code-review` can check for those calls directly.
- **Phaser's camera API is partly off-limits.** Anyone reading Phaser docs or examples must
  translate through `viewport`; upgrading Phaser means re-checking the origin-0 corrections and
  the `roundPixels` / `DynamicTexture.setSize` workarounds, which target 3.90 behaviour.
- **Known exception:** the dev gallery's `GalleryScene` calls `centerOn` and is correct only
  because it runs at zoom 1. Moving it to the render scale means moving it onto `viewport`.
- **Resize costs texture rebuilds** for the light-map and blackout; FS-ZAJMH R10 debounces the
  re-fit so a drag-resize doesn't rebuild every frame.
