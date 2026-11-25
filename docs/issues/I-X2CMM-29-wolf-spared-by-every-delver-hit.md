---
id: I-X2CMM-29
status: done
implements: FS-X2CMM
blocked_by: []
labels: [ready-for-agent]
title: FS-X2CMM slice 29: no delver-side or ally hit lands on the wolf, a test per source
---
Implements FS-X2CMM §Change: The archer's wolf (W3–W5)

## What to Build
In game-service, one rule at the one hit gate: `CanHit` (systems/combat.go) refuses any hit whose
source is a delver or a hired ally (or anything they made) when the target is a hound, whatever
the player-damage setting. Today `sparesHound` (systems/book_hound.go) only spares hits carrying
`AttackerMemberID`; audit every damage path into `applyHit` and every snapshot a delver- or
ally-made effect builds (projectiles, burning trail, rain volleys, rune, kickers, reflect, split
arrows, shadow, hired ally strikes) and make the source recognisable at the gate (e.g. a snapshot
field set where it is built, or one predicate over the snapshot), so W3 holds by one rule. Monster
strikes and shots still hit; `StruckByArea` stays as it is (W4). Traps unchanged.

## Acceptance Criteria
- [ ] A test per W3 source (FS acceptance list) shows the wolf's health unchanged and no stun.
- [ ] A monster strike and a monster shot still hurt it; a monster area still passes it by.
- [ ] The rule holds with player damage on.
- [ ] `make test` and `make check` green in game-service.

## Blocked By
None

## Spec Reference
FS-X2CMM §Change: The archer's wolf W3–W5, its game-service Acceptance Criteria and Edge States.
