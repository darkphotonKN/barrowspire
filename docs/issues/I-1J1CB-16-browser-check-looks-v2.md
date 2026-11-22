---
id: I-1J1CB-16
status: open
implements: FS-1J1CB
blocked_by: [I-1J1CB-12, I-1J1CB-13, I-1J1CB-14, I-1J1CB-15]
labels: [blocked]
title: "FS-1J1CB slice 16: browser check, Looks v2, all eight looks in town and a run with the memory re-measured (HITL, on Kranti's integration stack)"
---
Implements FS-1J1CB §Change: Looks v2: more drastic, more different

**HITL.** Kranti runs this on a temporary integration branch off main on his stack; agents never
start the backends. It needs level-20 characters with each specialization (the dev seed or the
tier-6 pick). It may run in one sitting with I-1J1CB-11 if both are open; record each separately.

## Steps

1. Town: one character of each of the eight specs, across browsers. Each figure reads as its spec
   at play size, apart from its base and its sibling. Each carries its v2 weapon: the Guardian's
   mace and big shield, the Berserker's long axes, the Spellwarden's staff, the Pyromancer's
   brazier rod, the Hunter's recurve, the Shadow Ranger's slim black bow and hooded quiver, the
   Duelist's long-hilted blade, the Sellsword's falchion.
2. Each attacks: the Guardian's mace stays clear of his shield; the Berserker alternates hands with
   edges leading; the Spellwarden's staff never sinks into the ground or her head; both archers'
   strings follow the draw.
3. Another player's look lands after its fetch: the base figure stands in, then the swap changes
   the weapon too, with no vanish.
4. A run on the darkest floor: every back reads.
5. Memory (R27, R67): with GPU memory read as FS-C4JWH § Verification does, record the town with
   all eight v2 looks fetched and a run with a party of four. Write the figures into the hand-back
   beside I-1J1CB-11's.

## Acceptance Criteria

- [ ] Steps 1–5 behave as written.
- [ ] The measured memory figures are recorded in the hand-back.

## Blocked By

I-1J1CB-12, I-1J1CB-13, I-1J1CB-14, I-1J1CB-15. Also the FS-E1ZDG wire and the FS-8RZ51 spend on
the integration branch.

## Spec Reference

FS-1J1CB §Change: Looks v2: Acceptance Criteria "Across the change"; R50, R54–R62, R65, R67.

## Files expected to touch

None (a check). Findings become fix issues on this FS.
