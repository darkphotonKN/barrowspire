---
id: I-JS7C8-31
status: done
implements: FS-JS7C8
blocked_by: [I-JS7C8-30]
labels: []
title: "FS-JS7C8 slice 31: the owner approves the wizard's sprint and pointed cast on the contact sheet, or names a tune round (HITL)"
---
Implements FS-JS7C8 §Change: The wizard's sprint and pointed cast (R134; W6)

**Lane: human (HITL).** The owner's ADR-0021 §5 gate. No code unless the owner asks for a tune
round. A tune round stays inside this change: it reworks I-JS7C8-27's or I-JS7C8-29's values,
re-bakes through I-JS7C8-30's steps, then returns here. **Nothing waits on this issue** (W6): the
browser check (I-JS7C8-32) and the charter's next item (the knight) go ahead.

## What to Check

For `char_wizard_base`, `char_wizard_spellwarden` and `char_wizard_pyromancer`: the new run and the
new cast beside `22cabd3a`'s, 8 facings, at game scale and ×2, the animated preview, and the ×4
details (the paths are recorded in I-JS7C8-30):

- The run reads like the archer's and the mercenary's sprint: the trunk about 20° forward, the
  quicker, shorter stride. Her knee drive and heel kick are today's, not the sprint's (E1 option
  (a)); the gown hides most of them.
- Her carry under the lean: the sceptre hand lower (peak about 0.57 H), the sceptre leaning up to
  about 40° off vertical, the tome hand at the front a little under the chest.
- The cast: at the strike the arm reaches toward the target and the staff or focus points along
  the aim, chest to shoulder high, never over her head; the wind-up and the follow-through read as
  before. The Pyromancer's flame stands upright out of the level cage.
- Nothing pokes through: no leg through the gown or the scapular, the focus clear of her sleeve.
- The frame box and atlas report, and the E2 option the bake met (I-JS7C8-30).

## Acceptance Criteria

- [ ] The owner approves, in his words, recorded below with the date.
- [ ] Or the owner names a tune: each round recorded, re-baked, returned here.

## Blocked By

I-JS7C8-30

## Spec Reference

FS-JS7C8 §Change: The wizard's sprint and pointed cast: W6; E1, E2; R123, R125, R129, R134; the
Acceptance Criteria's "HITL: The owner approves".

## Files it expects to touch

None (a tune round touches I-JS7C8-27/29/30's files).
