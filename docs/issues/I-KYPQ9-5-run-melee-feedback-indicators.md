---
id: I-KYPQ9-5
status: done
implements: FS-KYPQ9
blocked_by: [I-KYPQ9-1, I-KYPQ9-2]
labels: [ready-for-agent]
title: "FS-KYPQ9 slice 5: run: warrior slash and charge, hit/death/escape feedback, entrance glow and baked cursors"
---
Implements FS-KYPQ9 §D, §G, §H.1, §H.2, §B.9, §C.4

**Run lane, first.** This slice can run in parallel with I-KYPQ9-3 and I-KYPQ9-4 (the hub lane).
It owns `BarrowspireScene.ts` until I-KYPQ9-6 takes over. It does not bake.

## Files owned

- `game-client/src/scenes/BarrowspireScene.ts`:
  - `playWarriorSlashEffect`, `playAttackEffect`, the dash streak and the on-send
    `setTint(palette.damage)`;
  - the HP-drop tint, the death clip complete and `playEscapeParticles` and its texture;
  - the entrance marker in `updateWalls`/`enterBuilding`/`exitBuilding`;
  - `setupCustomCursor` and the rival `pointerover`/`pointerout` swap;
  - `resetRun` and the SHUTDOWN/DESTROY effect teardown, wiring the runtime's `clearAll()` and
    `lightMap.clearTransient()` (§B.9, §C.4).
- `game-client/src/scenes/BarrowspireScene.test.ts`.
- `game-client/src/render/effects/sourceScan.test.ts`, taken over from I-KYPQ9-1 to turn its
  `explode(` todo live.
- New per-effect modules under `game-client/src/render/effects/`: `slash.ts`, `charge.ts`,
  `hit.ts`, `death.ts`, `escape.ts`, `entrance.ts` (or similar), plus their tests.
- **Direct imports only:** import `table.ts`, the runtime and each effect module by path. Do
  not create `src/render/effects/index.ts`.

**Not touched:** `HubScene.ts`, `tools/bake/**`, `public/art/**`, `src/render/effects/table.ts`
(read only), `src/render/lighting/**` (read only), `src/render/cursors/**` (read only),
`src/render/world/**` (read only), and the projectile code in `updateProjectiles` (I-KYPQ9-6).

## What to Build

1. **Slash** (§D.1). Signals: the warrior's `CastSkill {skill_id: "slash"}` send and the rival
   click `Attack` send.
   - `fx_slash` tinted `slateLight`/`vellumDark` lies on a world plane (`addWorldPlane`).
   - It sweeps toward the clamped target from the delver's world position and fades with
     `Quad.easeOut` over 220 ms.
   - Up to 4 `fx_dust` motes (`barrowBrown`) settle at the delver's feet.
   - It plays on send, as today.
   - `playWarriorSlashEffect` and `playAttackEffect` share one implementation, fed world
     positions.
   - The on-send `setTint(palette.damage)` on the clicked rival is removed.
2. **Charge** (§D.2). Signal: the `dash` send.
   - A low dust burst at the start: up to 8 motes, `barrowBrown`/`slate`, 450 ms, settling.
   - A faint drag trail along the charge direction on the ground plane, 350 ms.
   - The `0x8a929a`/`torchCore` streak goes.
   - Nothing predicts or marks where the charge lands.
3. **Hit** (§G.1). Signal: an HP drop on `current_player` or a rival.
   - A partial multiply tint, at most 50% toward `oxblood`, easing back to untinted with
     `Quad.easeOut` over 220 ms.
   - The tint is on the drawn character only, with no change to the world position, camera,
     `standAt` or `markerBase`.
   - It replaces the flat `setTint(palette.damage)`.
   - The untinted-white identity is a named constant with a comment (§0.7). It is built without
     a 6-digit hex literal (for example `Phaser.Display.Color.GetColor(255, 255, 255)`), so the
     hex grep stays empty.
   - The tween dies with the sprite and never sticks on a corpse.
4. **Death dust** (§G.2): when the baked death clip completes, up to 6 `fx_dust` motes
   (`barrowBrown`) settle at the feet over 600 ms.
5. **Escape** (§G.3). Signals: `current_player` becomes null, or a rival leaves
   `other_players`.
   - `fx_escape_column` (`vellum`/`vellumFaint`), up to 10 slow rising motes, and a transient
     `vellum` light (§C), all fading over 1000 ms.
   - The 30-particle radial burst and its texture are removed.
6. **Entrance marker** (§H.1): `fx_glow` tinted `amber` on a world plane at the same threshold.
   - Alpha breathes 0.55 ↔ 0.85, `Sine.easeInOut`, with a 2400 ms period.
   - Alpha yoyo only, no scale change, no arrow or outline.
   - Hide and show are unchanged.
7. **Run cursors** (§H.2): `setupCustomCursor` uses `cursorCss("cursor_gauntlet", "default")`
   and `cursorCss("cursor_strike", "crosshair")`.
   - The rival hover swap is unchanged.
   - The canvas pixel-art drawing and the comment citing the pixel-art rule are removed.
8. **Teardown** (§B.9, §C.4): `resetRun` and SHUTDOWN/DESTROY call the runtime's `clearAll()`
   and `lightMap.clearTransient()`. A rival leaving releases its owner's effects.

## Acceptance Criteria

- [ ] Vitests for each effect module, driven by the table:
  - slash: 220 ms, ≤ 4 motes, world-plane placement from world positions;
  - charge: ≤ 8 motes, 450/350 ms;
  - hit: peak tint ≤ 50% toward `oxblood`, 220 ms `Quad.easeOut`, ending untinted;
  - death: ≤ 6 motes, 600 ms;
  - escape: ≤ 10 motes, 1000 ms, a transient `vellum` light that is removed at the end;
  - entrance: alpha 0.55–0.85, 2400 ms `Sine.easeInOut`, yoyo on alpha only.
- [ ] Teardown vitest (or a `BarrowspireScene.test.ts` case): after `resetRun`, no tracked
      effect object or transient light remains.
- [ ] `src/render/effects/sourceScan.test.ts`: the `explode(` assertion over
      `BarrowspireScene.ts` that I-KYPQ9-1 left as `it.todo` is turned live and passes. The
      only violation was `emitter.explode(30)` in `playEscapeParticles` (L1792), which this
      slice removes.
- [ ] Grep: none of the replaced bodies (dash, escape, entrance marker, cursor) still contains a
      colour literal. `grep -nE '0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}' src/render/effects` is
      empty.
- [ ] Diff review: every `sendMessage`/`SocketManager` call and input binding is unchanged in
      action, payload and timing (§0.2). No collider or hit area is added (§0.4).
- [ ] `git diff -- game-server/` and `git status --porcelain -- game-server/` are empty.
- [ ] From `game-client/` with `export PATH=~/.nvm/versions/node/v22.13.1/bin:$PATH`:
      `npm test`, `npm run lint` and `npm run lint:fence` pass, and `npm run bake -- --check`
      exits 0 with no diff.
- [ ] Manual check in the run (preview on :3939, coordinator against the Reference):
  - slash, charge, hit, death dust, escape and the entrance glow each play on their signal;
  - nothing bounces, squashes, throws confetti, flashes white or shakes;
  - the cursors are baked and the click point is unchanged;
  - after `resetRun` and leaving the scene, the display list and the light-map source count
    are back to baseline.

  Not a HITL gate.
- [ ] No commits.

## Blocked By

- I-KYPQ9-1: the table, the runtime and transient lights.
- I-KYPQ9-2: the `fx_*` textures, the cursors and `cursorCss`.

## Spec Reference

FS-KYPQ9 §D.1–§D.2, §G.1–§G.3, §H.1–§H.2, §B.9, §C.4. Edge states: hit during the death
transition, hit on a rival leaving mid-tint, escape off-screen, rival disconnect, the browser
refusing the custom cursor, and SHUTDOWN with effects running. User stories 9, 10, 18, 19, 20,
21, 22, 25.

## TDD Approach

- RED: the hit-tint test (peak ≤ 50% toward `oxblood`, back to the identity after 220 ms) and
  the escape test (≤ 10 motes, light removed at 1000 ms) against stub modules.
- GREEN: implement each effect module over the runtime, then replace the scene bodies with thin
  hook calls.
- REFACTOR: fold `playAttackEffect` into the shared slash implementation.
