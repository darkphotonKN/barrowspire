---
id: I-1J1CB-15
status: in-progress
implements: FS-1J1CB
blocked_by: [I-1J1CB-14]
labels: [blocked]
title: "FS-1J1CB slice 15: Looks v2, mercenary: the Duelist's long-hilted curved blade, the Sellsword's broad falchion, the mercenary kit, through the contact sheet"
---
Implements FS-1J1CB §Change: Looks v2: more drastic, more different

**Lane: agent** (game-client bake). **HITL gate:** Kranti approves the mercenary contact sheet before
this closes. **Serial:** last of the four v2 rebakes. It starts once I-1J1CB-14's bake and manifest
are in. Runs in `.claude/worktrees/passive-tree-v2`.

Builds on I-1J1CB-7's baked Duelist and Sellsword (`mercLooks.js`). This slice's contact sheet
replaces I-1J1CB-7's open gate for those two looks.

## What to Build

**The mercenary kit (R68, R69):** `mercLooks.js` opens with the mercenary kit. It holds the shared
trims, buckles and wear, and the spec weapons: the long-hilted curved blade and the broad falchion,
each with a scabbard re-cut to it. `curvedSword` and `scabbard` stay in `gear.js`, because the base
uses them. If `mercLooks.js` passes about 400 lines, the kit moves to `mercKit.js` beside it (R69).

**Duelist (R49, R50, R60, R63):** the robe and half-cloak pushed further. He carries a long-hilted
curved single-edged blade: a wrapped grip about two fists long, a plain round iron guard, an even
shallow curve and a clean point. He swings it one-handed in the wide cut, with the butt clear of the
forearm. "Almost" samurai holds: no ornament.

**Sellsword (R49, R50, R61, R63):** the buff coat over black pushed further. He carries a broad
falchion: a heavy wide blade swelling to a clipped point, a plain cross and a longer grip, looking
two-handed but carried and swung one-handed. The coin purse stays.

**Holds (R62, R64–R67):** grip and hold re-keys go in a look style, never in `MERCENARY_STYLE`
(the parry included). The half-cloak stays on cloak bones. Tokens only. The guards and the 0.0222
floor hold, and `char_mercenary_base` and every other atlas keep their bytes.

**Guideline (R71):** the Mercenary line (the Duelist's long-hilted blade and the Sellsword's
falchion; the knuckle-bowed blade stays the base's) and the two mercenary bullets.

**Contact sheet (R70):** both looks beside the swordsman, every clip × 8 facings (the parry
included), ×2 per look, the dark-room strip and the outline strip.

## Acceptance Criteria

- [ ] The manifest carries `char_mercenary_duelist` and `char_mercenary_sellsword`, each alone in
      its group, at 1.5x, with every mercenary clip, `parry` included.
- [ ] A motion test: each blade's points stay clear of the head and the body on every pose, and the
      Duelist's hilt butt clears his forearm.
- [ ] The Duelist's half-cloak passes the cloak guard (R7 holds).
- [ ] Both looks pass the leg and cloak guards on every guarded pose of every clip; no new
      `KNOWN_CLIPPING` or `MIRRORED_LEGACY` entry.
- [ ] Both `n` idle backs are at or above 0.0222.
- [ ] `git diff --stat public/art/` lists only `mercenary_duelist-*`, `mercenary_sellsword-*` and
      `manifest.json`.
- [ ] `MERCENARY_STYLE` is unchanged; re-keys live in a look style.
- [ ] `mercLooks.js` (or `mercKit.js`) is a kit plus looks composed from it.
- [ ] No raw colour.
- [ ] The guideline carries the Mercenary, Duelist and Sellsword lines (R71).
- [ ] Kranti approved the mercenary contact sheet, outline strip included.
- [ ] `npm test` and `npm run lint` pass; `/code-review` run.

## Blocked By

I-1J1CB-14 (serial order: shared `cast.js`, `gear.js`, `classStyles.js` and manifest).

## Spec Reference

FS-1J1CB §Change: Looks v2: R49–R52, R53, R60–R61, R62, R63–R67, R68–R69, R70–R71, R72 (R7's and
R8's superseded blades), R73.

## Files expected to touch

- `game-client/tools/bake/page/characters/mercLooks.js` (the mercenary kit; both looks), or a new `mercKit.js`
- `game-client/tools/bake/page/characters/gear.js` (only if `scabbard` needs a blade-shape option)
- `game-client/tools/bake/page/characters/classStyles.js` (a mercenary look style, if a re-key is needed)
- `game-client/tools/bake/page/characters/fabrics.js` (mercenary look cloths, wear and seeds)
- `game-client/tools/bake/page/characters/mercLooks.test.mjs`, `classMotion.test.mjs`
- `game-client/public/art/mercenary_duelist-*.png`, `mercenary_sellsword-*.png`, `manifest.json`
- `game-client/docs/design-guideline.md` (Part I: Mercenary, Duelist, Sellsword)

## TDD Approach

- RED: the blade-clearance motion test against the kit's blades on `MERCENARY_STYLE`'s keys.
- GREEN: the kit's blades and scabbards, any look-style re-key, the bake.
