---
id: I-JS7C8-15
status: done
implements: FS-JS7C8
blocked_by: []
labels: [ready-for-agent]
title: "FS-JS7C8 slice 15: the client mirrors the pin and ignores attack clicks while it runs (game-client)"
---
Implements FS-JS7C8 §Change: Attacking pins the attacker (R61–R65)

## What to Build

A local mirror of the server's pin in `PlayerCombat` (`src/render/combat/playerCombat.ts`), the one
combat module both the run and the field use (`src/scenes/fieldCombat.ts` composes it). Nothing is
sent or received for it (D9).

- **Start** (R61): on every send of a pinning kind, start a fixed `ATTACK_PIN_MS` = 600 tracked pin
  on the port's clock: the targeted strike (`strike`), the primary casts (`slash`, `arrow`, `cut`
  whether drawn as the cut or the riposte, `fireball`), `triple_fireball`, and a fired
  `shadow_shot` release. Never on `dash` or `parry`. No worn attack speed (D17).
- **Ignore clicks** (R62): while it runs, `strike` and `cast` (primary or special, the warrior's
  dash included) return false and send and play nothing: no effect, attack clip, `castSent`,
  `abilityCast`, cooldown or lockout. The Mercenary's right-click still sends `parry`, gated by
  `parryRefused` alone.
- **The archer's hold** (R63): a right-press during the pin begins the hold as today; while the
  pin runs the hold is not ready (the aim line reads not ready) and a release ends it with nothing
  sent, as a release on cooldown does (`ShadowShotAim` in `src/scenes/shadowShotAim.ts`, or the
  gate in `PlayerCombat.releaseAim` and `aimFrame`; pick the narrower seam).
- **Reset** (R64): `reset()` clears it.
- **Nothing else** (R65): `animationSelect.ts`, `BarrowspireScene.ts`, `FieldScene.ts`,
  `HubScene.ts` and the ability card are unchanged.

## Acceptance Criteria

- [ ] After each pinning send (strike, slash, arrow, cut, riposte, fireball, triple_fireball, a
      fired Shadow Shot), `strike` and `cast` send and play nothing until 600 ms have passed, and
      work once they have.
- [ ] A dash send starts no tracked pin; a dash click during the pin sends nothing.
- [ ] A Mercenary's right-click during the pin sends `parry` and raises the stance tell.
- [ ] An archer's right-press during the pin begins the hold; a release during the pin sends
      nothing and ends the hold; a release after it (held long enough, off cooldown, affordable)
      fires.
- [ ] `reset()` clears the tracked pin.
- [ ] The tracked pin is 600 ms whatever gear is worn.
- [ ] `animationSelect.ts`, `BarrowspireScene.ts`, `FieldScene.ts` and `HubScene.ts` are not
      changed.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` green in
      `game-client`.

## Blocked By

None. Nothing crosses the wire, so this slice builds and tests on its own; against a server
without I-JS7C8-14 it only paces clicks to one per 600 ms.

## Spec Reference

FS-JS7C8 §Change: Attacking pins the attacker: D5, D6, D9–D12, D16, D17; Requirements 61–65; the
game-client Acceptance Criteria; Edge States "Worn attack speed", "Jitter", "Attacks paced by the
pin", "A Shadow Shot hold across the pin's end".

## Files it expects to touch

- `game-client/src/render/combat/playerCombat.ts` (the tracked pin, the gates, `reset`)
- `game-client/src/render/combat/playerCombat.test.ts`
- `game-client/src/scenes/shadowShotAim.ts` and its test, only if the release gate lives there

## TDD Approach

- RED: after a `primary` cast, a second `primary` cast at 300 ms on the fake port clock returns
  false and sends nothing (today the 250 ms cooldown lets it through); at 600 ms it sends.
- GREEN: a pinned flag set on each pinning send and cleared by `port.later(ATTACK_PIN_MS)`, checked
  in `strike` and `cast` after the parry branch; then the dash exemption, the hold's release gate
  and `reset`, each red first.
