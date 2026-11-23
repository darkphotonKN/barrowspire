---
id: I-8RZ51-24
status: open
implements: FS-8RZ51
blocked_by: [I-8RZ51-22, I-8RZ51-23]
labels: [blocked]
title: "FS-8RZ51 slice 24: browser check, open nodes bronze and held nodes coloured and glowing in the real tree (HITL)"
---
Implements FS-8RZ51 §Change: A lit node glows in its own colour, §Acceptance Criteria (browser check), §Edge States

**HITL.** Kranti, in the game on the merged client; agents never start the backends. Client only:
no server or migration step.

## Steps

1. **The tree at rest.** In town, at 1280×720, P opens the tree for a character holding some
   ranks. Check that:
   - held and max nodes show their picture in their colour with a soft glow inside the plate;
   - open nodes (a point to spend) are plain bronze, dimmer;
   - closed and locked nodes are grey, the lock mark as before.
2. **A spend.** Spend an open node: it turns from bronze to its colour and glows at once.
3. **Colours by meaning.** A mage's held Vitality is red; a held Searing is ember; a held Deep
   Well is the mana bar's blue-green. Nothing held is amber or ally green.
4. **Hover.** Hover a lit node: the ring shows, the picture does not change.
5. **No points left.** With every point spent, open nodes go grey and only held nodes keep colour.
6. **Scale.** At a window giving render scale 1, every colour still reads apart from its neighbours.
7. **Outside town.** In a run, the tree shows the same colours, viewing only.
8. **Untouched.** The ability bar and the corner row's Tree icon are bronze as before.

## Blocked By

I-8RZ51-22, I-8RZ51-23 (the colours approved on the review page first).

## Spec Reference

FS-8RZ51 §Change: A lit node glows in its own colour §Acceptance Criteria ("Review and check"), §Edge States. User stories 1–12.
