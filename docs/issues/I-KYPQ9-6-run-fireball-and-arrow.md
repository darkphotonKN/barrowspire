---
id: I-KYPQ9-6
status: done
implements: FS-KYPQ9
blocked_by: [I-KYPQ9-5]
labels: [ready-for-agent]
title: "FS-KYPQ9 slice 6: run: fireball cast, flight light and impact; arrow release, baked flight, trail and impact"
---
Implements FS-KYPQ9 §E, §F, §C

**Run lane, after I-KYPQ9-5.** This slice can run in parallel with the hub lane (I-KYPQ9-3,
I-KYPQ9-4). It waits for I-KYPQ9-5 only because both edit `BarrowspireScene.ts` and its
`resetRun`. I-KYPQ9-5 already depends on I-KYPQ9-1 and I-KYPQ9-2. It does not bake.

## Files owned

- `game-client/src/scenes/BarrowspireScene.ts`:
  - the mage cast branches (`fireball`, `triple_fireball`) and the archer release branches
    (`arrow`, `triple_arrow`);
  - `updateProjectiles` (creation, per-tick move, removal and impact);
  - the projectile part of `resetRun` (next to `projectileSprites.clear()`).
- `game-client/src/scenes/BarrowspireScene.test.ts`, projectile cases only.
- New modules under `game-client/src/render/effects/`: `fireball.ts`, `arrow.ts` (cast or
  release, flight, trail and impact), plus their tests.
- **Direct imports only:** import `table.ts`, the runtime and each effect module by path. Do
  not create `src/render/effects/index.ts`.

**Not touched:** `HubScene.ts`, `tools/bake/**`, `public/art/**`, `src/render/effects/table.ts`
(read only), `src/render/effects/sourceScan.test.ts`, `src/render/lighting/**` (read only),
`src/render/world/**` (read only), and the I-KYPQ9-5 effect modules (read only).

## What to Build

1. **Fireball cast** (§E.1): one per `fireball`/`triple_fireball` send.
   - A few `fx_ember` motes drawn in toward the casting hand, brightening, over 160 ms.
   - A transient `ember` light at the caster for 200 ms.
   - The `0xffa500` scale-flash goes.
2. **Fireball flight** (§E.2). Signal: a non-`"arrow"` `ProjectileState`.
   - `fx_fire_core` at chest height (`standAt(…, 5)`), steady, with no pulse, yoyo or scale
     tween. The three hex circles and the 150 ms pulse go.
   - An `fx_ember`/`fx_smoke` trail behind it, opposite the projected velocity: one particle
     per ≥ 40 ms, 300 ms life.
   - A transient `ember` light rides on the core and moves every frame.
3. **Fireball impact** (§E.3). Signal: the `entity_id` absent from state, for a hit or max range
   alike.
   - A 120 ms flare at the last world position.
   - The light jumps up, decays over 500 ms, and is removed.
   - Up to 8 embers fall under gravity over 600 ms.
   - An `fx_scorch` smudge (`pitch`/`barrowDeep`) fades over 1200 ms.
4. **Arrow release** (§F.1): one per `arrow`/`triple_arrow` send. At the bow (16 px along the
   aim, as today), a string-snap shimmer plus 2–3 `fx_dust` fibre motes
   (`vellumDark`/`vellumFaint`), 140 ms. The white streak and the `0xd4a373` puff go.
5. **Arrow flight** (§F.2):
   - the baked `fx_arrow` at chest height, rotated to the projected velocity as today,
     replacing the hex Graphics arrow;
   - an air-streak trail of `fx_dust` (`vellumFaint`, alpha ≤ 0.3), one per ≥ 40 ms, 180 ms
     life, dying with the arrow;
   - no light.
6. **Arrow impact** (§F.3): a dull puff of dust and splinters (`barrowBrown`/`vellumDark`, up to
   6 particles) drops to the ground over 300 ms.
7. **Rivals** (§F.4): rival projectiles get flight, trail, light and impact. Cast and release
   play only on the delver's own send, never on first sight.
8. **Teardown** (§B.9, edge states): a projectile cleared by `resetRun` plays no impact, and its
   sprite, trail emitter and light are destroyed with `projectileSprites.clear()`.
   - A projectile seen for a single tick still gets one impact at its one known position, and
     a clean light lifecycle.
   - Triple casts respect the per-projectile emit rate and the 16-light cap.

## Acceptance Criteria

- [ ] Vitests for each effect module, driven by the table:
  - cast: 160 ms gather, 200 ms light;
  - the trail never emits more than once per 40 ms per projectile;
  - the fireball core and the arrow never scale;
  - impact: ≤ 8 embers, 120/500/600/1200 ms, and the light is removed after decay;
  - arrow impact: ≤ 6 particles, 300 ms;
  - arrow trail alpha ≤ 0.3, and the arrow stamps no light;
  - no `amber` key anywhere in these modules.
- [ ] Lifecycle vitest:
  - a single-tick projectile creates and removes its light and plays one impact;
  - `resetRun` mid-flight plays no impact and leaves no tracked object or transient light.
- [ ] Grep: none of the replaced fireball or arrow bodies still contains a colour literal.
      `grep -nE '0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}' src/render/effects` is empty.
- [ ] Diff review: the `CastSkill` sends for `fireball`, `triple_fireball`, `arrow` and
      `triple_arrow` are unchanged in payload and timing. No input binding change (§0.2).
- [ ] `git diff -- game-server/` and `git status --porcelain -- game-server/` are empty.
- [ ] From `game-client/` with `export PATH=~/.nvm/versions/node/v22.13.1/bin:$PATH`:
      `npm test`, `npm run lint` and `npm run lint:fence` pass, and `npm run bake -- --check`
      exits 0 with no diff.
- [ ] Manual check in the run (preview on :3939, coordinator against the Reference):
  - fireball cast, flight and impact, and arrow release, flight, trail and impact, match §E/§F;
  - the fireball light moves with the projectile and decays after impact;
  - nothing bounces, throws confetti, flashes white or shakes;
  - after `resetRun` and leaving the scene, the display list and the light-map source count
    are back to baseline.

  Not a HITL gate.
- [ ] No commits.

## Blocked By

I-KYPQ9-5: shared `BarrowspireScene.ts` and `resetRun`. Through I-KYPQ9-5, it also waits for
I-KYPQ9-1 and I-KYPQ9-2.

## Spec Reference

FS-KYPQ9 §E.1–§E.3, §F.1–§F.4, §C.1–§C.3 (transient light use). Edge states: rejected cast,
hit vs fizzle, first seen far from the caster, single tick, many projectiles, reconnect or
`resetRun` mid-flight, impact under a roof. User stories 11, 12, 13, 14, 15, 16, 17, 26.

## TDD Approach

- RED: the trail-rate test (no emit within 40 ms of the last one, per projectile) and the
  single-tick lifecycle test (light added then removed, one impact) against stub modules.
- GREEN: write `fireball.ts`/`arrow.ts` over the runtime and transient lights, then replace the
  hex Graphics in `updateProjectiles` with hook calls.
