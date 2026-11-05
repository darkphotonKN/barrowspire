---
id: I-ADR0057-5
status: done
implements: ADR-0057
blocked_by: [I-ADR0057-1, I-ADR0057-2, I-ADR0057-3, I-ADR0057-4]
labels: [blocked]
title: "ADR-0057 slice 5: Nick's browser check that the client on Phaser 4 looks and plays as on 3.90 (game-client)"
---
Implements ADR-0057 §Decision, §Consequences

**Lane: human (HITL).** Nick, in a real browser, on `feat/client-phaser-4` after slices 1–4.
No code unless the check finds something; a finding becomes a new issue or an escalation.

## What to Check

Compare against `main` (Phaser 3.90) side by side where you can.

## Acceptance Criteria

- [x] Render scale 1, 1.25, 1.5 (browser zoom or Windows scaling) and 2 (Retina / fullscreen):
      the hub and a run are crisp on a still frame; walking, no shimmer (FS-ZAJMH R4).
- [x] Indoors: the blackout covers the whole canvas to every edge, and lifts on leaving.
- [x] Silhouette: the player behind a roof shows the brass copy only where covered.
- [x] Light pools and torches look as on 3.90 (no hard rectangles, no additive map edge).
- [x] Chat: lines clip at the message area's top and bottom; scrolling, name clicks, fold work.
- [x] Accept or reject the chat clip's one remaining delta (I-ADR0057-3 `## Answer`, "Remaining
      delta"): at render scale 1.25 and 1.5 only, on the message area's top backing row under the
      tabs, a line's cut edge sits up to 26/255 darker than on 3.90 (3.90's multisampled stencil
      kept the tab row's and the clip's samples apart inside that px; Phaser 4 masks the resolved
      px). Every other edge row and column matches 3.90 within 3/255.
- [x] Accept or reject the letter body's and the heroes sidebar's clip delta at render scale
      1.25 (I-ADR0057-2 `## Answer`, "Shape masks, review fix round 2"). When the view width is
      odd, the letter body's left and right columns are let through at 7/8 and 1/8, where 3.90
      let them through wholly or not at all (up to 32/255). The sidebar's bottom corner px is up
      to 33/255 off. Every other edge of both clips matches 3.90 within 1/255 at 1, 1.25, 1.5
      and 2.
- [x] Accept or reject the hard edges of the round and floor masks (I-ADR0057-2 `## Answer`,
      "Shape masks, review fix round 2"). The bust portrait's round edge is hard at every render
      scale, where 3.90 smoothed it. Under the medallion's brass ring, 70–127 px are more than
      32/255 off, max 128. The blackout's under-floor dark has a hard edge along B's floor:
      389–779 px up to 128/255 off. It shows only where a wall px over the floor's edge is partly
      transparent. Neither can be made identical through the mask filter. In the probe, Phaser
      4.2's `Stencil` matched 3.90 exactly (max 0) for both, and for the letter and sidebar
      clips. Adopting it would amend ADR-0057's "every mask goes through `maskInView`": say
      whether to.
- [x] Accept or reject the sub-px size delta of quads (ADR-0057 §Consequences, I-ADR0057-1
      `## Answer`). Right and bottom edges sit up to 0.5 backing px from 3.90's, hard where 3.90
      blended them at 64/255 or 128/255: text at render scale 1.25 and 1.5, and 2x art of odd
      source size at 1, 1.25 and 1.5. Left and top edges land on 3.90's px.
- [x] Letter panel body scroll and its clip; bust portraits are round; main-menu sidebar cards
      clip at the sidebar.
- [x] Fullscreen in and out, and a window resize, keep all of the above.
- [x] 60 fps at render scale 2 in the hub and in a run (otherwise escalate).
- [x] The two upstream repros in I-ADR0057-2 read right to you; you decide whether to post them.

## Blocked By

I-ADR0057-1, I-ADR0057-2, I-ADR0057-3, I-ADR0057-4

## Spec Reference

ADR-0057 (charter bound "visuals and behaviour identical to 3.90"); FS-ZAJMH R4 and its
Acceptance Criteria (60 fps at render scale 2).

Passed by Nick in the browser on 2026-11-06, option A: no Stencil, and the listed deltas are accepted. The upstream repros have not been posted.
