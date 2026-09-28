# ADR-0021 — Characters and creatures are authored in code in the bake tool, not sourced as third-party models

Status: accepted
Date: 2026-09-27
Scope: `game-client` character and creature art (the bake tool under `game-client/tools/bake/`).
Amends: [ADR-0020](0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) — Decision 6 ("Real rigged models for characters")

## Context

Recorded without adversarial review. This is a direct call by the owner.

ADR-0020 Decision 6 said heroes and creatures would come from rigged, animated third-party models
(the follow-up FS named Mixamo), sourced under a redistributable licence. That followed from the
spike, where characters built from primitives looked like mannequins.

The owner rejected sourcing. Stock models look like what everyone else ships, and the point of
the restyle is art that is Barrowspire's own. Sourcing also put an Adobe-login download on the
critical path, and no agent can perform that step.

The spike's characters were already authored in code: a jointed humanoid, dressed per spec
(cloak, hood, belt, weapons), posed per frame by a hand-written walk cycle, and baked through the
isometric camera. Their weakness was fidelity, not the method. Rigid primitive segments showed
seams at the joints, proportions were off, surfaces were flat colour, and cloth barely moved. At
UO's sprite scale (roughly 70 px tall) a face is a handful of pixels. What makes a character read
is its silhouette, its material texture and its motion, and all three can be authored in code.

## Decision

**Characters and creatures are modelled, rigged and animated in code inside the bake tool. No
third-party character model or animation is used.**

1. **Our own rig.** Characters are built on one shared humanoid skeleton (three.js `Bone` /
   `SkinnedMesh`), with creature variants that change proportions and add bones (tail, jaw,
   hunch). Bodies are smooth skinned meshes, so joints bend without seams. They are not stacked
   rigid primitives.
2. **Authored form and materials.** Anatomy is built from shaped geometry (lathe, tapered tube,
   subdivided shapes) to fixed proportions. Surfaces use procedurally generated textures and
   normal maps: mail, plate, leather, wool, rust, grime. Colours come from `BARROW` (ADR-0013).
3. **Hand-keyed animation.** Idle, walk, attack and death are authored as keyframe clips on the
   shared rig. Cloth, hair and tails get secondary motion through spring-lagged bones.
4. **Provenance is "authored".** Manifest source/licence entries for these sheets name the bake
   module that produced them and the project's own licence. There is no third-party asset to
   record.
5. **Owner review gates integration.** Before scenes switch to character sheets, the bake emits a
   contact sheet (every class and creature × 8 directions × each animation, at game scale) for the
   owner to approve. Visual quality is judged there, not in code review.

All other clauses of ADR-0020 stand unchanged.

## Consequences

- **No download, and no human step on the critical path.** Character work is fully agent-doable
  once the bake tool and projection exist.
- **Nothing to license, nothing to keep out of git.** `tools/bake/sources/` is no longer required
  for characters. It may stay, gitignored, as a place for any future external reference material.
- **The quality ceiling depends on our effort.** A sourced model gets anatomy and cloth for free.
  Here each has to be built, so character art is the largest single piece of authoring in this
  effort, and the contact-sheet review is where it succeeds or fails. If a class still reads as a
  mannequin at game scale, the fix is more modelling or animation work, not a return to sourcing.
- **The art is unique and fully editable.** Tweaking proportions, gear or motion is a code change
  and a re-bake, reviewable as a PNG diff.
- **Equipment layering fits naturally.** Gear is already authored as separate meshes on one rig,
  so baking layers per slot later reuses the same skeleton and clips.
