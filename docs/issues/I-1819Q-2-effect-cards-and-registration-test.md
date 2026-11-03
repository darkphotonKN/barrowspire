---
id: I-1819Q-2
status: done
implements: FS-1819Q
blocked_by: [I-1819Q-1]
labels: []
title: "FS-1819Q slice 2: effect cards on one canvas, and the test that forces a card (game-client)"
---
Implements FS-1819Q §D, §B (R7)

## What to Build

The effects family of the gallery, and the test that keeps it complete.

- **Cards** (R10): `src/dev/gallery/effects.ts`, one `{ module, name, demo }` per effect module in `src/render/effects/` (today: aimLine, arrow, charge, cut, death, entrance, escape, fireball, hit, mist, parry, riposte, shadowShot, slash, smoke). `demo` is a one-line call that plays the effect, or `demo: null` with a one-line `reason` when it truly needs live game state. A null card still shows, named, with its reason.
- **Canvas** (R11): one Phaser scene with one figure (the mage) on one flagstone floor under `LightMap` with `AMBIENT.run`, an `EffectsRuntime` wired to it. The throwaway `src/dev/shimmer/ShimmerScene.ts` shows the recipe (`registerArt`, `preloadMenuArt`, `CharacterAnimator`, `ground_flagstone`).
- **Delete the throwaway** (R7), after reading the recipe: `src/app/dev/shimmer/` and `src/dev/shimmer/`. They were never committed, so there is no git history to fall back on. Check with the user first that the heal-shimmer work no longer needs the preview. Clicking a card plays it on the figure; "play all in turn" plays every playable card in sequence, and a second click restarts the sequence. No other controls.
- **No effect changes** (R13): demos call the modules as the game does. If a module can't be called without changing it, the card gets `demo: null` with a reason.
- **Enforcement test** (R12), next to `effects.ts`: lists non-test `.ts` files in `src/render/effects/`, minus the allow-list `runtime, table, fakeScene, star, flights, projectile, sourceScan`; fails for each with no card, with the message `add a card in src/dev/gallery/effects.ts`; also fails for a card naming a missing module, or a null card with an empty reason.

Files expected: `game-client/src/dev/gallery/effects.ts`, `game-client/src/dev/gallery/effects.test.ts`, `game-client/src/dev/gallery/GalleryScene.ts` (or similar), the effects section in the slice-1 gallery component, deletions under `game-client/src/app/dev/shimmer/` and `game-client/src/dev/shimmer/`. No file under `game-client/src/render/effects/` changes.

## Acceptance Criteria

- [ ] `/dev/gallery` shows one card per effect module; clicking a playable card plays it on the mage under the run ambient.
- [ ] "Play all in turn" plays every playable card in sequence.
- [ ] A `demo: null` card shows its name and reason.
- [ ] The test passes today; adding a non-allow-listed file to `src/render/effects/` fails it with `add a card in src/dev/gallery/effects.ts`; a stale card fails it.
- [ ] The shimmer throwaway folders are gone.
- [ ] No diff under `src/render/effects/`; existing effect tests pass unchanged; no new dependencies.

## Blocked By

I-1819Q-1

## Spec Reference

FS-1819Q §B R7, §D R10–R13; User Stories 1, 3, 4, 7, 8, 11; Edge States (click during a demo, play-all twice, module renamed, new helper file).

## TDD Approach

- RED: the enforcement test against an `effects.ts` with no cards (fails, naming every module).
- GREEN: a card per module; then the canvas and click-to-play.
