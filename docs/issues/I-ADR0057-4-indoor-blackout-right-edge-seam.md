---
id: I-ADR0057-4
status: done
implements: ADR-0057
blocked_by: [I-ADR0057-1, I-ADR0057-2]
labels: []
title: "ADR-0057 slice 4: the indoor blackout covers the canvas's last backing-px column (game-client, diagnose first)"
---
Implements ADR-0057 §Decision (Masks), §Consequences (visuals identical to 3.90)

**Lane: agent (AFK), diagnose first (`/diagnose`).** game-client only. Escalate to Nick if the
root cause is in Phaser and has no workaround in our code (charter).

## What to Build

Regression from the Phaser 4.2.1 trial: inside a building, a 1-backing-px column at the
canvas's **right** edge is not covered by the indoor blackout. Seen at render scales 0.94, 1,
1.22 and 1.875 (so not only fractional ones). Cause unknown. 3.90 covered it.

- Build a red-capable repro first (headless-Chrome probe reading the last column's px inside a
  house, at the four scales) before any theory. Then narrow it: the camera-fixed dark rect
  (`BlackoutMask.dark`, focused on itself by `maskInView`'s scroll-factor correction), its
  filter's framebuffer size vs the canvas's backing size, the filter coverage quad (rounded in
  `renderNodes/Camera.js` when the filter camera's `roundPixels` is set), the mask texture's size
  in backing px (`BlackoutMask.fitted`), and `Blackout` (the canvas-renderer dark) being off.
  Whether the left/top/bottom edges are clean is part of the answer.
- Fix at the right seam (our sizing / rounding, or `maskInView`), with a regression test.
- Diagnose after I-ADR0057-1 lands: central rounding changes how quad and filter edges round,
  and may change or cure the symptom.

## Acceptance Criteria

- [ ] `## Answer` names the root cause with the probe evidence (before/after px values).
- [ ] At render scales 0.94, 1, 1.22, 1.875 and 2, inside a building, the canvas's last
      backing-px column (and first column, top and bottom rows) is covered by the blackout.
- [ ] A unit test fails without the fix (sizes/rounding the dark or its mask at those scales).
- [ ] If the cause is in Phaser with no workaround: stop, record it in `## Answer`, and escalate
      instead of shipping a partial fix.
- [ ] `npx tsc --noEmit`, `npm test` pass.

## Blocked By

I-ADR0057-1 (final rounding), I-ADR0057-2 (`maskInView` pinned by tests; both touch the files
this fix may change).

## Spec Reference

ADR-0057 §Decision "Masks" (`maskInView`, its two corrections, `scaleFactor` 1) and the charter's
bound "visuals identical to 3.90"; FS-ZAJMH R6 (blackout follows the backing store).

## Expected files

`game-client/src/render/world/blackoutMask.ts`, `blackoutMask.test.ts`; possibly
`src/render/viewport/mask.ts` + `mask.test.ts`, `src/render/viewport/camera.ts`
(`roundAtAnyZoom`), `src/render/world/blackout.ts`.

## Answer

**Root cause: our pixel grid, not Phaser. I-ADR0057-1 already fixed it.** The trial's
`keepOnPixelGrid` floored the main camera's scroll onto the 1/rs grid *after* Phaser's
`preRender` had built the view matrix (`cameras/2d/Camera.js`: `matrix.translate(-sx, -sy)` from
the unfloored scroll), and it left the matrix alone. A camera-fixed object takes its scroll back
out of that matrix using the *floored* scroll (`TransformMatrix.copyWithScrollFactorFrom(…,
camera.scrollX, camera.scrollY, 0, 0)`, called from `Filters.renderWebGLFilters` for a filtered
object). So both darks (`BlackoutMask.dark` and `.under`, scroll factor 0, focused on themselves
by `maskInView`) were drawn d·rs backing px to the left of and above their place, where
d = unfloored − floored scroll, in [0, 1/rs). The filter's coverage quad is then rounded
(`renderNodes/Camera.js`, under the filter camera's `roundPixels`: game config `roundPixels: true`
under `safeAuto` in the trial, and under `fullAuto` now). Its right edge lands at
round(W·rs − d·rs), one px short of the backing width round(W·rs) whenever the shift crosses the
rounding point. The left and top edges round to −1 or 0, which still covers. So **only the last
column and the last row** can open, and whether they do depends on the scroll's fraction. That
explains why it was seen at 0.94/1/1.22/1.875 and not in an isolated probe with a whole-unit
scroll. 3.90 had no filter pass for these darks.
I-ADR0057-1's `drawAt` moves the view matrices with the floored scroll, so the shift is 0 and the
quad rounds to exactly [0, round(W·rs)] × [0, round(720·rs)], the backing store.

**Repro** (headless Chrome, real hub against the local backend, player standing inside the inn,
`gl.readPixels` of the default framebuffer on `postrender`). The camera's follow is stopped and
its pre-floor scroll is set to base + f. "TRIAL" puts the trial's mechanism back at runtime: it
undoes `drawAt`'s matrix translate after each frame set-up. "Isolated" hides everything but one
dark, over a magenta camera background. Each cell is seam px / px on that line (a seam px is lit
on the edge with its inner neighbour dark). Left column and top row are 0 in every run.

| rs (view, backing) | f | TRIAL d·rs (x, y) | TRIAL right / bottom | NEW right / bottom |
|---|---|---|---|---|
| 0.9375 (1280, 1200×675) | 0.3 | 0.66, 0.22 | 675/675, 0 | 0, 0 |
| 0.9375 | 0.7 | 0.03, 0.59 | 0, 1200/1200 | 0, 0 |
| 1 (1280, 1280×720) | 0.7 | 0.7, 0.7 | 719/720, 1279/1280 (magenta 255,0,255 isolated) | 0, 0 |
| 1.2153 (1280, 1556×875) | 0 | 0.42, 0.77 | 874/875, 1555/1556 | 0, 0 |
| 1.875 (1280, 2400×1350) | 0.3 | 0.69, 0.06 | 1350/1350, 0 | 0, 0 |
| 1.875 | 0.7 | 0.44, 0.81 | 0, 2400/2400 | 0, 0 |
| 2 (1280, 2560×1440) | 0.3 | 0.6, 0.6 | 1439/1440, 2559/2560 | 0, 0 |
| 2 | 0.7 | 0.4, 0.4 | 0, 0 | 0, 0 |

Every TRIAL cell matches round(W·rs − d·rs) < round(W·rs), including 1.2153, where
1280·rs = 1555.6 leaves only 0.1 px of slack. Each dark alone opens the same seam. NEW, with
this slice's tree, was run at all five scales × f ∈ {0, 0.3, 0.7, 0.97}: 0 lit px on all four edge
lines, for the natural frame and each dark alone. With both darks hidden all edges are lit
(sensitivity check).

**Fix / regression:** no new production fix. `camera.test.ts` pins the seam: a camera-fixed
full-view rect, drawn as Phaser's filter pass draws it, covers [0, backing] after 60 following
frames at (1280, 0.9375), (1280, 1), (1280, 1.2153), (1080, 1.22), (1280, 1.875),
(1080, 1.875), (1280, 2). With `drawAt`'s two translates commented out, all seven fail. Also in
this slice: the dead `texture.camera.roundPixels = false` in `BlackoutMask.redraw` is removed.
Its comment ("or Phaser floors that corner") was 3.90's: 4.2.1's `preRender` floors nothing, and
`roundAtAnyZoom` resets the flag at every `render()`. The test's texture-camera fake now does
4.2.1's `preRender` instead of 3.90's, and the rounding tests read `roundPixels` (the flag
`fullAuto` reads).

**Residual (not observed):** the right/bottom edges still have no slack when W·rs or 720·rs is
exactly *.5. Then the backing size rounds up, and the quad's corner (the same product plus float
noise of order 1e-13 from the matrix arithmetic) could round down. Not hit at any scale probed.
No overdraw was added, because nothing measured calls for one.
