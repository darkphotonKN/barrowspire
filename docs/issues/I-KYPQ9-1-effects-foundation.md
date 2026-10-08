---
id: I-KYPQ9-1
status: done
implements: FS-KYPQ9
blocked_by: []
labels: [ready-for-agent]
title: "FS-KYPQ9 slice 1: effects foundation: the rules table, source scan, short-lived lights and teardown"
---
Implements FS-KYPQ9 §0, §B.1–§B.9, §C

**Can run in parallel with I-KYPQ9-2.** This slice touches no scene and no bake file. It ships
the shared pieces the hub and run slices call, so that downstream slices only add thin hooks.

## Files owned

- `game-client/src/render/effects/table.ts`, the runtime module, and their tests (new). There
  is no `index.ts` barrel.
- `game-client/src/render/effects/sourceScan.test.ts` (new; keep this exact name): the
  source-scan vitest. Ownership passes to I-KYPQ9-5, which turns its `it.todo` live.
- `game-client/src/render/lighting/LightMap.ts`, `game-client/src/render/lighting/index.ts`,
  `game-client/src/render/lighting/lighting.test.ts` (or a new `LightMap.test.ts` beside it).

**Not touched:** `src/scenes/**`, `tools/bake/**`, `public/art/**`, `src/utils/theme.ts`. Every
colour this FS needs already exists as a `BARROW` key.

**Downstream contract:** after this slice the table is FS-fixed and **later slices do not edit
`src/render/effects/table.ts`** (or whatever the table file is named). They add their own
per-effect modules under `src/render/effects/` and call the runtime. If a later slice finds a
table value wrong against the FS, it flags it instead of editing the table, so slices running in
parallel do not collide.

**No shared barrel.** `src/render/effects/` gets **no `index.ts`**. Every consumer (the scenes
and the per-effect modules in I-KYPQ9-4, -5 and -6) imports `table.ts`, the runtime module and
each effect module **directly** by path. A shared barrel would be a file every downstream slice
edits.

## What to Build

1. **The effect table** (§B.1, §B.2, §B.7): one typed entry per effect in §B.2: warrior slash,
   charge dust and drag trail, fireball cast, cast light, impact flare, light decay, falling
   embers, scorch, fireball trail, arrow release, arrow trail, arrow impact, hit, death dust,
   escape, entrance-marker breath, chimney smoke puff. Each entry gives:
   - duration in ms as a literal, or a period/life for the continuous ones;
   - easing;
   - colour tokens typed `keyof typeof BARROW_HEX`;
   - particle count or emit rate;
   - scale range;
   - any `yoyo`/`repeat`.

   Values come straight from §B.2 and §D–§H. The cursor textures are not table entries (§B.7
   exempts them).
2. **The effects runtime**: a small module the scenes call through thin hooks. It plays an entry
   over a baked `fx_*` texture at a world position, drawn through the projection and sorted by
   footprint (§B.8, §0.9). It also:
   - tracks every sprite, emitter, tween and light handle it creates, per owner key (a
     projectile `entity_id`, a rival id, `"self"`, `"hub"`);
   - destroys them when the duration ends, on `release(owner)`, and on `clearAll()` (§B.9);
   - when a texture is missing, plays nothing and logs once per texture. It never draws
     fallback circles (§B.10).

   No scene is wired up here. Wiring belongs to the slices that own the scenes.
3. **Short-lived lights on `LightMap`** (§C.1–§C.6):
   - `addTransient(...)` returns a handle with `x`/`y`, `intensity` (0..1) and `remove()`, plus
     an optional lifetime;
   - transient sources are culled and stamped by the same `cullInto`/`stamp` code as fixed ones,
     with the texture built once and never rebuilt;
   - at most 16 are lit at once, oldest dropped first;
   - fixed sources and the carried pool are never dropped;
   - no flame halo, and the indoor pool follows the existing rule;
   - `clearTransient()` exists, and `LightMap` clears transients itself on scene SHUTDOWN.
     The `resetRun` call to `clearTransient()` is wired by I-KYPQ9-5.

## Acceptance Criteria

- [ ] Effects-table vitest (§B, FS acceptance criteria):
  - every one-shot duration is a fixed literal ≤ 1200 ms;
  - every easing is in the allowlist `Linear`, `Sine.*`, `Quad.*`, `Cubic.*`;
  - no entry has unequal `scaleX`/`scaleY`, a scale `yoyo`/`repeat`, or an end scale > 1.6;
  - `yoyo` appears on alpha only, and only in the entrance-marker entry;
  - every colour is a `BARROW` key, with at most 3 per transient effect;
  - `amber` appears only in the entrance-marker entry (the strike-mark is a baked cursor, not
    an entry; `amberBright` in fire is not constrained);
  - `oxblood` appears only in the hit entry;
  - no one-shot emits more than 12 particles, and trail emit intervals are ≥ 40 ms.
- [ ] Source-scan vitest over `src/render/effects/**`, `src/scenes/BarrowspireScene.ts` and
      `src/scenes/HubScene.ts`: no `Bounce`, `Elastic` or `Back.` easing string, no `.shake(`,
      no `explode(`.
  - The only violation today is `emitter.explode(30)` at `BarrowspireScene.ts:1792`, in
    `playEscapeParticles`, which I-KYPQ9-5 removes.
  - Mark only the `explode(` assertion over `BarrowspireScene.ts` as `it.todo`, naming
    I-KYPQ9-5. Every other assertion stays live.
- [ ] `LightMap` vitest:
  - a short-lived source stamps while alive;
  - it is gone after `remove()` and after its lifetime;
  - it moves when its handle moves;
  - the 17th source drops the oldest;
  - fixed sources and the carried pool are never dropped;
  - the texture is not recreated.
- [ ] Runtime vitest: `release(owner)` and `clearAll()` destroy every tracked object and light
      handle. A missing texture plays nothing and logs once.
- [ ] `grep -nE '0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}' src/render/effects` is empty. The multiply
      identity, if present, is a named constant with a comment (§0.7). It is built without a
      6-digit hex literal (for example `Phaser.Display.Color.GetColor(255, 255, 255)`), so the
      hex grep stays empty.
- [ ] There is no barrel: no `src/render/effects/index.ts` exists, and consumers import
      `table.ts`, the runtime and the per-effect modules directly.
- [ ] `git diff -- game-server/` and `git status --porcelain -- game-server/` are empty.
- [ ] From `game-client/` with `export PATH=~/.nvm/versions/node/v22.13.1/bin:$PATH`:
      `npm test`, `npm run lint` and `npm run lint:fence` pass, and `npm run bake -- --check`
      exits 0 with no diff (this slice bakes nothing).
- [ ] No commits.

## Blocked By

None

## Spec Reference

FS-KYPQ9 §B.1–§B.9 (rules, written as tests), §C.1–§C.6 (short-lived light), §0 (boundary).
User stories 26 and 28.

## TDD Approach

- RED: the effects-table vitest asserting the §B.2 durations ≤ 1200 ms and the easing
  allowlist against an empty table module. Then the `LightMap` "17th source drops the oldest"
  test.
- GREEN: fill the table from §B.2/§D–§H, then add `addTransient` and the cap to `LightMap`,
  reusing `cullInto`/`stamp`.
- REFACTOR: keep the runtime's surface small: `play`, `release`, `clearAll`.
