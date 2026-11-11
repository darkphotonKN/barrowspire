---
id: I-MQYEX-6
status: open
implements: FS-MQYEX
blocked_by: [I-MQYEX-1, I-MQYEX-2, I-MQYEX-3, I-MQYEX-4, I-MQYEX-5]
labels: [blocked]
title: "FS-MQYEX slice 6: live check — the timed open in a run, two browsers (HITL, Nick)"
---
Implements FS-MQYEX §Acceptance Criteria (live check)

**Lane: human (Nick).** Needs game-service restarted on the merged code and the client rebuilt.
Two browsers, two accounts, one party in one run.

## Steps

1. **The wait and the bar.** Reach for a shut chest in an ordinary room. Expected: a brass bar
   fills over the chest for about a second and a half, then the coffer opens. No notice.
2. **Walking off.** Reach, then step away before it fills. Expected: the bar is gone, the chest
   is shut, nothing is said. Reach again: the bar starts empty.
3. **A hit.** Reach with a monster in striking distance. Expected: the hit removes the bar and
   the chest stays shut.
4. **Two at one chest.** Both players reach for the same shut chest a moment apart. Expected:
   each sees only their own bar; when the first finishes, both coffers open with the same items.
5. **One is interrupted.** Both reach; one is hit or steps away and then stands still. Expected:
   the other finishes; the interrupted player's coffer does not pop open; pressing E opens it at
   once.
6. **A guarded chest.** In a treasure room or pack hall with a guard alive: "It will not open."
   at once and no bar. Kill every guard and reach: the bar runs and the chest opens.
7. **A sack.** As a chest (step 1).
8. **No wait elsewhere.** A slain monster's drop pile, a chest already open, and a chest in a
   field world each open at once, with no bar.
9. **Does it feel right?** Circle a pack and try to steal an ordinary room's chest, as in the
   2026-11-11 playtest. Note whether 1.5 s is enough; changing it is `Tunes FS-MQYEX`.

## Acceptance Criteria

- [ ] Steps 1–8 behave as written.
- [ ] Step 9's verdict is recorded here (keep 1.5 s, or the new value).

## Blocked By

I-MQYEX-1, I-MQYEX-2, I-MQYEX-3, I-MQYEX-4, I-MQYEX-5.

## Spec Reference

FS-MQYEX §Acceptance Criteria (Live check), Decision D15 (the tunable).
