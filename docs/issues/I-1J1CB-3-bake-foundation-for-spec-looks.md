---
id: I-1J1CB-3
status: done
implements: FS-1J1CB
blocked_by: []
labels: [ready-for-agent]
title: "FS-1J1CB slice 3: the bake takes a look on each class builder, holds every look to the dark-room floor, and shoots a look's contact sheet beside its base"
---
Implements FS-1J1CB §B (Requirements 9, 10, 12, 13, 15)

**Lane: agent** (game-client bake tooling). The foundation the four class slices (I-1J1CB-4 … 7)
build on. Bakes no new sheet.

## What to Build

- **A look argument on each class builder** (R9): `knight(look)`, `wizard(look)`, `archer(look)`,
  `mercenary(look)` in `tools/bake/page/characters/cast.js`, each taking an optional look object
  whose keys swap or add pieces (head, over-garment, cloak options and material, weapon(s),
  shield, cloth tones, omitted pieces, extra gear). No look, or `{}`, builds today's figure
  exactly. The variants worktrees' `cast.js` diffs show one shape per class; port the hooks, not
  the looks. Leave the looks themselves to the class slices.
- **The cast pattern for spec sheets** (R15): a helper for a spec `CAST` row
  (`sheet: char_<base>_<spec>`, `group: <base>_<spec>`, the class's sheet options, `trim`, 1.5x)
  so each class slice adds two rows and nothing else.
- **The dark-room floor test** (R10): a bake test (`tools/bake/lib/` beside `mean.mjs`, run by
  `npm test`) that, for every `char_<base>_<spec>` sheet in `public/art/manifest.json`, computes
  the mean luminance of the opaque pixels of its `n` idle frame(s) and holds it at or above the
  darkest of the four base class sheets' own. Vacuous until a look is baked.
- **The review sheet** (R12): extend `tools/bake/lib/contact.mjs` (or its driver) to shoot a look's
  sheet beside its base class, every clip × 8 directions at game scale, plus a dark-room strip:
  each look's back-facing frames over the run's darkest floor tone under the run's ambient.
  Output to `tools/bake/review/`.
- Nothing is copied from the variants worktrees into git as-is (R13); they are throwaway.

## Acceptance Criteria

- [ ] A bake of today's cast with this change produces byte-identical class sheets (or a manifest
      diff limited to provenance).
- [ ] Each class builder accepts a look; `{}` equals no look.
- [ ] The spec-row helper produces R15's sheet and group names.
- [ ] The dark-room test runs in `npm test`, passes with no look baked, and fails on a fixture
      sheet whose back is darker than the floor.
- [ ] The review tool writes a look-beside-base contact sheet and a dark-room strip for a given
      look sheet.
- [ ] `npm test`, `npm run lint` pass.

## Blocked By

None.

## Spec Reference

FS-1J1CB §B R9, R10, R12, R13, R15; §Acceptance Criteria "The bake" (base sheets unchanged,
dark-room test). User Stories 26, 30. ADR-0021, ADR-0076.

## Files expected to touch

- `game-client/tools/bake/page/characters/cast.js` (builder signatures, spec-row helper)
- `game-client/tools/bake/page/characters/classStyles.js` (only if a style needs to be passed in)
- `game-client/tools/bake/lib/darkRoom.mjs` (new, + `darkRoom.test.mjs`)
- `game-client/tools/bake/lib/contact.mjs` (+ test)

## TDD Approach

- RED: `darkRoom.test.mjs`: a fixture manifest with a base sheet at mean luminance 0.10 and a look
  at 0.08 fails, naming the look; at 0.11 passes.
- GREEN: the luminance measure over the `n` idle frame's opaque px and the floor rule.
