# ADR-0057 — The client runs Phaser 4: pixel rounding by `vertexRoundMode`, masks by the mask filter

Status: accepted
Date: 2026-11-05
Scope: `game-client` only: `package.json` (`phaser`), `src/render/viewport/` (`camera.ts`,
`mask.ts`) and every scene, game object, mask and render texture that goes through them.
Amends: [ADR-0056](0056-every-scene-camera-runs-at-origin-0-with-zoom-equal-to-render-scale.md):
its Phaser 3.90 premises and its rounding mechanism. Its rule stands (see Decision).
Builds on: [FS-ZAJMH](../specs/ZAJMH-hd-canvas-and-fullscreen.md) R4 (fractional render scale,
`roundPixels` on, no shimmer on a still frame)

## Context

Decided by Nick on 2026-11-05 in the charter approving the upgrade from Phaser 3.90 to 4.2.1.
A trial upgrade (branch `feat/client-phaser-4`) type-checks and passes the suite. It left two
open questions that every scene, current and future, depends on: how pixels are rounded, and how
masks work. Recorded without adversarial review: the charter's defaults were approved as
written.

Forces, each checked against Phaser 4.2.1's installed source
(`node_modules/phaser/src/`) and its migration guide
(`node_modules/phaser/changelog/v4/4.0/MIGRATION-GUIDE.md`):

- **Rounding is per object in v4.** Migration guide §16: the `roundPixels` game config now
  defaults to `false`, "only operates when objects are axis-aligned and unscaled", and per-object
  control is the new `GameObject#vertexRoundMode` (`off`, `safe`, `safeAuto` (default), `full`,
  `fullAuto`). The WebGL transformers (`renderer/webgl/renderNodes/transformer/TransformerImage.js`
  and its siblings) round a quad only when `gameObject.willRoundVertices(camera, onlyTranslate)`
  says so, and `onlyTranslate` is read from the matrix that already includes the camera's zoom.
  So under `safeAuto` no quad is rounded at any zoom but 1, which is every render scale but 1 in
  this game (ADR-0056). `fullAuto` returns `camera.roundPixels` alone (`GameObject.js`
  `willRoundVertices`). The modes are as documented in the
  [GameObject API docs](https://phaser.io/oss/docs/api-documentation/class/gameobjects-gameobject.md).
  Phaser's [Round Pixels example (v4.1.0)](https://phaser.io/oss/examples/v4.1.0/camera/view/round-pixels)
  pairs `setRoundPixels(true)` with `setZoom(1.3)` and the object's default mode; it does not
  settle per-object rounding at fractional zoom, so the source and the probe below are the
  evidence.
- **`renderRoundPixels` is the canvas renderer's alone.** `Camera.preRender` still sets it
  (`roundPixels` and integer zoom), but only `renderer/canvas/CanvasRenderer.js` reads it.
  ADR-0056's `keepOnPixelGrid` forces it on, which under v4 WebGL rounds nothing. `preRender` no
  longer floors scroll under `roundPixels`, so the 1/rs scroll snap is still this game's to do.
- **Measured.** A headless-Chrome probe on the trial: a quad edge at x = 100.3 blends at zoom 1,
  1.5 and 2 under v4 defaults (3.90 rounded it at all three); with the camera's `roundPixels`
  on and `vertexRoundMode = "fullAuto"` on the object it lands on the pixel at all three.
- **Masks are filters.** Migration guide §3: "`BitmapMask` removed. Use the new `Mask` filter
  instead. `GeometryMask` remains available in Canvas only." An external mask "will match the
  context of the camera"
  ([Mask filter API docs](https://phaser.io/oss/docs/api-documentation/class/filters-mask.md));
  `FilterList#addMask(mask, invert, viewCamera, viewTransform, scaleFactor)` renders a game-object
  source into a DynamicTexture through `viewCamera`.
- **Two Phaser 4.2.1 bugs meet this game's camera.** Both sit in
  `gameobjects/components/Filters.js` and are unchanged on `master` as of 2026-11-05:
  1. `focusFiltersOnCamera` copies the camera's size, scroll, rotation and zoom to the filter
     camera but not its origin, so a context-focused filtered object (every Shape, Graphics and
     Container) lands half a view off at origin 0 and zoom ≠ 1. Reported upstream as
     [phaserjs/phaser#7402](https://github.com/phaserjs/phaser/issues/7402) (open, 4.2.1, no
     maintainer response yet; the suggested one-line fix is the same correction this game
     applies).
  2. `renderWebGLFilters` builds the filter camera from `camera.scrollX/Y` and then forces the
     object's scroll factor to 1 while it draws, so a context-focused object with
     `setScrollFactor(0)` slides with the world. No upstream issue found (GitHub issue search for
     filter/mask + scrollFactor, 2026-11-05).
- **DynamicTexture.** Migration guide §7: a `DynamicTexture` / `RenderTexture` "must now call
  `render()` to execute all buffered drawing commands". The 3.90 `setSize` bug that ADR-0056
  worked around is gone in 4.2.1 (trial probe: drawn right after a 64 → 200×160 resize).
- **Tint.** Migration guide §4: `setTintFill()` is removed; `setTint().setTintMode(FILL)`
  replaces it.

Alternatives considered:

- **Stay on 3.90.** Rejected by the charter: the upgrade is the work.
- **`safeAuto` (Phaser's default) or `vertexRoundMode` set where each object is made.** Rejected:
  the first rounds nothing at our render scales; the second rounds only the objects someone
  remembered, and a new one silently shimmers at 1.25 / 1.5.
- **`full` instead of `fullAuto`.** Rejected: it ignores the camera, so a render texture's
  camera (ADR-0056's `roundAtAnyZoom` keeps its `roundPixels` deliberate) could not turn it off.
- **Call `filters.external.addMask` at each site.** Rejected: every site would need both bug
  corrections, and the canvas fallback, by hand.
- **Patch Phaser (patch-package / fork).** Rejected: a local fork of the renderer outlives the
  bug; the corrections live in one of our modules and can be deleted when upstream fixes land.

## Decision

**The client runs Phaser 4 (`phaser` `^4.2.1`).**

**ADR-0056's rule stands unchanged:** every scene camera runs at origin 0 with zoom = render
scale; fit, follow and bounds go only through `src/render/viewport`; scenes never call
`startFollow`, `setBounds` or `centerOn` directly and never read `worldView` / `midPoint`.

**Pixel rounding:**

- Every scene's main camera has `roundPixels` on.
- Every game object renders with `vertexRoundMode = "fullAuto"`. It is applied **once, centrally,
  in `src/render/viewport`**, so an object made later, by any scene, gets it without asking. No
  call site sets `vertexRoundMode` to get rounding.
- `keepOnPixelGrid` keeps snapping scroll to the 1/rs grid; it no longer relies on
  `renderRoundPixels` for WebGL. A render texture's camera keeps its own `roundPixels` choice
  (`roundAtAnyZoom`), which `fullAuto` honours.
- The target is parity with 3.90 at render scales 1, 1.25, 1.5 and 2, including FS-ZAJMH R4: no
  shimmer on a still frame.

**Masks:**

- Every mask goes through `maskInView` in `src/render/viewport/mask.ts` (the mask filter,
  `filters.external.addMask`, in screen space through the scene's main camera). No call site
  calls `addMask`, `setMask` or `createGeometryMask` itself.
- `maskInView` carries the two corrections for the 4.2.1 bugs above: the filter camera is given
  the main camera's origin, and a camera-fixed object with a size is focused on itself instead of
  the context. Each is covered by a test and is removed when Phaser ships the fix.
- The mask's `scaleFactor` stays 1.
- Under the canvas renderer an uninverted shape still clips (Phaser's canvas-only
  `GeometryMask`); anything else is unmasked, as 3.90's bitmap masks were there.
- Where one area masks many objects (the chat window's lines), they share one mask rather than
  one filter each.

**Render textures:** every `DynamicTexture` / `RenderTexture` draw is followed by `render()`.
Screen-sized ones (light-map, blackout) are still recreated on resize, not resized: v4 fixed the
reason, and keeping it is harmless.

## Consequences

- **Rounding is a property of the platform, not of each object.** A new scene or object is
  rounded as the rest are; code-review can flag any `vertexRoundMode` assignment or any
  `roundPixels = false` on a main camera outside `src/render/viewport`.
- **`fullAuto` rounds rotated and scaled objects too** (Phaser warns of "wobble" on rotated
  sprites). 3.90's forced rounding also rounded every quad; an object that spins visibly may need
  `off`, set in `src/render/viewport` with a reason.
- **A known sub-px size delta against 3.90, which the hook cannot undo.** 3.90 rounded a quad's
  first corner and shifted the other three by the same offset (`TransformMatrix.setQuad`), so a
  quad whose backing-px size is not whole kept that size and blended its right and bottom edge
  px (64/255 or 128/255 covered). Phaser 4 rounds every corner on its own, so those edges are
  hard and sit up to 0.5 backing px from 3.90's: text at render scale 1.25 and 1.5, and 2x art
  of odd source size at 1, 1.25 and 1.5. Left and top edges land on 3.90's px. Nick accepts or
  rejects this in I-ADR0057-5.
- **Masks cost a filter pass each.** Many masked objects are many framebuffers; sharing one mask
  per area (chat) keeps it down. A frame-rate drop at render scale 2 is a charter escalation.
- **We carry two upstream workarounds.** They target 4.2.1 behaviour in `Filters.js`; a Phaser
  bump must re-run their tests and drop each one Phaser has fixed (#7402 for the origin). A
  minimal repro of both is prepared for Nick to file or not; it is not filed by an agent.
- **Phaser's docs and examples need translating twice:** once for origin 0 (ADR-0056), once for
  masks, which here are never `setMask`.
- **ADR-0056's Phaser 3.90 premises are void:** "Phaser 3.90 turns `roundPixels` off at
  non-integer zoom", the `keepOnPixelGrid` "force pixel rounding" clause, and the
  `DynamicTexture.setSize` reason for recreating textures. Its Consequence "upgrading Phaser
  means re-checking the origin-0 corrections" was exercised here; the origin-0 corrections still
  hold under 4.2.1.
- **The dev gallery must compile under v4**; its visuals are not held to parity.
