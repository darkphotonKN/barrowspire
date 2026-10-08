---
id: I-KYPQ9-4
status: done
implements: FS-KYPQ9
blocked_by: [I-KYPQ9-1, I-KYPQ9-3]
labels: [ready-for-agent]
title: "FS-KYPQ9 slice 4: hub chimneys with smoke, the gauntlet cursor in the hub, vellum queue text"
---
Implements FS-KYPQ9 §A.6, §H.3, §I

**Hub lane, after I-KYPQ9-3.** This slice can run in parallel with I-KYPQ9-5 and I-KYPQ9-6. It
does not bake: the `chimney` sheet comes from I-KYPQ9-3, and `fx_smoke` and `cursor_gauntlet`
come from I-KYPQ9-2, which I-KYPQ9-3 already waits for.

## Files owned

- `game-client/src/scenes/HubScene.ts`: roofs/houses (chimney placement), smoke teardown,
  `showQueueProgress`, the dialogue-option hover, and the cursor install at create.
- `game-client/src/render/effects/smoke.ts` (new, or a similar name): the chimney smoke emitter,
  plus its test.
- `game-client/src/render/world/houses.ts` / `roofs.ts` and their tests, only if the chimney
  spot helper belongs there. **Additive only:** new exports, no signature changes to existing
  ones.
- **Direct imports only:** import `table.ts`, the runtime and `smoke.ts` by path. Do not create
  `src/render/effects/index.ts`.

**Not touched:** `tools/bake/**`, `public/art/**`, `BarrowspireScene.ts`,
`src/render/effects/table.ts` (read only), `src/render/lighting/**` (read only),
`src/render/cursors/**` (read only).

## What to Build

1. **Chimneys** (§A.6):
   - each of the five hub houses (`housesFrom`) gets one `chimney` on the camera-facing slope,
     so the stack visibly rises from the roof;
   - the spot is derived from the house bounds and `tileHash`, so every client sees the same
     hub;
   - the chimney is drawn and sorted with that house's roof pieces and joins the roof's `parts`,
     so `hideRoofOverhead` hides it;
   - it does not go through `blocked()`, and it is not subject to §A.3.
2. **Smoke** (§A.6), one continuous emitter per chimney top:
   - `fx_smoke` tinted `slate`/`vellumFaint`, alpha ≤ 0.35;
   - one fixed wind direction for the whole hub;
   - 4000 ms life, growing monotonically to at most 1.6×, at most 10 puffs alive per chimney;
   - values come from the chimney-smoke entry in the I-KYPQ9-1 table;
   - smoke draws **under** the light-map and stamps no light;
   - emitters are destroyed on SHUTDOWN/DESTROY and whenever scenery is rebuilt;
   - without the `chimney` sheet, or without `fx_smoke`, nothing is drawn (logged once, §A.9).
3. **Hub cursor** (§H.3): install `cursor_gauntlet` as the default cursor at scene create,
   through I-KYPQ9-2's `cursorCss`, with `default` as the fallback. Hovering a dialogue option
   no longer switches to `"pointer"` (today at HubScene L1173–1175); the existing `vellum`
   brighten is the cue. No strike-mark in the hub.
4. **Queue text colour** (§I): the `showQueueProgress` text changes from `amber` to `vellum` on
   its `charcoal` ground. Copy, position, size, font, depth and trigger are unchanged.

## Acceptance Criteria

- [ ] Smoke emitter vitest:
  - at most 10 alive per chimney;
  - life 4000 ms;
  - end scale ≤ 1.6 and monotonic, with no yoyo/repeat;
  - alpha ≤ 0.35;
  - colours are `slate`/`vellumFaint`;
  - the depth is below `LIGHTMAP_DEPTH`;
  - destroy leaves no live emitter.
- [ ] Chimney placement vitest: one chimney per house, on the camera-facing slope, so the stack
      visibly rises from the roof, and the same result for the same walls (deterministic).
      Revised by coordinator: north-half stacks read as ground pillars from the SE camera.
- [ ] The source-scan vitest from I-KYPQ9-1 still passes over `HubScene.ts`: no
      `Bounce`/`Elastic`/`Back.`, no `.shake(`, no `explode(`.
- [ ] Grep: `HubScene.ts` no longer sets the `"pointer"` cursor on dialogue options, and
      `showQueueProgress` uses the `vellum` token.
- [ ] Diff review: no `sendMessage`/`SocketManager` change and no input binding change (§0.2).
- [ ] No `0x`/`#` colour literal in code this slice touches.
- [ ] `git diff -- game-server/` and `git status --porcelain -- game-server/` are empty.
- [ ] From `game-client/` with `export PATH=~/.nvm/versions/node/v22.13.1/bin:$PATH`:
      `npm test`, `npm run lint` and `npm run lint:fence` pass, and `npm run bake -- --check`
      exits 0 with no diff.
- [ ] Manual check (coordinator, against the Reference):
  - smoke rises under the light-map and darkens with dusk;
  - a chimney hides with its roof;
  - the cursor is the gauntlet;
  - the queue text is vellum;
  - returning from a run re-creates the hub with no duplicated or orphan emitters.

  Not a HITL gate.
- [ ] No commits.

## Blocked By

- I-KYPQ9-1: the effect table entry for smoke and the effects runtime.
- I-KYPQ9-3: the `chimney` sheet, and ownership of `HubScene.ts`.

## Spec Reference

FS-KYPQ9 §A.6 (chimneys and smoke), §A.9 (smoke skipped without the sheet), §H.3 (hub cursor),
§I (queue colour). Edge states "Hub scene re-created" and "Hub state arrives without walls".
User stories 4, 23, 24.

## TDD Approach

- RED: the smoke-emitter config test against the table (cap 10, 4000 ms, ≤ 1.6×, alpha ≤ 0.35,
  under the light-map). Then the chimney-spot determinism test.
- GREEN: write the smoke module and the chimney spot helper, then wire them into roof building
  and SHUTDOWN in `HubScene`.
