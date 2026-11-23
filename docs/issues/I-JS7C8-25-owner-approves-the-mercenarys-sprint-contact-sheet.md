---
id: I-JS7C8-25
status: done
implements: FS-JS7C8
blocked_by: [I-JS7C8-24]
labels: []
title: "FS-JS7C8 slice 25: the owner approves the mercenary's sprint and trailing sword on the contact sheet, picks how his pace is held, or names a tune round (HITL)"
---
Implements FS-JS7C8 §Change: The mercenary's sprint and trailing sword (R95, R111; M8)

**Lane: human (HITL).** The owner's ADR-0021 §5 gate. No code unless the owner asks for a tune
round or picks pace option (b) or (c). A tune round stays inside the charter (M8): it reworks
I-JS7C8-21/23's values, re-bakes through I-JS7C8-24's steps, then returns here.

## What to Check

For `char_mercenary_base`, `char_mercenary_duelist` and `char_mercenary_sellsword`: the new run
beside `2018f786`'s, 8 facings, at game scale and ×2, the animated preview, and the ×4 sword
detail (the paths are recorded in I-JS7C8-24):

- The run reads like the archer's sprint: the trunk about 20° forward, the quicker, shorter
  stride, knee drive and heel kick.
- The sword trails behind: the arm back and nearly straight, the hand at the hip, the point
  hanging down behind him and clearly off the ground in every frame, swaying a little. The free
  arm pumps.
- The edge faces down (the arm turned about 150° between the shoulder and the forearm), and the
  forearm and the Duelist's sleeve do not read as wrung. *Fallback:* the edge left facing up, no
  arm twist.
- Nothing pokes through: the sword clear of the legs, the coat and robe skirts, the Duelist's
  half-cloak and the Sellsword's spaulder and purse.
- **The pace (R95, escalated):** (a) the shared keys at 16 fps, 196.58 measured, the feet sliding
  about 1.3%; (b) his run alone at about 15.79 fps; or (c) his own stride scale about 0.987.
- The free arm's front height against the chest bone, as recorded in I-JS7C8-23.
- The atlas and frame-box report (I-JS7C8-24).

## Acceptance Criteria

- [ ] The owner approves, in his words, recorded below with the date, and the pace option he
      picks.
- [ ] Or the owner names a tune: each round recorded, re-baked, returned here.
- [ ] A pick of (b) or (c) is recorded, R95's band is amended in the FS through write-a-spec, and
      the change is built through I-JS7C8-21's and I-JS7C8-24's steps.

## Blocked By

I-JS7C8-24

## Spec Reference

FS-JS7C8 §Change: The mercenary's sprint and trailing sword: M1, M8; R95, R111; *Escalated 2026-11-23*; the Acceptance Criteria's "HITL: The owner
approves"; Edge States "The arm's twist".

## Files it expects to touch

None (a tune round touches I-JS7C8-21/23/24's files).
