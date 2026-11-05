---
id: I-ADR0057-2
status: done
implements: ADR-0057
blocked_by: []
labels: []
title: "ADR-0057 slice 2: masks and render textures on Phaser 4 settled, with tests and an upstream repro (game-client)"
---
Implements ADR-0057 §Decision (Masks, Render textures)

**Lane: agent (AFK).** game-client only. Turns the trial's mask and render-texture changes from
"trial" into the migrated code, and prepares (does not file) the upstream report.

## What to Build

- `src/render/viewport/mask.ts` gets its own `mask.test.ts`: the origin correction (a
  context-focused target's filter camera gets the main camera's origin), the scroll-factor
  correction (a camera-fixed target with a size is no longer context-focused; one without a size
  is not touched that way), invert passed through, `scaleFactor` left at Phaser's default 1, the
  canvas fallback (uninverted Graphics → `setMask(createGeometryMask())`; inverted or a texture
  source → unmasked, `undefined`). Each correction's test names the upstream bug it covers.
- Replace the `PHASER4-TRIAL` markers in `mask.ts` and `src/render/lighting/LightMap.ts` with
  ADR-0057 references. LightMap and the blackout keep recreate-on-resize (ADR-0057 §Render
  textures); the comment says v4 fixed the reason and why it is kept.
- Walk every mask and render-texture site the trial touched and confirm each goes through
  `maskInView` / ends with `render()`: `render/world/blackoutMask.ts`, `silhouette.ts`,
  `scene.ts` (GroundLayer `stamp`/`erase` + `render()`), `render/lighting/LightMap.ts`,
  `ui/LetterPanel.ts`, `ui/bustPortrait.ts`, `scenes/MainMenuScene.ts`, `scenes/GameScene.ts`.
  `grep` shows no `setMask`, `createGeometryMask`, `createBitmapMask`, `addMask`, `beginDraw`,
  `batchDraw*` or `setTintFill` outside `mask.ts`. (`ui/ChatWindow.ts` is I-ADR0057-3's.)
- Stale engine references: `game-client/CLAUDE.md` ("Phaser 3.80"), the Phaser-integration line
  in `game-client/SPECIFICATION.md`, and `package.json` `description` ("Phaser 3") say Phaser 4.
- The dev gallery (`src/dev/gallery/`) compiles under v4; visuals are not checked.
- **Upstream repro, prepared not filed:** under `## Upstream repro` below, one minimal
  single-file Phaser 4.2.1 scene per bug, with expected vs actual:
  1. filter camera ignores the main camera's origin at zoom ≠ 1. Already open upstream as
     phaserjs/phaser#7402; write it as a confirming comment (our case: an external mask on a
     Graphics, origin 0, zoom 1.5), not a new issue.
  2. a context-focused filtered object (`Graphics`/`Container`) with `setScrollFactor(0)`
     moves with the camera's scroll (`Filters.js` `renderWebGLFilters` uses `camera.scrollX/Y`
     and forces `scrollFactor` to 1). No upstream issue found as of 2026-11-05: draft as a new
     issue.
  Optional third note, if confirmed by a probe: `renderWebGLFilters` computes
  `onlyTranslated` with `(scaleX === 1, scaleY === 1)` (comma operator: only `scaleY` counts).
  Nick decides whether anything is posted.

## Acceptance Criteria

- [ ] `src/render/viewport/mask.test.ts` exists and covers both corrections, invert, and the
      canvas fallback; every case fails if its correction is removed.
- [ ] No `PHASER4-TRIAL` marker left in `mask.ts` or `LightMap.ts`.
- [ ] The grep above is clean outside `mask.ts` (ChatWindow excepted until I-ADR0057-3).
- [ ] `CLAUDE.md`, `SPECIFICATION.md` and `package.json` name Phaser 4.
- [ ] The dev gallery type-checks.
- [ ] `## Upstream repro` holds two runnable minimal repros with expected/actual and the Phaser
      source lines involved; nothing is posted upstream.
- [ ] `npx tsc --noEmit`, `npm test` pass.

## Blocked By

None

## Spec Reference

ADR-0057 §Decision "Masks" (all through `maskInView`, two corrections with tests, `scaleFactor`
1, canvas fallback) and "Render textures" (`render()`, recreate on resize kept);
§Consequences (repro prepared for Nick, not filed).

## Expected files

New `game-client/src/render/viewport/mask.test.ts`; `src/render/viewport/mask.ts`,
`src/render/lighting/LightMap.ts` (comments); read-only walk of the sites listed above (fix only
what the walk finds); `game-client/CLAUDE.md`, `game-client/SPECIFICATION.md`,
`game-client/package.json` (description).

## TDD Approach

- RED: `maskInView` on a fake Graphics-like target (context-focused, scroll factor 1) through a
  camera with origin (0, 0) sets the filter camera's origin to (0, 0).
- GREEN: already implemented by the trial; the test pins it.

## Upstream repro

Prepared for Nick on 2026-11-05; **nothing is posted**. Every "actual" below was measured in
headless Chrome (playwright-core, SwiftShader WebGL) against the installed
`node_modules/phaser/dist/phaser.js` 4.2.1, reading the canvas's pixel bounding box per colour.
`src/gameobjects/components/Filters.js` on `master` is byte-identical to 4.2.1's (CRLF aside) as
of 2026-11-05 (last commit to it: 530f7818, 2026-06-12), so all three still hold on `master`.
Line numbers are 4.2.1's `src/gameobjects/components/Filters.js`.

### 1. Confirming comment for phaserjs/phaser#7402 (filter camera ignores the camera's origin)

State on 2026-11-05: **open**, no labels, no maintainer reply; two comments (one confirming the
suggested patch with a table, one from `samme` (CONTRIBUTOR) linking a CodePen). Our case adds an
external **mask** on a **Graphics**, so the draft is a comment, not an issue:

> Confirming on 4.2.1 (WebGL, Chrome, macOS) with an external mask, which is how we hit it: a
> game with camera origin (0, 0) and zoom = device render scale (1, 1.25, 1.5, 2). Every
> context-focused filtered object (Shape, Graphics, Container) is misplaced at zoom ≠ 1.
>
> ```js
> class S extends Phaser.Scene {
>     create() {
>         const cam = this.cameras.main.setOrigin(0, 0).setZoom(1.5);
>         // reference, no filter
>         this.add.graphics().fillStyle(0x3399ff).fillRect(20, 20, 80, 60);
>         // masked to its left half by an external mask
>         const g = this.add.graphics().fillStyle(0xff3333).fillRect(120, 20, 80, 60);
>         const shape = this.make.graphics({}, false).fillStyle(0xffffff).fillRect(120, 20, 40, 60);
>         g.enableFilters().filters.external.addMask(shape, false, cam);
>         // g.filterCamera.setOrigin(cam.originX, cam.originY); // the fix suggested above
>     }
> }
> new Phaser.Game({ type: Phaser.WEBGL, width: 800, height: 400, scene: S });
> ```
>
> Expected: the red rect's left half on screen at 1.5 × (120, 20)–(160, 80).
> Actual (bounding box of red pixels on the canvas):
>
> | zoom | as written | with the `setOrigin` line |
> | --- | --- | --- |
> | 1 | 120,20 – 160,80 | 120,20 – 160,80 |
> | 1.5 | nothing drawn | 180,30 – 240,120 |
> | 2 | nothing drawn | 240,40 – 320,160 |
>
> The mask itself lands right (it renders through `viewCamera`); only the masked object's
> filter camera is off: `focusFiltersOnCamera` (Filters.js 536–555) copies size, scroll,
> rotation and zoom but not `originX/Y`. We apply the suggested one-liner from outside
> (`filterCamera.setOrigin(cam.originX, cam.originY)` once, after `enableFilters`, since
> `focusFiltersOnCamera` never resets the origin) and it holds at zoom 1, 1.5 and 2 for a
> Graphics and a Container on a scrolled camera, masked and inverted.

### 2. New-issue draft: a context-focused filtered object ignores `scrollFactor` 0

No upstream issue found (GitHub issue search on phaserjs/phaser for scrollFactor with filter /
mask / enableFilters / filtersFocusContext / renderWebGLFilters, and a web search, 2026-11-05;
closed #7224 is the internal Mask filter offset on scroll in rc.5, fixed, a different path).

> **Title:** [4.2.1] Filtered Graphics / Container / Shape with `setScrollFactor(0)` moves with
> the camera
>
> * Phaser Version: 4.2.1 (and `master`), WebGL
> * Operating system: macOS · Browser: Chrome
>
> **Description.** A camera-fixed object (`setScrollFactor(0)`) whose filters focus on the
> camera's context (every Shape, and a Graphics or Container, which have no bounds) is drawn
> with the camera's full scroll as soon as it has any filter, internal or external, so it slides
> with the world. Without a filter, or with `scrollFactor` 1, it is placed right. Independent of
> camera origin and zoom (shown here on Phaser's default camera, origin 0.5, zoom 1).
>
> ```js
> class S extends Phaser.Scene {
>     create() {
>         // Phaser's default camera (origin 0.5, zoom 1), scrolled down 100. Click to scroll more.
>         const cam = this.cameras.main.setScroll(0, 100);
>         this.input.on('pointerdown', () => cam.scrollY += 20);
>         // Everything below is fixed to the camera and should stay at y 120 on screen.
>         // Reference: no filter.
>         this.add.graphics().setScrollFactor(0).fillStyle(0x3399ff).fillRect(20, 120, 80, 60);
>         // A Graphics with a filter (any filter; an identity colour matrix here).
>         const g = this.add.graphics().setScrollFactor(0).fillStyle(0xff3333).fillRect(120, 120, 80, 60);
>         g.enableFilters().filters.internal.addColorMatrix();
>         // A Container with a filter.
>         const c = this.add.container(0, 0).setScrollFactor(0);
>         c.add(this.add.rectangle(220, 120, 80, 60, 0x33ff33).setOrigin(0, 0));
>         c.enableFilters().filters.internal.addColorMatrix();
>         // A Shape with a filter (every Shape sets filtersFocusContext = true).
>         const r = this.add.rectangle(320, 120, 80, 60, 0xffff33).setOrigin(0, 0).setScrollFactor(0);
>         r.enableFilters().filters.internal.addColorMatrix();
>         // r.filtersFocusContext = false; // workaround for a sized Shape; none for Graphics/Container
>     }
> }
> new Phaser.Game({ type: Phaser.WEBGL, width: 800, height: 400, scene: S });
> ```
>
> Expected: all four rects at y 120–180 on screen, whatever the scroll.
> Actual (bounding boxes on the canvas):
>
> | | reference | Graphics | Container | Shape |
> | --- | --- | --- | --- | --- |
> | scroll (0, 0) | 20,120 – 100,180 | 120,120 – 200,180 | 220,120 – 300,180 | 320,120 – 400,180 |
> | scroll (0, 100) | 20,120 – 100,180 | **120,20 – 200,80** | **220,20 – 300,80** | **320,20 – 400,80** |
> | scroll (0, 100), Shape `filtersFocusContext = false` | | | | 320,120 – 400,180 |
>
> **Cause.** In `renderWebGLFilters`, a context-focused object gets
> `focusFiltersOnCamera(camera)` (line 341), which sets the filter camera's scroll to
> `camera.scrollX/Y` whatever the object's scroll factor (540–549). The scroll factor is applied
> only in `_filtersViewMatrix.copyWithScrollFactorFrom(..., gameObject.scrollFactorX/Y)`
> (375–379), and that matrix is used only on the non-context branch (the context branch loads
> identity, 386–389). Then `scrollFactorX/Y` are forced to 1 while the object draws through the
> filter camera (425–428). So nothing ever applies the scroll factor.
>
> **Possible fix** (verified per instance by overriding `focusFiltersOnCamera`, same scene; it
> placed Graphics, Container and Shape where their unfiltered twins are at origin 0.5 zoom 1,
> origin 0.5 zoom 1.5, and origin 0 zoom 1.5 together with the #7402 line):
>
> ```diff
>              this.setFilterSize(width, height);
> -            this.filterCamera.setScroll(posX, posY);
> +            this.filterCamera.setScroll(posX * this.scrollFactorX, posY * this.scrollFactorY);
>              this.filterCamera.setRotation(rotation);
> ```
>
> Workaround today: only for an object with a size, `filtersFocusContext = false`, so it is
> focused on itself (`focusFilters`) and the scroll factor in the view matrix holds. A fixed
> Graphics or Container has no workaround short of wrapping it.

### 3. Optional note: comma operator in `renderWebGLFilters` (confirmed by probe)

Filters.js 356–360:

```js
filterCamera.roundPixels = gameObject.willRoundVertices(
    filterCamera,
    (gameObject.rotation % (Math.PI * 2) === 0) &&
    (gameObject.scaleX === 1, gameObject.scaleY === 1)
);
```

`(a, b)` is the comma operator, so `onlyTranslated` ignores `scaleX`. Probe (an Image with an
identity colour matrix, `vertexRoundMode = 'safe'`, logging the first `willRoundVertices` call per
frame made with its filter camera, which is this one):

```js
class S extends Phaser.Scene {
    create() {
        const img = this.add.image(100, 100, '__WHITE').setScale(2, 1); // not only translated
        img.vertexRoundMode = 'safe';
        img.enableFilters().filters.internal.addColorMatrix();
        const will = img.willRoundVertices.bind(img);
        let logged = false;
        img.willRoundVertices = (camera, onlyTranslated) => {
            // the first filter-camera call per frame is renderWebGLFilters' own
            if (camera === img.filterCamera && !logged) { logged = true; console.log('onlyTranslated', onlyTranslated); }
            return will(camera, onlyTranslated);
        };
    }
}
new Phaser.Game({ type: Phaser.WEBGL, width: 200, height: 200, scene: S });
```

Expected `false` for scale (2, 1); actual `true`. Scale (1, 2) logs `false`, (1, 1) `true`. Effect:
under `safe` / `safeAuto` an object scaled on x only gets its filter pass rounded as if
unscaled. **It does not affect this game:** `fullAuto` (ADR-0057) ignores `onlyTranslated`. The
fix is `&&` for the comma. Small enough to fold into the bug-2 issue as a side note, or a
one-line PR.

## Answer

**Light map without `forceNormalBlend` (review fix round 1, P3).** The trial dropped
`forceNormalBlend` from `src/render/lighting/LightMap.ts`, which 3.90 needed: after an ADD stamp,
Phaser 3.90 could leave the ADD blend bound while its own state said NORMAL, and the camera's
background fill then drew additively (the map edge as the game's clear colour plus pitch).

Probe (headless Chrome, WebGL, `antialias: true`, 1080×720 logical, session scratchpad
`probe57/fix3/`): the **real** `LightMap` (ambient `AMBIENT.hub`, five pools, two straddling the
map edge and one beyond it, plus the carried torch) over a 700×500 charcoal map with the camera
scrolled (260, 180) so the map's right and bottom edges are in view, the camera's background
`pitch` beyond them, the game's clear colour `menuSoot` under that; 30 frames, then three reads
150 ms apart. Three builds: **3.90** = HEAD's `LightMap` + Phaser 3.90.0; **3.90 without the
force** = the same with `forceNormalBlend` returning at once (to show the probe sees the bug);
**v4** = this branch + Phaser 4.2.1 (all three reads alike in every build):

| rs | px beyond the map (right, bottom, corner, by a pool): 3.90 / 3.90 without force / v4 | map edge col | on the map | beyond-map region, v4 vs 3.90 | beyond-map region, 3.90 without force vs 3.90 |
|---|---|---|---|---|---|
| 1 | 11,6,3 / **23,16,9** / 11,6,3 | 19,11,6 in all | 28,22,15 in all | 0 px differ by > 2 | 635,276 px, max 14 |
| 2 | 11,6,3 / **23,16,9** / 11,6,3 | 19,11,6 in all | 28,22,15 in all | 0 px differ by > 2 | 2,544,156 px, max 14 |

No leak: under 4.2.1 the map edge and everything beyond it match 3.90 exactly at render scale 1
and 2, and the probe does show the old additive edge when 3.90 runs without the force. This fits the
reading in `LightMap.ts`: Phaser 4 plays the texture's buffered commands back in `render()`,
setting the blend per stamp, and nothing is left bound for the camera's fill. Whole frame v4 vs 3.90: rs 1, 1,419 px differ by > 2 (max 9,
inside the pools); rs 2, 19 px (max 3). Nothing to fix.

**Shape masks, review fix round 2 (SP1, SP2).** Probe: headless Chrome on the GPU (ANGLE Metal,
Apple M5 Pro, `gl.SAMPLES` = 4), WebGL, `antialias: true`. Harness in the session scratchpad,
`round3/probe/`: `entry.ts` + `run.cjs` for rects and the bust, `under.ts` + `under.cjs` for the
blackout's under-floor dark. **3.90** = the geometry mask as HEAD lays it, on Phaser 3.90.0.
**v4** = this branch's `maskInView`, `fillMaskArea` and `roundEveryObject` on 4.2.1. White content
on black, compared per backing px.

*Letter body and heroes sidebar.* Both clips are now drawn by `fillMaskArea` and redrawn on a
render-scale change alone, as the chat's is. The probe rects match the real ones modulo 4 logical
units: the body at x 428 and at x 428.5 (an odd view width), 346 and 252 tall; the sidebar 355
tall.

| rs | plain `fillRect` (before): max / px > 32 | `fillMaskArea` (now): max / px > 8 |
|---|---|---|
| 1 | 128 / 204 (body at x .5 only) | 1 / 0 |
| 1.25 | 128 / 125–382 | body at x .5: 32 / 256; sidebar: 33 / 2 (a corner); others 1 / 0 |
| 1.5 | 64–127 / 150–306 | 1 / 0 |
| 2 | 0 / 0 | 0 / 0 |

What remains at 1.25 comes from how 3.90 sampled. It counted coverage in quarters: 4 samples per
px, at 1/8, 3/8, 5/8 and 7/8 across. `fillMaskArea` uses the exact share. So where an edge falls on
an eighth of a px, the share is 7/8 or 1/8 where 3.90 had 1 or 0: a half-unit x at 1.25, which is
the letter body's left and right columns at an odd view width. At a corner the product of the two
shares differs from the sample count. Rounding to 4 samples would fit this GPU and not one that
samples 8 times, so it was not done. Left for Nick (I-ADR0057-5).

*Bust portrait* (`maskedBust`: a disc of r 26 at (80.5, 70.25); "ring" = the medallion's brass ring
drawn over it, as `npcDialogue` draws it):

| rs | no ring: partial px 3.90 / v4, px > 32, max | under the ring: px > 32 / > 64, max |
|---|---|---|
| 1 | 123 / 0, 123, 128 | 70 / 32, 128 |
| 1.25 | 144 / 0, 144, 128 | 68 / 26, 128 |
| 1.5 | 179 / 0, 179, 128 | 92 / 30, 128 |
| 2 | 228 / 0, 228, 128 | 127 / 65, 128 |

The ring by itself is the same in both (max 0). I also tried a disc drawn on a canvas, laid on the
backing px grid and used as an Image source for `maskInView`. Phaser 4's Mask filter has no
antialiasing option (`filters/Mask.js`: `invert`, `viewCamera`, `viewTransform`, `scaleFactor`).
Canvas antialiasing gave no ring: px > 32 36–62, max 64–71. Under the ring: px > 32 105–192,
max 86–91. A 4-sample coverage disc using this GPU's sample positions gave no ring: px > 8 2–14,
max 64. Under the ring: px > 32 116–220, max 61–64, against 68–127 and max 128 now. The bust is
only ever shown under the ring, and neither disc comes closer there. 3.90 combined the ring's
samples and the disc's inside each px, while a mask filter works on resolved px. So neither was
shipped.

*Blackout under-floor dark* (`blackoutMask.ts` `under`, inverted, cut by the floor: probed as a 2:1
diamond with its corners off the grid, the camera scrolled to (12, 8), whole units so 3.90's
scroll floor does not move it). Through the filter its edge is hard: 389, 487, 584 and 779 edge px
are up to 128/255 off at rs 1, 1.25, 1.5 and 2. With a half-transparent wall line over the floor's
edge, 259, 487, 389 and 519 px are more than 32/255 off. In the game the floor's edge always lies
under a wall, so this shows only where a wall px is partly transparent there, such as a contact
shadow. No faithful fix exists through the filter, for the same reason as the bust. Left for Nick.

*Stencil spike, probe only.* Phaser 4.2.0 added `Stencil` and `StencilReference`
(`gameobjects/stencil/Stencil.js`; [v4.2.0 release notes](https://phaser.io/news/2026/06/phaser-v4-2-0-released)).
Their shapes go into the canvas's own multisampled stencil buffer, as 3.90's geometry mask did.
Laid as an inverted `Stencil`, then the masked object, then a `StencilReference` in
`subtractLayer` (the under: uninverted), they matched 3.90 exactly (max 0) at all four render
scales, for the four rects, the bust with and without the ring, and the under with and without the
wall. Not adopted, because ADR-0057 decides that every mask goes through `maskInView`. A stencil
also masks everything drawn between it and its reference, not one object. Inside a framebuffer (a
filtered or render-texture parent) it loses the multisampling ("framebuffers have poor
anti-aliasing quality", `Stencil.js`). Whether to amend ADR-0057 for it is Nick's call
(I-ADR0057-5). It would likely also remove the chat clip's top-row delta (I-ADR0057-3), but that
was not probed.
