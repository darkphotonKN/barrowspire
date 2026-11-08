# ADR-0059 — An atlas group is resident or scene-scoped; a scene-scoped one is evicted, with its animations, once the next scene has loaded

Status: accepted
Date: 2026-11-06
Scope: `game-client` only: how the client loads and frees baked art (`src/render/art/`, the
scenes' `preload()`, PreloadScene). Not the bake, the art, the manifest's format or the server.
Specified by [FS-C4JWH](../specs/C4JWH-scene-scoped-art-loading.md).
Amends: none. [ADR-0020](0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md)
Decision 5 ("runtime cost is image loading only") and [ADR-0058](0058-a-sheet-may-be-baked-at-2x-and-trimmed-every-size-stays-in-screen-px.md)
say nothing about when art is loaded or freed; both stand unchanged.
Builds on: ADR-0020 Consequences ("texture memory and atlas packing need budgeting"), ADR-0058
(a 2x sheet costs about four times the memory, trimmed about twice)
Amended by: [ADR-0071](0071-the-blood-demons-art-is-its-own-group-fetched-on-demand-when-one-first-appears.md) — Decision 2 ("never on demand while it runs") and Decision 6 (the placeholder), for a group the table names as on demand: the blood demon's

## Context

Decided in the charter Nick approved on 2026-11-06 (「核准」) as a charter default (D10, with D1,
D2, D4, D5 and D9). Recorded without adversarial review: no `challenge-me` pass was run.

Forces:

- **The client holds every atlas for the whole game.** PreloadScene loads all of them at boot,
  473.1 MB decoded (width × height × 4), and nothing frees them. The four 2x class sheets alone
  are 177.2 MB (ADR-0058, FS-3V7GC).
- **No scene draws most of it.** The hub draws townsfolk and no monster; a field one kind of
  creature; a run its creatures and the boss, and no townsfolk. The boss alone is 122.7 MB, the
  five creature and folk groups 272.8 MB.
- **Some art every scene draws.** Other players, rivals and the party busts draw any of the four
  classes in any world; monster sizing reads the knight's sheet; the set groups are small (23.2 MB
  together) and spread across scenes.
- **Phaser frees a texture for real.** `TextureManager.remove` → `Texture.destroy` →
  `renderer.deleteTexture` (Phaser 4.2.1). But a sprite still on a removed frame throws on its next
  render (`SubmitterQuad.js:189`), and an animation is not removed with its texture: it keeps
  pointers to dead frames, and `registerFrames` would skip re-creating it on a re-load.
- **Only one scene runs at a time.** A world transition stops the old scene before it starts the
  next (`enterWorld`), and a stop destroys the old scene's display list. The new scene's preload
  completes before its `create` runs.
- **A sheet's look is fixed when its animator is built.** `CharacterAnimator` decides `baked` at
  construction, so art that arrives after a creature is first drawn leaves it a placeholder.

## Decision

1. **Every atlas group is resident or scene-scoped.** A resident group is loaded at boot by
   PreloadScene and kept for the game: the four class groups and every small group. A
   scene-scoped group (folk, wildlife, fodder, creatures, boss) is loaded by the scenes that draw
   it. A group not named as scene-scoped is resident, so an omission costs memory, never art.
2. **One declarative table in `src/render/art` says which scene-scoped groups each scene holds.**
   A scene loads its groups in its own `preload()`, whole, at entry, never on demand while it runs.
3. **Eviction happens once the next scene's preload has completed, before its `create` builds
   anything.** Every page of a scene-scoped group that is a texture and not in the new scene's set
   is removed from the texture manager, which frees its GPU memory. Nothing is evicted earlier,
   and a scene re-entered keeps its groups.
4. **An animation goes with its texture.** Before a page is removed, every animation registered on
   it is removed from the animation manager, so a re-load registers fresh frames and animations.
5. **Nothing may hold a frame of a scene-scoped group across scenes.** A texture, frame,
   animation or game object built on a scene-scoped group belongs to the scene that drew it and
   goes with its display list or its scene-end teardown (`onSceneEnd`). A module-level cache may
   keep numbers read from such a frame (bounds, colours), which stay true for the same PNG
   re-loaded, never the frame, texture or GL texture itself. A data-URL or DOM copy is not a frame.
6. **A sheet drawn outside its scene's table entry draws as the placeholder with one warning**,
   and a test walks every scene's scene-scoped sheets against the table so that it cannot ship.

## Consequences

- **The GPU holds about 200 MB on the menus, 223 in the hub, 235 and 240 in the fields and 377 in
  a run** (estimates from the manifest; measured figures in FS-C4JWH § Verification), against
  473 MB everywhere today.
- **A transition briefly holds both scenes' groups.** Eviction waits for the new scene's load, so
  while it downloads, the old groups are still on the GPU (run → hub about 400 MB). Evicting at
  the start of the preload would lower the peak; it is not done, so that the rule has one moment
  and a scene stopped mid-load leaves the next scene to decide.
- **Entering a world can now mean a download**, so a world scene that queues anything shows the
  boot screen's torch bar (FS-C4JWH §D). Going back to a scene whose groups were evicted
  downloads them again, from the browser's HTTP cache when it still has them.
- **The boss loads with every run**, 122.7 MB, though most floors never show it. Loading it on
  demand would need the animator to re-decide `baked` when art arrives; deferred until a 2x boss
  makes it worth it.
- **A new creature, townsperson or group needs a table entry**: the coverage test fails until the
  scene that draws it is named; an unnamed group is resident and shows up in the memory figures.
- **Code-review can flag** any module-level state that keeps a Phaser frame, texture or animation
  of a scene-scoped group, and any scene that draws a scene-scoped sheet without a table entry.
- **Changing a group's residency is a table change**, checked by the memory measurement and the
  coverage test; it needs no new ADR unless it changes the rule itself.
