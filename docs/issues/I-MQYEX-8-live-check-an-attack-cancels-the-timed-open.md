---
id: I-MQYEX-8
status: open
implements: FS-MQYEX
blocked_by: [I-MQYEX-7]
labels: []
title: "FS-MQYEX slice 8: the owner's in-game check that an attack or cast cancels the timed open (HITL, Nick)"
---
Implements FS-MQYEX §Change: An attack cancels the timed open

**Lane: human (Nick).** Needs game-service restarted on the merged code; the client is unchanged.
One browser, one run (a mercenary for step 4).

## Steps

1. **An attack.** Reach for a shut chest with a monster in striking distance and attack it before
   the bar fills. Expected: the bar is gone, the chest stays shut, no notice.
2. **Reach again.** Stand still and reach for the same chest. Expected: the bar starts empty and,
   with no attack, the chest opens after about a second and a half.
3. **A cast.** Reach, then cast the class ability (or a tree ability) at empty ground. Expected: as
   step 1.
4. **The parry.** As a mercenary, reach, then parry. Expected: as step 1.
5. **On cooldown.** Attack, reach at once while the attack is still cooling down, and press attack
   again. Expected: the refused press leaves the bar running; one that goes off stops it.
6. **Nothing else.** Reach, then drink a potion. Expected: the bar keeps filling and the chest opens.
7. **Does it feel right?** Note whether stopping on every attack, the parry included, is what you
   wanted.

## Acceptance Criteria

- [ ] Steps 1–6 behave as written.
- [ ] Step 7's verdict is recorded here.

## Blocked By

I-MQYEX-7.

## Spec Reference

FS-MQYEX §Change: An attack cancels the timed open: Acceptance Criteria (Live check), B1–B3.
