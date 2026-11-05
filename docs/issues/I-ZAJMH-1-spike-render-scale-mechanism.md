---
id: I-ZAJMH-1
status: done
implements: FS-ZAJMH
blocked_by: []
labels: [ready-for-agent]
title: "FS-ZAJMH slice 1: spike — how the render scale is applied (game-client)"
---
Implements FS-ZAJMH §Requirements 1

**Lane: agent (AFK). Run with `/spike`, not `/develop`: throwaway, nothing is kept.** No server change.

## What to Build

A minimal experiment that answers one question: **with Phaser 3.80 (no game-wide resolution
option), what mechanism draws the canvas at render scale 2 while the logical view stays
1280×720 units and everything below still holds?**

- camera follow stays centred on the player; world bounds hold (BarrowspireScene, HubScene, FieldScene);
- the light-map (`src/render/lighting/LightMap.ts`) and indoor blackout (`src/render/world/blackoutMask.ts`) line up with the world;
- `pointer.worldX/worldY` resolves the same world point under the cursor as today;
- HUD code can get a pointer position in logical-view units (today it reads `pointer.x/y`);
- `setScrollFactor(0)` HUD placed in logical units lands where it would at render scale 1.

Candidates (FS-ZAJMH R1): camera zoom with origin handling, a separate HUD camera, or another
approach. Try the cheapest first; stop at the first that satisfies every bullet.

## Acceptance Criteria

- [x] The chosen mechanism and why it beats the others written below under `## Answer`, with the exact Phaser calls and any gotcha found (follow/origin math, render-texture sizing, pointer mapping).
- [x] Every bullet above checked against the experiment, at render scale 2 and logical 1280×720.
- [x] The experiment is deleted; the working tree has no trace of it.
- [x] If the answer is an architectural constraint (e.g. "all HUD must live on a second camera"), it is reported for an ADR, not decided here.

## Blocked By

None

## Spec Reference

FS-ZAJMH §A R1 (charter default 15). Its answer feeds I-ZAJMH-2 (R2).

## Answer

Spike run 2026-11-05 on the installed Phaser **3.90.0** (lockfile; `package.json` says `^3.80.1`),
WebGL, headless Chrome, a throwaway page with a 2400×1200 bounded world, a followed player,
`setScrollFactor(0)` HUD, an interactive HUD button, a DOM element, a light-map copy and a
blackout-mask copy. Each bullet was measured by reading back canvas pixels and pointer values
against a render-scale-1 reference (game 1280×720, zoom 1). The harness is deleted.

**Chosen: one camera per scene, zoomed by the render scale, with origin 0 (option B).**

- Game size = logical × render scale (`width: Math.round(L * rs)`, `height: Math.round(720 * rs)`).
  The CSS size comes from the scale manager (`zoom: 1 / rs` in the spike, `scale.setZoom(1 / rs)` on a re-fit).
- `cam.setZoom(rs).setOrigin(0)`: a camera-fixed object at logical `(x, y)` draws at backing `(rs·x, rs·y)`.
- Bounds: `cam.setBounds(b.x + s.x, b.y + s.y, b.w, b.h)` with `s = ((cam.width - cam.displayWidth) / 2, (cam.height - cam.displayHeight) / 2)`.
  Phaser's `clampX/clampY` assume origin 0.5, and this shift cancels that exactly.
- Follow: `cam.startFollow(t, true, 0.1, 0.1, cam.displayWidth / 2, cam.displayHeight / 2)`, then
  `cam.setScroll(t.x - cam.displayWidth / 2, t.y - cam.displayHeight / 2)`.
  `startFollow`'s snap hard-codes `width / 2`. Without the `setScroll` the camera lands about one view off and then lerps across.
- Re-fit: `scale.resize(W, H)`, `cam.setSize(W, H).setZoom(rs)`, then apply the bounds shift again and call `cam.setFollowOffset(dw / 2, dh / 2)`.

Measured at rs 2 and logical 1280×720, and after a re-fit to rs 1.5 at 1080 and rs 2 at 1080:

| Check | Result |
|---|---|
| Visible world rect (`getWorldPoint(0,0)` to `getWorldPoint(W,H)`) | Identical to the reference: centred on the player, clamped at both world corners. |
| `setScrollFactor(0)` HUD | Rects at logical bottom-left and top-right land at `rs×` their logical position. |
| DOM element (Phaser DOM container) | Same CSS position as the reference. |
| `pointer.worldX/worldY` on the probe marker | Same world point as the reference. |
| Phaser hit tests on HUD and world objects | Both fire. |
| `cam.scrollX/scrollY` | Equals the true visible top-left in world units, as at zoom 1 today. |

**Rejected:**

- **A: zoom with the default origin 0.5.** The world, follow, bounds and `worldX` are all correct with no extra code.
  But every scroll-factor-0 object is scaled about the canvas centre and lands at `W/2 + rs(x − W/2)`.
  At rs 2 the HUD is entirely off-canvas, the DOM input sits at CSS −540, and a click at the button's logical place misses.
  Fixing that means adding `(W − L)/2` to every one of ~80 scroll-factor-0 sites, so it fails the HUD bullet as asked.
- **C: a second, HUD camera** (`cameras.add(0,0,W,H).setZoom(rs).setOrigin(0)`). It needs a per-frame partition
  (the spike set `cameraFilter` to "scroll factor 0 and depth ≥ 1000 → HUD camera").
  Camera-fixed layers that sit *between* world depths (light-map 135, blackout darks, mist, vignette and dust 905, floor veil 950) cannot move to the HUD camera.
  They stay on the main camera and still need centre-anchoring.
  When the pointer is over an interactive HUD object, `pointer.worldX/worldY` comes from the HUD camera: measured (640, 690), not a world point.
  It also makes "all HUD lives on a second camera" an architectural rule. B satisfies every bullet with one camera.

**Gotchas for I-ZAJMH-2:**

1. **`cam.worldView` and `cam.midPoint` are wrong under origin 0.** Phaser computes them as if the origin were 0.5; measured worldView (1000, 600) when the view was really (360, 240).
   - Use `(cam.scrollX, cam.scrollY, cam.displayWidth, cam.displayHeight)` instead.
   - `LightMap.update` reads `cam.worldView` for culling and stamp offsets, so it must switch.
   - `centerOn`, `pan`, `zoomTo` and a bare `startFollow` share the same origin-0.5 math. No game code uses them today; only the dev `GalleryScene` calls `centerOn`.
   - **For an ADR, not decided here:** whether "the main camera runs at origin 0; scenes reach `startFollow` and `setBounds` only through the logical-view module and never read `worldView`/`midPoint`" should be recorded.
2. **Light-map, as today's code is, is misaligned** under any zoom: the lit centroid sat at (106, 106) against the player at (1280, 720).
   This variant aligned exactly (lit area 4× the reference, at backing resolution):
   - texture `cam.width × cam.height` (the backing size);
   - image at (0, 0) with origin 0 and `setScale(1 / rs)`;
   - stamp at `((s.x − cam.scrollX)·rs, (s.y − cam.scrollY)·rs)` with `scale × rs`.
   Its `RESIZE` refit must also reset the image scale.
3. **Blackout, as today's code is, aligns** (no world px leak, span exactly 2× the reference). The dark rects only need to be sized to the logical view instead of `cam.width/height`; oversized also works.
   - Its world-resolution mask texture is upscaled, so diagonal edges go 2 px soft (4 half-tone px on one row).
   - Fix, aligned and sharp: `add.renderTexture(0, 0, w·rs, h·rs).setScale(1 / rs)` with `rt.camera.setZoom(rs).setOrigin(0)`, keeping `setScroll(b.x, b.y)`.
4. **HUD hit tests:** `pointer.x/y` are backing px, so the logical point is `pointer.x / rs, pointer.y / rs`. Phaser's own `setInteractive` on scroll-factor-0 objects needs no change.
5. **Fractional rs: Phaser 3.90 drops `roundPixels` at a non-integer zoom.** In `Camera.preRender`, `renderRoundPixels = roundPixels && Number.isInteger(zoom)`; measured false at rs 1.5.
   - Scroll is still floored to whole world units, so at rs 1.5 an odd scroll puts every sprite on a half backing px.
   - R4 ("`roundPixels` stays on", no shimmer at 1.25/1.5) is not met by Phaser alone. The develop child must check it on a real screen and handle it (for example by snapping scroll to a `1/rs` grid) or escalate.
6. `startFollow(…, true, …)` sets `cam.roundPixels = true` itself. The blackout's `rt.camera.roundPixels` mirror keeps working.
7. Menus (no follow, no bounds) need only `setZoom(rs).setOrigin(0)`; everything placed in logical units then lands right.
