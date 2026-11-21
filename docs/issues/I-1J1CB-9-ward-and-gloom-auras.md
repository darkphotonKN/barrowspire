---
id: I-1J1CB-9
status: open
implements: FS-1J1CB
blocked_by: [I-E1ZDG-2]
labels: [blocked]
title: "FS-1J1CB slice 9: the Spellwarden's ward and the Shadow Ranger's gloom, always on, cheap per body, through the contact sheet"
---
Implements FS-1J1CB §E (Requirements 31–38), §I (Requirement 48)

**Lane: agent** (game-client). **HITL gate:** Kranti approves the auras from a contact sheet.

## What to Build

- An **aura** effect (e.g. `src/render/effects/aura.ts`) on the `ShimmerFx` pattern: tracked
  objects, `follow(feet)` each frame, `forget()`, built from `glitter.ts` `drawGlint` and the baked
  `fx_glint` / `fx_mote`. No new baked texture, no light on the light-map, no feet glow. Loops for
  as long as its body is drawn alive.
- **Ward** (R32): `necrotic` glints with `vellum` centres winking slowly on a faint shell round the
  figure (an ellipse a little wider than the shoulders, shins to just over the crown, using the
  sheet's `crown`), alpha about half the heal glint's, a wink every 400–700 ms, at most 6 alive.
- **Gloom** (R33): `umbra` motes, no centre and no glow, rising a little off the figure and sinking
  back as they fade, at most 8 alive.
- **Cost** (R34): a pool per body built once; no allocation per frame after; split in front and
  behind the body by depth as the granted shimmer; drawn under the light-map.
- **Lifecycle** (R35): one aura per body whose state carries `spellwarden` or `shadow_ranger`, own
  and others', in the town, fields and runs; it hides with its body (fog, blackout, out of
  interest), stops on the death clip and while dead, resumes on respawn, starts when a spec
  appears mid-scene, and goes with the body or the scene.
- **Reduced motion** (R36): a few still glints at lower alpha, no winking or drift.
- A heal shimmer plays in full over the ward (R37).
- **Gallery** (R38): a card for each aura on the baked mage and archer (`src/dev/gallery/effects.ts`;
  the `effects` family).
- **Contact sheet:** both auras from the gallery on the town's and the run's ambient, plus a ward
  under a heal shimmer. List it in the hand-back; hold until Kranti approves; tweaks are made here.

Hooks into the same player-body code in the three scenes as I-1J1CB-2; whichever lands second
uses the other's body helper rather than adding a second one.

**Placement (ADR-0086)** *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*: an aura follows a body and is a world effect (Decisions 2.1,
2.2), so it is built and drawn by each world scene, under its light-map, with the world's own
`ShimmerFx` pattern. Nothing goes in `UIScene` or crosses the UiBridge; the world reads the
specialization from its own game state. Being world objects, the auras draw under every UI piece,
which is correct for them (no overlap to avoid, Decision 5).

## Acceptance Criteria

- [ ] A Spellwarden body draws the ward and a Shadow Ranger body the gloom, in every world; no
      other body draws either.
- [ ] Neither exceeds its alive cap; neither adds a light; a test on the fake scene shows no
      object created after the pool is built across 10 s of frames.
- [ ] The aura hides with its body, stops on death, resumes on respawn.
- [ ] Under reduced motion it holds still at lower alpha.
- [ ] A heal shimmer on a Spellwarden plays in full.
- [ ] Every colour is a token; `table.test.ts`'s and `sourceScan.test.ts`'s bounds hold.
- [ ] The gallery shows both; Kranti approved the contact sheet.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` pass.

## Blocked By

I-E1ZDG-2 (`specialization` on the world state).

## Spec Reference

FS-1J1CB §E R31–R38; §Acceptance Criteria "Auras"; §Edge States (many auras, fog, dead, reduced
motion, pick mid-scene); User Stories 9, 14, 23, 24. Guideline *Shimmers* (and its Auras
amendment, I-1J1CB-1). ADR-0013, ADR-0020.

## Files expected to touch

- `game-client/src/render/effects/aura.ts` (new, + `aura.test.ts`)
- `game-client/src/render/effects/glitter.ts` (only if `drawGlint` needs a no-centre option)
- `game-client/src/scenes/HubScene.ts`, `FieldScene.ts`, `BarrowspireScene.ts` (player bodies)
- `game-client/src/dev/gallery/effects.ts`

Not touched: `src/scenes/UIScene.ts`, `src/ui/` *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*

## TDD Approach

- RED: `aura.test.ts` with `fakeScene`: a ward followed for 10 s never has more than 6 live glints,
  creates no object after its pool, and adds no light.
- GREEN: the pooled aura and its two looks.
