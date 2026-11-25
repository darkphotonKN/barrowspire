# ADR-0103 — A world's camera stands closer by `WORLD_ZOOM`, and its HUD has a camera of its own

Status: accepted
Date: 2026-11-25
Scope: `game-client` only: `src/render/viewport/` (`camera.ts`, `worldView.ts`, `game.ts`), the
world scenes (BarrowspireScene, HubScene, FieldScene) and the camera-fixed layers they draw
(`src/utils/atmosphere.ts`, `src/render/world/blackoutMask.ts`, the light-map).
Amends: [ADR-0056](0056-every-scene-camera-runs-at-origin-0-with-zoom-equal-to-render-scale.md):
its "zoom = render scale" clause, for a world's camera, and its rejection of a separate HUD
camera. Origin 0, the viewport-only rule and every other scene's camera stand.
Builds on: [FS-ZAJMH](../specs/ZAJMH-hd-canvas-and-fullscreen.md) § Change: Closer world camera
(R7 amended for every world view)

## Context

Decided by Kranti on 2026-11-25. The room-by-room exploration pace had just landed (`PaceScale`
0.5) and the run showed too much of the floor around the player; the town felt too big as well.
He asked for a closer camera in every world, with the HUD and UI unscaled everywhere.

Forces:

- **Phaser zooms everything a camera draws.** A camera-fixed (`setScrollFactor(0)`) object is
  scaled by the camera's zoom like the ground (`GetCalcMatrix` copies `camera.matrix`, zoom
  included), so zooming a world's main camera scales whatever HUD it draws.
- **Each world scene draws part of its HUD on its own main camera**: the minimap with its mode
  icon and name, the floor indicator and escaped count, the run's resolved cards and spectate
  switcher, the town's queue panel and Leave button, the field's fallen panel. The rest of the HUD
  is the UI scene's, which has its own camera (ADR-0086).
- **Counter-scaling the HUD means touching every widget**: each would need its place and size
  divided by the zoom, fighting the anchors (FS-ZAJMH R12, R13) and the hand-made hit tests in
  logical units (R15).
- **Some camera-fixed layers belong to the world's view, not the HUD**, and are drawn between
  the world's own depths: the mist (−0.5), the light-map (135), the blackout (500), the dust (902)
  and the vignette (905), with the hostile markers (950) above the vignette (FS-2325V §C.9). Moving
  them to a camera drawn after the world would break that order.
- **ADR-0056 rejected a separate HUD camera** because Phaser sets `pointer.worldX/Y` from the
  camera whose objects it hit, so they are wrong over an interactive HUD object, and because every
  object must be sorted onto one camera or the other each frame.

## Decision

**A world's main camera is its world camera, zoomed by render scale × `WORLD_ZOOM`. The HUD the
world scene draws is drawn by a second camera on top, at the plain render scale.**

- **One knob**: `WORLD_ZOOM = 1.2` in `src/render/viewport/camera.ts`. `zoomWorld` stores the
  factor and `fitCamera` applies render scale × factor on every fit, so it holds through every
  re-fit. The pixel grid (`keepOnPixelGrid`) floors the scroll on the 1/zoom grid, which is whole
  backing px at the closer zoom too. Bounds and follow go through the zoom-aware display size as
  before.
- **`zoomWorldView(scene)`** is the first call in each world scene's `create`. It zooms the main
  camera, adds the HUD camera, fits it like every scene camera, and shares the display list
  between the two until the scene ends. `fitGame` re-fits every camera of a started scene, not
  only the main one.
- **The split is redone every frame**, on the scene's `prerender`. The HUD camera draws a
  top-level object that is camera-fixed (scroll factor 0 on both axes) at depth
  `HUD_DEPTH_FLOOR` (950) or over. The world camera draws everything else, the world's own
  camera-fixed layers under 950 among them. Only the two cameras' bits of each object's
  `cameraFilter` are written. An object that changes its scroll factor (the minimap going from its
  corner to the overlay) changes camera on the next frame.
- **The world camera's fade is mirrored onto the HUD camera every frame**, so a world's curtain
  still covers its HUD (FS-C4JWH A1.5). Its shake is not mirrored: a tremor moves the world alone,
  as it has always left the UI scene's HUD.
- **The world's camera-fixed layers follow its zoom**: the light-map already read `zoomX`; the
  blackout mask's texture draws at the camera's `zoomX`; the vignette and the dust are laid out
  at 1/zoom (`atmosphere.ts`), so the zoomed camera draws them over the screen as before. The mist
  and the blackout's dark rect simply cover more than the screen.

## Consequences

- **A world shows the logical view ÷ `WORLD_ZOOM`**: at 1.2, 900 × 600 world units at a 1080-wide
  view. The canvas menus, the UI scene and the HUD keep the logical view exactly. Setting the knob
  to 1 puts every world back as it was; the HUD camera stays, at no visible cost.
- **The risk ADR-0056 named is real, and contained today.** Over an interactive in-scene HUD
  control, Phaser's hit test stops at the HUD camera, so `pointer.worldX/Y` are that camera's
  point (logical units), not the world's. The controls this applies to today, the run's spectate
  switcher and resolved-row buttons, only show once the player has resolved, when the run refuses
  attacks anyway. The town's Leave button is the only other one, and the town reads no `worldX`.
  The field's fallen panel is not interactive. Away from a HUD control the hit test goes on to the
  world camera, and `pointer.worldX/Y` are correct.
- **A new interactive in-scene HUD control must not leave world aim reading `pointer.worldX/Y`
  under it.** Any world press that can happen while such a control is under the pointer has to read
  a pointer mapped through the world camera (`pointer.positionToCamera(cameras.main)`, as the
  run's `cursorWorld` already does), or the control has to go to the UI scene. `code-review`
  should check for it.
- **A camera-fixed HUD piece in a world scene has to sit at depth 950 or over.** One placed lower
  is drawn by the world camera and scaled with the world. A camera-fixed world layer has to sit
  under 950 and lay itself out for the world camera's zoom (`worldZoomOf`), as the vignette and
  the dust do.
- **Order matters in `create`**: `zoomWorldView` comes first, because the atmosphere reads the
  zoom when it builds.
- **The per-frame split costs one pass over the display list per world scene per frame**: a few
  bit operations per top-level object. Each camera also walks the list for its own visible
  children.
- **Known softness, not fixed here:**
  - World text (nameplates, damage numbers) is still rasterised at the render scale and drawn at
    1.2× it, so it is slightly soft.
  - Monster bar edges and the minimap overlay still snap to a 1/renderScale grid, not the
    1/(renderScale × `WORLD_ZOOM`) grid the world camera draws on. Vertex rounding keeps their
    quads on whole px, but a bar can be off by a px.
  - Each is small. Text is the most visible, and a follow-up would rasterise world text at
    render scale × `WORLD_ZOOM`.
- **Scene tests stub `zoomWorldView`**: their fake scenes have one camera. The two cameras are
  `worldView.test.ts`'s.
