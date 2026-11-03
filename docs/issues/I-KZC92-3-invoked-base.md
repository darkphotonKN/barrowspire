---
id: I-KZC92-3
status: done
implements: FS-KZC92
blocked_by: [I-KZC92-1]
labels: []
title: "FS-KZC92 slice 3: the invoked shimmer base, baked and on the gallery (game-client)"
---
Implements FS-KZC92 §C, §D (fx_ring), §H (invoked card)

## What to Build

The second base, built and tested with no game consumer (R19).

- **Bake** (R21): add `fx_ring` to `tools/bake/page/models/fx.js`: a soft ground ring, falling off on both sides with no hard edge, tint-taking, seeded. Re-bake; extend the manifest test.
- **Base** (R13–R18) in `src/render/effects/shimmer.ts`: 2 strands × 7 motes on an 820 ms `Sine.easeInOut` climb, lagged 45 ms per mote, at angle `phase + t × 3.2π`, radius `20 × (1 − 0.45 t)`, height `t × (crown + 4)`. A mote is in front while `sin(angle) > 0` and behind it at alpha 0.55 otherwise. Each fades in over its first tenth and out over its last fifth, at a fixed scale. The ground ring grows 0.35×→0.75× over 700 ms. 6 head glints start at `740 + i × 35` ms and live 220–280 ms. One light, radius 120, for 1120 ms. Everything is gone by `SHIMMER_INVOKED_MS` = 1200. It takes any look, and follows, sorts, stacks and tears down as the granted base does.
- **Gallery card** (R39): an invoked base card, `module: "shimmer"`, played with `HEAL_LOOK` as a stand-in. The card's name says it's a stand-in.

Files expected: `game-client/tools/bake/page/models/fx.js`, `game-client/public/art/manifest.json` and the fx atlas image(s), `game-client/src/render/art/manifest.test.ts`, `game-client/src/render/effects/shimmer.ts`, `game-client/src/render/effects/shimmer.test.ts`, `game-client/src/dev/gallery/effects.ts`.

## Acceptance Criteria

- [ ] `fx_ring` is in the manifest, authored by `fx.js`, covered by the manifest test; a re-bake is byte-identical; a contact sheet of the ring is shown to the owner.
- [ ] With a pinned random source, the invoked base makes 14 motes, 6 head glints, one ring and one light, and everything is gone by 1200 ms.
- [ ] Motes sort in front while `sin(angle) > 0` and behind otherwise (at alpha 0.55); no object's scale shrinks; the source scan passes.
- [ ] `forget()` takes down live invoked shimmers too; a missing sheet plays nothing and logs once.
- [ ] The gallery shows a playable invoked base card named as a heal-look stand-in; the FS-1819Q enforcement test passes.
- [ ] Nothing in the game plays the invoked base; the granted base's tests pass unchanged; no `game-server/` diff; no new dependencies.

## Blocked By

I-KZC92-1 (shares `shimmer.ts`, the look type and the baked `fx_glint` / `fx_mote`). It can run in parallel with I-KZC92-2, which doesn't touch `shimmer.ts`.

## Spec Reference

FS-KZC92 §C R13–R19, §D R21 (`fx_ring`) and R22–R28, §H R39 (invoked card); User Stories 12, 15, 17, 18, 20, 25.

## TDD Approach

- RED: a pinned-random test that the invoked base makes 14 motes and 6 head glints and is empty by 1200 ms.
- GREEN: the spiral in `shimmer.ts` over the baked `fx_ring`.
