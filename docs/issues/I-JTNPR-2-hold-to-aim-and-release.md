---
id: I-JTNPR-2
status: done
implements: FS-JTNPR
blocked_by: []
labels: [ready-for-agent]
title: "FS-JTNPR slice 2: hold right-click to aim, release to fire Shadow Shot"
---
Implements FS-JTNPR §Requirements 8–17

**Author: agent**

## What to Build

The archer's right-click becomes a hold: press to aim, release to fire one `shadow_shot` cast.
Everything here is client presentation (ADR-0030); the only thing sent is the cast on a release
that is ready.

Today the right-button branch of the run scene's `pointerdown` handler
(`src/scenes/BarrowspireScene.ts`, the `CastSkill` sends) sends `triple_arrow` at once for an
archer. Replace the archer's case:

- **Press (R8).** Behind today's right-click guards (menu, satchel, resolved, equipment panel,
  spectating), an archer's right-press starts aiming and sends nothing. Warrior and mage are
  unchanged (R17).
- **Stand still (R9).** While aiming, `sendMovementIntent` sends nothing; a stride in progress gets
  one `move {vx: 0, vy: 0}`, the same way the ESC menu interrupts a stride. After the aim ends,
  keys still down resume the stride on the next frame.
- **Pivot (R10).** While aiming, the local archer shows its idle clip turned to the cursor's
  8-way facing every frame (`render/art/animationSelect.ts` / `render/art/character.ts`: an aim
  facing for the idle choice, or a `face` call on the animator; implementer's call). No new
  baked pose. Not broadcast.
- **Aim line (R11).** A thin line from the bow (the arrow's release point, `BOW_LIFT` high)
  toward the cursor, for the full 650 world px, projected like other world effects, coloured
  from a `BARROW` token. Faint until a release would fire, full once it would. Local only.
- **Ready (R12, R13).** A release fires only if held ≥ 0.3 s and ≥ 1.2 s have passed since the
  client last sent a Shadow Shot. Holding longer changes nothing. (Affordability joins this rule
  in I-JTNPR-4.)
- **Fire (R14).** A ready release sends exactly one
  `cast_skill {skill_id: "shadow_shot", target_x, target_y}` with the cursor's world point at
  release, and plays the release effect and the archer's attack clip aimed there. Until
  I-JTNPR-3 lands, the release effect is today's `playArrowRelease`.
- **Cancel (R15).** End the hold with nothing sent and the line removed on: a release that is
  not ready; the delver resolving; `leaveFloor`; the ESC menu or equipment panel opening;
  `resetRun` (scene teardown, disconnect); the right button released outside the canvas
  (Phaser's `pointerupoutside`); window `blur`. A cancel starts no cooldown.
- **Left-click (R16).** Ignored while aiming; unchanged otherwise.
- Nothing in the client sends `triple_arrow` or `multishot_arrow` any more.

Keep the hold's rules (ready / cancel / timing) in a small pure module the scene drives, so they
are unit-testable without Phaser; the scene owns input wiring and drawing.

**Ship with I-JTNPR-1.** Against today's server, `shadow_shot` is an unknown skill.

## Acceptance Criteria

- [ ] An archer's right-press sends nothing and starts aiming; warrior and mage right-click are
      unchanged.
- [ ] While aiming, no `move` is sent; a stride in progress gets exactly one stop.
- [ ] After a release or cancel with a movement key still down, the stride resumes without a
      re-press.
- [ ] While aiming, the archer's idle clip faces the cursor's 8-way direction and follows it.
- [ ] While aiming, the aim line runs 650 world px from the bow toward the cursor, faint until
      ready and full once ready.
- [ ] A release held ≥ 0.3 s and ≥ 1.2 s after the last sent shot sends exactly one
      `cast_skill {skill_id: "shadow_shot"}` with the cursor's world point, and plays the release
      effect and attack clip.
- [ ] A release under 0.3 s, or inside 1.2 s of the last sent shot, sends and plays nothing.
- [ ] Death/resolve, floor change, ESC menu, equipment panel, scene teardown, release outside the
      canvas and window blur each end a hold with nothing sent and no line left.
- [ ] Left-click during a hold sends nothing.
- [ ] No code sends `triple_arrow` or `multishot_arrow`.
- [ ] Unit tests cover the hold rules (tap, ready, cooldown, each cancel) and the scene sends.
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint` pass.

## Blocked By

None. Ships together with I-JTNPR-1.

## Spec Reference

FS-JTNPR §Requirements 8–17; §User Stories 1–5, 7–11, 16, 17, 19, 21; §Acceptance Criteria
"game-client" (all but the flight, card and affordability rows); §Edge States "Quick tap",
"Cooldown", "Died mid-hold", "Floor change mid-hold", "ESC menu or equipment panel mid-hold",
"Window blur, tab switch, release outside the canvas", "Disconnect mid-hold", "Spectating",
"Teammates". ADR-0030.

## Files expected

- `game-client/src/scenes/BarrowspireScene.ts` (right-button branch, `sendMovementIntent`,
  `leaveFloor`, `openMenu`, `resetRun`, pointer-up / blur wiring)
- `game-client/src/scenes/BarrowspireScene.test.ts`
- a new hold-rules module and its test, e.g. `game-client/src/scenes/shadowShotAim.ts` (+ `.test.ts`)
- a new aim-line drawing, e.g. `game-client/src/render/effects/aimLine.ts` (+ `.test.ts`)
- `game-client/src/render/art/animationSelect.ts` and/or `game-client/src/render/art/character.ts`
  (+ tests) for the idle facing toward the cursor

## TDD Approach

- RED: the hold module reports "cancel" for a release at 0.29 s and "fire" at 0.30 s; "cancel"
  for a ready-length hold inside 1.2 s of the last fire; a scene test that a right-press by an
  archer sends nothing and a ready release sends one `shadow_shot` cast.
- GREEN: the hold module and the archer branch.
- Then: movement suppression, pivot, aim line, each cancel trigger.
