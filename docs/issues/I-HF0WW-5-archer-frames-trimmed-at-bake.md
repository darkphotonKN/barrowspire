---
id: I-HF0WW-5
status: done
implements: FS-HF0WW
blocked_by: [I-HF0WW-1]
labels: []
title: "FS-HF0WW slice 5: the archer's frames trimmed to their pixels at bake time, a per-sheet switch (game-client)"
---
Implements FS-HF0WW §D (Requirements 22–26)

**Lane: agent (AFK), retroactive.** Built on `spike/archer-2x`; ported to Phaser 4.2.1 and
re-verified on screen on 2026-11-06.

## What to Build

`trim: true` on a catalogue entry (the archer): each frame cut to its pixels plus one px, on whole
screen px (`lib/trim.mjs`), shelf-packed at its own size (`lib/pack.mjs`), the manifest marking the
sheet `trimmed` and each frame's `trim` (`bake.mjs`); the review contact sheet puts the cut back
(`lib/contact.mjs`). The client registers each cut with `Frame.setTrim` at the whole frame's size
(`render/art/phaser.ts`), `MenuFigure` sets a trimmed portrait's crop again each tick, the bust
portrait reads the whole frame.

Phaser 4 port (2026-11-06): `render/art/phaser.test.ts` checks the trimmed frame against Phaser
4.2.1's own `Frame`, `Size` and `Origin` from the bundle (4.2.1 exports no `phaser/src/...`
subpaths); all five checks hold, including the crop shrinking from the last frame's overlap. The
`trim.mjs` and `menuFigure.ts` comments describe Phaser 4's per-corner rounding.

## Acceptance Criteria

- [x] Lossless: 336/336 archer frames byte-identical to the untrimmed bake when re-expanded.
- [x] One atlas page, 2924×3844, 45 MB decoded (137 MB on three pages untrimmed); PNG 6.1 MB.
- [x] The validator rejects a malformed `trimmed` or `trim` (`manifest.test.ts`).
- [x] On screen, Phaser 4.2.1: in the world (560 frames), the silhouette (40) and the roster portrait (6), pixel-identical to the untrimmed 2x archer at render scale 1 and 2; at 1.5 every frame within 0.5 backing px, frame-to-frame change at most 0.5 px; the menu hero (0.65) at most 0.87 px (FS-HF0WW § Verification, ADR-0058).
- [x] Tests pass; `npm run bake -- --check` reports no changes.

## Blocked By

I-HF0WW-1

## Spec Reference

FS-HF0WW §D R22–R26; user stories 17–19, 20.

## Commits

9da19c89 (bake), 3a633718 (client), 8bb9ad9c (art), 1523be5d (Phaser 4 test port).
