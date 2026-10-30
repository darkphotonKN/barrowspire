---
id: I-KSD6K-3
status: open
implements: FS-KSD6K
blocked_by: []
labels: [ready-for-agent]
title: "FS-KSD6K slice 3: both fields lose the horizon and fade into a flat per-field tint (game-client)"
---
Implements FS-KSD6K §C (Requirements 13–16, 18–20), §Supersession

**Author: agent.** Client presentation only. Client-only from the worktree: start no backend.
Owner gate: the tint values are approved on a screenshot before this slice is done.

## What to Build

1. **Remove the horizon (R13).** Delete `render/world/horizon.ts` and `horizon.test.ts`; remove
   `addHorizon` and `HORIZON_DEPTH` from `render/world/scene.ts`, the horizon exports from
   `render/world/index.ts`, the `horizon` member of `FieldLook` and both entries in
   `render/world/fieldLook.ts`, and the horizon drawing in `scenes/FieldScene.ts`. Confirm nothing
   else imports them before deleting.
2. **A flat tint per field (R14).** `FieldLook` gains `beyond`, mixed from `BARROW_HEX`: the Forest
   a deep moss-black, the Meadows a soft muted green-grey (starting values in R14). The field scene
   sets it as the camera background and draws nothing else past the edge.
3. **`landBeyond` goes (R15)** with its tests; the fallback-to-Meadows look carries its tint.
4. **No hard seam (R16).** The ground fades into the tint at the map edge (starting: the outermost
   tile-deep band); the Meadows road off the west edge fades with it. Method is yours; keep it
   cheap (no per-frame work).
5. **Screenshot gate (R18).** Produce a client-only screenshot of each field's edge from the
   worktree; if the field scene cannot be reached without a server, a swatch sheet (lit ground
   tile, fade band, tint) per field stands in. Commit the tints the owner approves.
6. **Guideline (R19).** Amend `game-client/docs/design-guideline.md` "Field worlds may be daylit
   instead": no horizon backdrop; a flat per-field tint past the edge that the ground fades into;
   dated, citing FS-KSD6K.

Does not change the Forest's size, fixture or verge count (I-KSD6K-4).

## Acceptance Criteria

- [ ] No file imports `horizon`; `horizon.ts` and its test are deleted; `FieldLook` has no `horizon`; `HORIZON_DEPTH`, `addHorizon` and `landBeyond` are gone.
- [ ] Each field's `FieldLook` has a `beyond` tint mixed from `BARROW_HEX`; the field scene uses it as the camera background.
- [ ] The ground fades into the tint at the map edge in both fields; the Meadows road fades with it; no hard seam.
- [ ] An unknown field id falls back to the Meadows look, tint included.
- [ ] The owner approved each field's edge on the screenshot (or swatch stand-in); the committed tints are the approved ones.
- [ ] `design-guideline.md` amended, dated, citing FS-KSD6K.
- [ ] The hub and runs draw exactly as before.
- [ ] `npm test`, lint and `lint:fence`: no new failures versus the branch point.

## Files expected to touch

- `game-client/src/render/world/horizon.ts`, `horizon.test.ts` (deleted)
- `game-client/src/render/world/fieldLook.ts`, `fieldLook.test.ts`
- `game-client/src/render/world/scene.ts`, `index.ts`
- `game-client/src/scenes/FieldScene.ts`
- `game-client/src/render/world/ground.ts`, `ground.test.ts` (only if the edge fade lives in the ground layer)
- `game-client/docs/design-guideline.md`

## Blocked By

None.

## Spec Reference

FS-KSD6K §C R13–R16, R18–R20; §Supersession rows 4–5; User Stories 10–15, 17, 18, 24, 25;
Acceptance Criteria (client) 1–3, 5–8; Decision log 3, 9, 10, 11.

## TDD Approach

- RED: `fieldLook.test.ts` expects each field's `beyond` tint and no `horizon` member; the unknown-id fallback carries the Meadows tint.
- RED: a test for the edge fade's plan (band placed only at the map edge, fading to the field's tint).
- GREEN: the tint in the look table, the scene's camera background, the fade; horizon code removed.
