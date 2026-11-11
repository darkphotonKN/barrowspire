---
id: I-B4SG9-5
status: open
implements: FS-B4SG9
blocked_by: []
labels: [ready-for-agent]
title: "FS-B4SG9 slice 5: bake the Bone Archer's sheet, the ghoul rig holding a bow, with its shoot clip"
---
Implements FS-B4SG9 §E (R24–R29)

**Type:** HITL. **Ends at a gate:** the owner approves the contact sheet before I-B4SG9-6 starts.

**Running the bake** needs Node, the repo's `playwright-core`, and an installed Google Chrome (or
a Playwright Chromium, or `BAKE_BROWSER=<path>`), which `npm run bake` launches headless on
SwiftShader against a local server. If the agent cannot launch a browser, it authors the builder
and clip, runs the unit tests under `tools/bake/page/characters/`, and hands the bake itself to
the owner.

## Files owned

- `game-client/tools/bake/page/characters/cast.js` (a `boneArcher` builder on the ghoul's; the `CAST` entry)
- `game-client/tools/bake/page/characters/clips.js` (the shoot clip for the hunched rig; carried poses for idle and walk if the bow needs them)
- `game-client/tools/bake/page/characters/gear.js` only if `longbow` needs a mount option for this rig; its look does not change
- `game-client/public/art/creatures-*.png`, `game-client/public/art/manifest.json` (the re-bake; the `creatures` atlases reflow)
- `game-client/src/render/art/manifest.test.ts` (coverage assertions)

## What to Build

- `creature_bone_archer_base` (R24): the ghoul's own build (proportions, bones, rags, hostile
  eyes) with the existing `longbow` in the bow hand and its live string. Authored in code
  (ADR-0021). The ghoul's own sheet must come out of the bake unchanged in pixels.
- One `CAST` entry in the `creatures` group; 8 directions × `idle`, `walk`, `attack`, `death` at
  the standard `ANIMATIONS` rates; an `authored:` provenance line (R25).
- The `attack` clip is the shot (R26): raise, nock, draw with the string pulled to the hand and the
  arrow showing, loose on the last frames. It lasts 0.6 s within one frame. Idle and walk carry
  the bow with no arrow nocked. Death is the ghoul's, bow in hand, eyes out by the last frame.
- It stays in the fodder band and keeps the ghoul's hunch, and the bow is visible at 1× in idle
  and walk in all 8 directions (R27).
- Manifest coverage assertions (R28). Deterministic: `npm run bake -- --check` exits 0 after the
  committed bake.

## Acceptance Criteria

- [ ] `creature_bone_archer_base` is in the manifest: 8 directions, the four clips, an `authored:`
      source, group `creatures`; `manifest.test.ts` asserts it.
- [ ] Its `attack` clip lasts 0.6 s within one frame, with the string drawn and the arrow showing
      before the loose.
- [ ] `creature_ghoul_base`'s frames are pixel-identical to before the change.
- [ ] `npm run bake -- --check` exits 0 after the committed bake; the bake's own tests and
      `npm test` pass.
- [ ] **The owner has approved the contact sheet** in `tools/bake/review/` (R29). A rejection is
      more modelling or animation work in this slice, not a change of method.

## Blocked By

None

## Spec Reference

FS-B4SG9 §E R24–R29; user stories 1, 2, 3, 22; acceptance criteria "Art"; §Open questions 4.

## TDD Approach

- RED: the manifest coverage assertions for `creature_bone_archer_base`.
- GREEN: the builder, the clip, the `CAST` entry, the committed bake.
