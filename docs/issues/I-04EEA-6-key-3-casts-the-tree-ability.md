---
id: I-04EEA-6
status: open
implements: FS-04EEA
blocked_by: [I-04EEA-1, I-04EEA-3, I-04EEA-5, "FS-8RZ51 (whether the character holds its tree's tier-3 node, on the wire)", "FS-Q18Q3 (I-Q18Q3-2: the server sending current_player.tree_ability_cooldown and resource.tree_ability_cost; the client types already exist in gameState.ts)"]
labels: [blocked]
title: "FS-04EEA slice 6: key 3 casts Earthbreaker, Blink and Settle the Debt, and a blinking body jumps"
---
Implements FS-04EEA §G R35–R37, R39–R41, §H R50

**Author: agent**

## What to Build

A warrior, mage or mercenary who has their tree ability presses 3 and the client sends one
`cast_skill` for it. The archer's Arrow Rain aim is slice 7. The stun tell is slice 8 and the effects slice 9.

**Where it lives** (integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream). Key 3 and its `cast_skill` are world-play, so they stay in the
world scenes (ADR-0085 Decision 1; FS-04EEA §G "Where each piece lives"). Nothing in this slice
goes in `UIScene.ts` or a `ui/uiScene*` module, and no UiBridge request is added.

- `src/scenes/runActions.ts`: add a tree-ability action, key `THREE`, label `3` (R35).
- Bind it in `BarrowspireScene` and `FieldScene` as key 1 is bound in the run (the
  `keydown-${RUN_ACTIONS.drinkPotion.key}` handler): a key event read from `RUN_ACTIONS`, never an
  `addKey`/`JustDown` poll, because `UIScene.mountKeys` polls 1–3 for its menu rows. Guard it on
  the UI scene's reported state, `this.ui.ui.menuOpen`, `this.ui.ui.typing` and the gear overlay
  (`this.ui.ui.inventory`), and on `event.repeat`. Hand it to `PlayerCombat` (the run's own, the
  field's through `FieldCombat`). While the menu is open the UI scene's 3 picks its third row
  (ADR-0084 Decision 4), and the world sends nothing.
- `src/render/combat/playerCombat.ts`: a key-3 entry point that sends, once per press,
  `cast_skill {skill_id, target_x, target_y}` with the class's tree-ability id and the cursor's
  world point, when every R36 condition holds: in play, the scene's guard passed, the character
  holds the tree ability (FS-8RZ51's wire), off cooldown and affordable
  (`current_player.tree_ability_cooldown {remaining, total}` and `resource.tree_ability_cost`, typed
  in `src/types/gameState.ts` already; Settle the Debt's cost reads 1), and no Shadow Shot hold. Ignore
  `KeyboardEvent.repeat`. For Earthbreaker and Settle the Debt call `castSent` (R40); not for
  Blink. Leave a `look` hook per ability for slice 9 to fill (no-ops until then).
- A Shadow Shot hold ignores key 3 (R39).
- **The jump (R41).** A world-body rule, so in each world scene (ADR-0086 2.1): the run's own and
  other players' lerp (`BarrowspireScene`, the `lerpFactor` blocks), the field's (`POSITION_LERP`
  in `FieldScene`) and the town's (`POSITION_LERP` in `HubScene`). A player body (own or other)
  whose reported position moves more than 60 world px between two consecutive states is set to
  the new position at once instead of lerped. The camera follows as for any move.
- `src/ui/abilityCopy.ts`: each tree ability's name and line from FS-04EEA R50, keyed so FS-Q18Q3's
  tooltip can read them. Data only: FS-Q18Q3's key-3 square in the UI scene's HUD slot
  (`ui/uiSceneHud.ts`) gets them as typed data the world sends, never a function across the bridge
  (ADR-0086 Decision 3). Wiring that message is FS-Q18Q3's (I-Q18Q3-5, I-Q18Q3-7), not this slice's.

**Ship after I-04EEA-1, I-04EEA-3 and I-04EEA-5:** without I-04EEA-1 the server answers
`ErrUnknownSkill`; without a row, the id resolves to nothing while the effect has played.

## Acceptance Criteria

- [ ] Key 3 is bound from `runActions.ts`; no other file types `THREE` for this action.
- [ ] A warrior, mage or mercenary with the tree ability, off cooldown and affordable, pressing 3
      sends exactly one `cast_skill` with `earthbreaker`, `blink` or `settle_the_debt` and the
      cursor's world point.
- [ ] Nothing is sent when any R36 condition fails: resolved or spectating, a menu or panel open,
      the ability not held, on cooldown, unaffordable (a mercenary at 0 parry charges), a Shadow
      Shot hold in progress.
- [ ] Holding 3 sends once; auto-repeat events send nothing.
- [ ] With the UI scene's menu open (run or field), 3 picks the menu's third row and the world sends
      no cast; with chat typing or the gear overlay open, nothing is sent.
- [ ] `UIScene.ts` and `ui/uiScene*` gain no tree-ability binding or send.
- [ ] Earthbreaker and Settle the Debt call `castSent`; Blink does not.
- [ ] A body whose state position jumps 61 world px is drawn there on the next frame; one moving 40 px
      still glides.
- [ ] `abilityCopy.ts` holds the four names and lines.
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-04EEA-1 (the ids exist on the server), I-04EEA-3 and I-04EEA-5 (Blink and Settle the Debt have their rows, so a send never plays an effect for a cast that resolves to nothing). FS-8RZ51 (whether the character holds its tree's tier-3
node, on the wire). FS-Q18Q3 (the tree ability's cooldown and cost fields on the wire, and its
key-3 square).

## Spec Reference

FS-04EEA §G R35–R37, R39–R41, §H R50; §User Stories 2, 3, 8, 18, 24, 25, 27, 29; §Acceptance Criteria
"game-client" (key-3, gating, repeat, menu, jump, names rows); §Edge States "Tier-3 node not held",
"Client ships before the server", "Cooldown jitter", "Cast in the hub", "Settle the Debt at 0
charges".

## Files expected

- `game-client/src/scenes/runActions.ts`
- `game-client/src/render/combat/playerCombat.ts`
- `game-client/src/render/combat/playerCombat.test.ts`
- `game-client/src/scenes/BarrowspireScene.ts` (key-3 event beside key 1's; the jump rule in its lerp)
- `game-client/src/scenes/BarrowspireScene.test.ts`
- `game-client/src/scenes/fieldCombat.ts`
- `game-client/src/scenes/FieldScene.ts` (key-3 event; the jump rule)
- `game-client/src/scenes/FieldScene.test.ts`
- `game-client/src/scenes/HubScene.ts` (the jump rule only)
- `game-client/src/ui/abilityCopy.ts` (data only)
- Not `game-client/src/scenes/UIScene.ts` or `game-client/src/ui/uiScene*.ts` (integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)

## TDD Approach

- RED: `playerCombat.test.ts`, a mercenary with the tree ability and 2 parry charges presses 3:
  one `cast_skill {skill_id: "settle_the_debt"}`; with 0 charges, nothing; a repeat event,
  nothing.
- GREEN: the key-3 entry point and its gates.
