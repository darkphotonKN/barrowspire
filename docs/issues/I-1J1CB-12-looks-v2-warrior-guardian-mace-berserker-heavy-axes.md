---
id: I-1J1CB-12
status: done
implements: FS-1J1CB
blocked_by: []
labels: [ready-for-agent]
title: "FS-1J1CB slice 12: Looks v2, warrior: the Guardian's flanged mace and bigger shield, the Berserker's heavy long-hafted axes, the warrior kit and the outline strip, through the contact sheet"
---
Implements FS-1J1CB §Change: Looks v2: more drastic, more different

**Lane: agent** (game-client bake). **HITL gate:** Kranti approves the warrior contact sheet before
this closes. **Serial:** first of the four v2 rebakes (warrior → mage → archer → mercenary), because
`cast.js`, `gear.js`, `classStyles.js` and `manifest.json` are shared. Runs in the worktree
`.claude/worktrees/passive-tree-v2` (branch `feat/passive-tree-v2`).

Builds on I-1J1CB-4's baked Guardian and Berserker (`warriorLooks.js`). This slice's contact sheet
replaces I-1J1CB-4's open gate for those two looks.

## What to Build

**Shared tooling, first, because every class slice after this uses it:**

- **R51 outline figures:** a bake-side helper (e.g. `tools/bake/lib/outline.mjs`). For each look it
  takes the opaque masks of its idle frames and of its base's and sibling's, lays them on one anchor
  over `n`, `e`, `s`, `w`, and computes XOR over union. `bake.mjs` logs it beside the dark-room
  floor. It is logged, not gated.
- **R70 outline strip:** `lib/contact.mjs` gains a per-class outline strip: each look, its base and
  its sibling as black fills on one anchor at game scale, idle and strike key × 8 facings, with the
  R51 figures under it. It is written with the class's other review sheets.

**The warrior kit (R68, R69):** `warriorLooks.js` opens with the warrior kit. It holds the shared
trims (bindings, straps and buckles, rivet rows, wear settings) and the spec weapons: the flanged
mace and the heavy bearded axe, moved out of `gear.js` with `AXE_EDGE_TURN`. `kiteShield` stays in
`gear.js`, because the base uses it. The Guardian and the Berserker are composed from the kit.

**Guardian (R49, R50, R54, R63):** the great helm and surcoat pushed further, a flanged mace in place
of the longsword, the kite shield about 1.3x the knight's with its boss, counterchanged cross and
brass border, a guige strap, and layered trims and wear. He keeps the compact cut behind the raised
shield.

**Berserker (R49, R50, R55, R63):** the bare head, torn cloak and wraps pushed further. The axes are
heavier, with hafts about 0.47 H, a broader bit and a cord-wrapped grip to a pommel knob. Edges stay
forward and down in the carry and lead the swing in both hands' clips. The off-hand clips (R28) are
re-baked with the new axes.

**Holds (R62, R64, R65, R66, R67):** any grip or carry re-key goes in a look style (a Guardian style
if needed, `BERSERKER_STYLE`), never in `KNIGHT_STYLE`. Tokens only. Every clip passes the guards,
the `n` idle backs are at or above 0.0222, and `char_knight_base` and every other atlas keep their
bytes.

**Guideline (R71):** the *Specializations* clause rewording (this first slice), the Knight's v2 lines,
and the Guardian and Berserker bullets.

**Contact sheet (R70):** both looks beside the knight, every clip × 8 facings, ×2 per look, the
dark-room strip and the outline strip. List them in the hand-back and hold until Kranti approves;
tweaks he asks for are made here.

## Acceptance Criteria

- [ ] `outline.mjs` has a unit test: two identical masks give 0, two disjoint masks give 1, and a
      hand-built pair gives its hand-computed figure. The bake logs both warrior looks' figures
      against the knight and against each other.
- [ ] The contact tool writes the warrior outline strip.
- [ ] The manifest carries `char_knight_guardian` and `char_knight_berserker`, each alone in its
      group, at 1.5x, with every knight clip; the Berserker's also has its three off-hand clips.
- [ ] The Guardian holds a flanged mace (no longsword) and a shield about 1.3x. A motion test holds
      the mace head clear of the shield and the head on every pose.
- [ ] `axe.test.mjs` passes on the heavy axe: edge forward and down in the carry and leading at the
      strike, in the right-hand and off-hand clips.
- [ ] Both looks pass the leg and cloak guards on every guarded pose of every clip; no
      `KNOWN_CLIPPING` or `MIRRORED_LEGACY` entry.
- [ ] Both `n` idle backs are at or above the dark-room floor (0.0222).
- [ ] `git diff --stat public/art/` lists only `knight_guardian-*`, `knight_berserker-*` and
      `manifest.json`.
- [ ] `KNIGHT_STYLE` is unchanged; any re-key lives in a look style.
- [ ] `warriorLooks.js` is a kit plus looks composed from it; the heavy axe and the mace live in it.
- [ ] No raw colour.
- [ ] The guideline carries the *Specializations* rewording and the Knight, Guardian and Berserker
      lines (R71).
- [x] Kranti approved the warrior contact sheet, outline strip included. (Kranti, 2026-11-22: "warrior is good")
- [ ] `npm test` and `npm run lint` pass; `/code-review` run.

## Blocked By

None. It builds on I-1J1CB-4's code, already in the branch.

## Spec Reference

FS-1J1CB §Change: Looks v2: R49–R52 (the bar), R53–R55 and R62 (weapons), R63–R64 (detail),
R65–R67 (holds), R68–R69 (kit), R70–R71 (gate, guideline), R72 (R1's superseded values), R73.
Acceptance Criteria "The bake (each class)". ADR-0021, ADR-0076, ADR-0088.

## Files expected to touch

- `game-client/tools/bake/page/characters/warriorLooks.js` (the warrior kit; both looks)
- `game-client/tools/bake/page/characters/gear.js` (`beardedAxe`, `AXE_EDGE_TURN` move out; `kiteShield` size option)
- `game-client/tools/bake/page/characters/classStyles.js` (`BERSERKER_STYLE` re-key; a Guardian style if needed)
- `game-client/tools/bake/page/characters/clips.js` (the Berserker carry's wrist comment and constant, if the axe changes it)
- `game-client/tools/bake/page/characters/fabrics.js` (Guardian and Berserker cloths, wear and seeds)
- `game-client/tools/bake/page/characters/cast.js` (imports only, if the axe's home moves)
- `game-client/tools/bake/page/characters/axe.test.mjs`, `warriorLooks.test.mjs`, `classMotion.test.mjs`
- `game-client/tools/bake/lib/outline.mjs` (new) and `outline.test.mjs` (new)
- `game-client/tools/bake/lib/contact.mjs`, `game-client/tools/bake/bake.mjs` (outline strip and log)
- `game-client/public/art/knight_guardian-*.png`, `knight_berserker-*.png`, `manifest.json`
- `game-client/docs/design-guideline.md` (Part I: *Specializations*, Knight, Guardian, Berserker)

`manifest.json` is regenerated by the bake, never edited by hand.

## TDD Approach

- RED: `outline.test.mjs` on the hand-built masks; a motion test for the mace head clear of the
  shield, failing until the mace exists; `axe.test.mjs` re-pointed at the kit's heavy axe.
- GREEN: the helper, the kit's mace and heavy axe, the looks, the bake.
