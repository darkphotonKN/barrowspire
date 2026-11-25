---
id: I-X2CMM-28
status: done
implements: FS-X2CMM
blocked_by: ["I-X2CMM-26", "I-X2CMM-27"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 28: wave-2 review fix round 2 (the hound's ring through bookEffect, StruckByArea, records caught up)"
---
Implements FS-X2CMM §I R47, §J R51, R58; ADR-0098

**Author: agent**

## What to Build

Fixes from the re-review of fix round 1 (`cf98c2a3...` I-X2CMM-26/27). The last round.

1. **The hound's ring reads a pigment directly (MED, ADR-0098).** `hounds.ts` `paintRing` read
   `palette.bookPigment.verdigris`; ADR-0098 has a world effect read its row of `palette.bookEffect`
   only. Add `bookEffect.houndRing` and read it; add a test that names the files allowed to read
   `palette.bookPigment` (the roundel renderer and its contact sheet), so a direct reader cannot creep
   back.
2. **The hound's area exemption is inline (LOW, OCP).** `huntedHit` tested `kind == BodyHound`; add a
   `BodyKind.StruckByArea()` predicate beside `Hunted()` and use it.
3. **Records lag the round-1 behaviour (LOW, spec).** FS-X2CMM "Reconciled at wave 2" (R51's set-down
   onto the bank the pit reaches; R58's plate down to the hound's archer) and game-service `CONTEXT.md`
   "Afloat".

Left as follow-ups: `farHandWorks` repeating Far Hand's target kinds in the session (defence in depth,
on purpose); `AdvanceCasts`'s five parameters; a hired ally first on a plate waking the ambush on itself
(FS-4EC7Z's).

## Acceptance Criteria

- [x] "who reads the book pigments (ADR-0098)" (`bookPigmentReaders.test.ts`) red on the old line, green on the fix.
- [x] `TestBodyKind_StruckByArea`; the area-ability hound tests still green.
- [x] Records updated.
- [x] Suites green.

## Blocked By

I-X2CMM-26, I-X2CMM-27

## Spec Reference

FS-X2CMM §I R47, §J R51, R58, "Reconciled at wave 2"; ADR-0098
