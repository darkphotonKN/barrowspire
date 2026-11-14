---
id: I-QPDKN-14
status: open
implements: FS-QPDKN
blocked_by: []
labels: [ready-for-agent]
title: "FS-QPDKN party death flow, slice 3: the own Health and resource bars stay up, frozen, out of the delve"
---
Implements FS-QPDKN §Change: The party death flow and the spectate switcher (R168)

**Lane: AFK (agent), game-client only.** TDD; full vitest, `tsc --noEmit`, `npm run lint`, `npm run lint:fence`
at the end.

## What to Build

In the run, the first state that shows the player dead or escaped fixes their own bars and the potion cell
beside them as that state draws them; they stand so, whatever later states or a watched teammate say, until
the scene stops. The level bar, the ability card, the controls badge and a field's bars are unchanged.

## Acceptance Criteria

- [ ] A death: Health at 0 and the resource as it was stay up, frozen, with the potion cell.
- [ ] An escape: frozen the same way; a state without the player's own keeps them.
- [ ] Watching a teammate changes nothing of them; the ability card stays down; a field's bars as today.
- [ ] vitest, tsc, lint and the fence pass.

## Blocked By

None.
