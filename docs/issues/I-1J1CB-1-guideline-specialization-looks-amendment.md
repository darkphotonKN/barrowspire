---
id: I-1J1CB-1
status: open
implements: FS-1J1CB
blocked_by: []
labels: [ready-for-agent]
title: "FS-1J1CB slice 1: the design guideline states the eight spec looks, off-hand clips, the dark-room floor, umbra and fire for the looks, and auras (game-client docs)"
---
Implements FS-1J1CB §G (Requirements 45–46)

**Lane: agent** (game-client docs). A rule change, flagged in FS-1J1CB's hand-back: the looks bend
the knight's "mail, never plate" nasal helm and longsword-and-shield, the archer's cowl and green,
the mage's teal scapular, the mercenary's madder coat, umbra's "Shadow Shot and nothing else",
fire's "effects only", and the shimmer's "not a lasting buff display". I-X2F2H-7 is the precedent
for the shape.

## What to Build

In `game-client/docs/design-guideline.md` Part I only, each change attributed *(Amended at the
owner's pick, 2026-11-21, FS-1J1CB.)*:

1. *Characters / Enemies*: a **Specializations** bullet after the four class bullets: a spec
   re-dresses its class on the same rig, build, clips and scale, and the class still reads at a
   glance; the eight looks as FS-1J1CB §A states them, a sentence or two each.
2. **Knight**: mail and the nasal helm stay the warrior's; the Guardian wears the flat-topped great
   helm, a bone surcoat with the house cross and a larger counterchanged kite shield; the Berserker
   goes unhelmed with the coif down, a bearded axe in each hand (edge forward), no shield.
3. **Archer**: the cowl and the Nightwood green are the archer's and the Shadow Ranger's (dyed to
   soot-black, lifted so the back reads); the Hunter wears a wolf pelt and hide, no hood, no green.
4. **Mage**: a spec's focus may be about 1.5x the sceptre, still no staff; the Spellwarden's iron
   spaulders and gorget; the Pyromancer's scapular is scorched oxblood, her hem singed with embers.
5. **Mercenary**: the Duelist's wrapped robe and off-shoulder half-cloak (a half-cloak is not the
   archer's hood and cloak); the Sellsword's madder dyed black under a buff coat.
6. With the attack rules: a dual-wielder's off-hand attack is baked from the mirrored keys, never
   flipped at runtime (FS-1J1CB §D R28).
7. Beside the archer's dark-room note or under *Legs stay inside the garment*: the dark-room floor
   (FS-1J1CB §B R10): no figure's back reads darker than the darkest approved class's back.
8. *Palette*: umbra is the Shadow Shot **and the Shadow Ranger's gloom** (and the whisper text
   exception); fire's ramp may also be baked into the Pyromancer as embers and her focus's flame,
   never marking an interactable.
9. *Shimmers*: an **Auras** subsection after the item-glitter paragraph: a quiet loop on a body for
   a held specialization, not a shimmer, so the 1200 ms cap does not govern it; the ward and the
   gloom as FS-1J1CB §E states them; no light, drawn under the light-map, stopped while the body is
   dead, still under reduced motion.

If a later contact-sheet round changes a look, the bake slice that changed it updates its bullet.

## Acceptance Criteria

- [ ] Part I carries items 1–9, each attributed as above.
- [ ] The amended bullets agree with FS-1J1CB §A, §D, §E and R10.
- [ ] Part II (web UI) is unchanged.
- [ ] `npm run lint:fence` stays green (no hex added outside the palette table).

## Blocked By

None.

## Spec Reference

FS-1J1CB §G R45–R46; §A R1–R8, §B R10, §D R28, §E R31–R36; User Story 29.

## Files expected to touch

- `game-client/docs/design-guideline.md` (Part I: *Characters / Enemies*, *Palette*, *Shimmers*)

## TDD Approach

Not applicable (documentation).
