---
id: I-C4JWH-4
status: done
implements: FS-C4JWH
blocked_by: [I-C4JWH-1, I-C4JWH-2, I-C4JWH-3]
labels: []
title: "FS-C4JWH slice 4: decoded texture memory measured per scene, and the hub → fields → run round trip run clean, in a headless browser (game-client)"
---
Implements FS-C4JWH §F (Requirements 22–23), §Acceptance Criteria

**Lane: agent (AFK)**, against a local stack (dev server, gateway, game-service and what a solo
delve needs). If the stack cannot be brought up, say so and hand this to Nick rather than skip it.

## What to Build

No product code. In headless Chrome on our own dev server, with a test account:

1. On the main menu, in the hub, in gentle_meadows, in forlorn_forest and in a run, sum width ×
   height × 4 over the atlas textures in the texture manager (`art:<atlas>` keys, `atlasTextureKey`), and list which pages
   are present; also the total over all textures.
2. Run hub → gentle_meadows → hub → forlorn_forest → hub → run → hub. Record any thrown error, any
   console error, every `art:` warning, and whether the bar showed on each entry.
3. On local main 6812be5a (before this work) take the same per-scene figures, for the record.

Record the figures, the round trip's result, the account, commit and render scale in FS-C4JWH
§ Verification (the one FS section this slice writes). Keep the script in the session scratchpad.

## Files (expected)

- `docs/specs/C4JWH-scene-scoped-art-loading.md` (§ Verification only)

## Acceptance Criteria

- [x] Per scene, the atlas pages present are exactly the resident pages plus that scene's groups' pages.
- [x] Per scene, the measured decoded atlas memory is recorded next to FS-C4JWH §F's estimates, with main's 473.1 MB alongside.
- [x] The round trip throws nothing, logs no console error and no placeholder warning for a sheet that drew art on main; the bar showed on the entries that downloaded and not on the others.
- [x] A finding becomes a new issue or an escalation, not a silent fix here.

## Blocked By

I-C4JWH-1, I-C4JWH-2, I-C4JWH-3

## Spec Reference

FS-C4JWH §F R22–R23; user story 19.


## Result

Recorded in FS-C4JWH § Verification. On the branch (b6ed390b) the measured atlas memory is 200.3 MB
on the menus, 223.3 in the hub, 234.4 in gentle_meadows, 239.9 in forlorn_forest and 376.5 in a run,
against 473.1 MB in every scene on main 6812be5a. Each scene holds exactly the resident pages plus
its own; the round trip menu → hub → meadows → hub → forest → hub → run → hub → menu ran with no page
error, no console error (bar the dev server's favicon 404, on main too) and no `art:` warning; the bar
showed on every entry that downloaded and on no other. Account `phaser4-trial@example.test`, headless
Chrome at 1280 × 845, DPR 1, `next dev` on 4014. No finding needed a new issue.

Review fix round 1 (aa8257bc): the round trip rerun with the same figures, and a world switch while
the run downloads its boss (held back by `page.route`) passed: the run stopped, its boss downloads
aborted and never landed, the hub at exactly its set, no error. FS-C4JWH § Verification.

Review fix round 2 (45bbb89d): a run ending mid-download, both ways out (closing the settlement
record; Leave while it loads), passed with the hub at exactly its set and no error. FS-C4JWH
§ Verification.
