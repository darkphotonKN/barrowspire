---
id: I-ZAJMH-3
status: in-progress
implements: FS-ZAJMH
blocked_by: [I-ZAJMH-2]
labels: [ready-for-agent]
title: "FS-ZAJMH slice 3: the canvas fills the page below the header and follows the window; HUD anchors to edges (game-client)"
---
Implements FS-ZAJMH §Requirements 7, 8, 9, 10, 11, 12, 13, 14, 16, 17

**Lane: agent (AFK), with a browser check at the end (Nick).** No server change.

## What to Build

- `/game` windowed layout: `Header` and `VerifyEmailBanner` stay; the game frame fills the
  viewport below them with no page scroll (R17). Replaces the `min-h-screen` wrapper in
  `src/app/game/page.tsx` and the `.treasure-hunt-*` frame CSS in `src/app/globals.css`.
- The canvas fills the game frame, scaling up or down proportionally (R9); the logical view is
  720 tall and 1080–1280 wide following the frame's shape (R7); bars only outside 3:2–16:9 (R8).
- Re-fit on window resize and DPR change, debounced (R10), in every scene, canvas menus included;
  camera bounds and follow stay correct after a re-fit (R11). Scenes created later read the current
  logical view on create.
- Every `setScrollFactor(0)` HUD widget is placed by an anchor (top-left / top-right / bottom-left /
  bottom-right / bottom-centre), keeping today's corner and offset; at logical width 1080 nothing
  moves (R12). On a logical-view change every widget re-lays out, open panels included (R13). HUD
  sizes stay in logical units (R14). The DOM chat input follows the chat window (R16).

Widgets: ProgressHud, ResourceHud, PotionHud, AbilityHud, ChatWindow (+ chatInputField),
GearOverlay, LetterPanel, PartyFrames, PartyPanel, PartyReadyCheck, PartyInvitePrompt
(+ partyInviteField), MailboxEnvelope, SettlementRecord, ContainerView, npcDialogue, bustPortrait,
menuPanel, utils/atmosphere; constructed in BarrowspireScene, HubScene, FieldScene.

## Acceptance Criteria

- [ ] `/game` windowed: header + banner visible, game frame fills the rest, no page scroll.
- [x] Logical view 720 tall at every fit; width 1080 at ≤3:2, 1280 at ≥16:9, in between follows the frame.
- [x] Bars only outside 3:2–16:9; below 1080×720 the canvas shrinks and stays fully visible.
- [x] Resize and DPR change re-fit within one debounce interval in hub, run, field and the canvas menus; follow and bounds hold.
- [x] At width 1080 every HUD widget is where it is today; at 1280 each keeps its offset from its anchor.
- [x] An open panel (gear, letter, settlement record, party panel, ready check, invite, container, NPC dialogue) re-lays out on re-fit.
- [x] HUD hit tests land at logical widths 1080 and 1280.
- [ ] DOM chat input stays over the chat window across re-fits.
- [ ] Browser check (Nick): drag-resize, Retina + external monitor; 60 fps at render scale 2 in hub and a run (below: escalate, charter default 14).
- [x] Tests pass.

## Blocked By

I-ZAJMH-2

## Spec Reference

FS-ZAJMH §C R7–R11, §D R12–R14, R16, §E R17; user stories 4, 6–13, 16, 17, 27.

## TDD Approach

- RED: viewport module — logical width for frame aspects 1.2, 1.5, 1.6, 16/9, 2.4 (→ 1080, 1080, 1152, 1280, 1280) and the bar sizes.
- GREEN: the fit; then an anchor-layout test for one widget at widths 1080 and 1280, then the rest.

## Watch for

- Hotspots: `BarrowspireScene.ts`, `HubScene.ts`, `FieldScene.ts` (HUD construction), and the viewport module from I-ZAJMH-2.
- Fullscreen-button room in the frame's top-right (I-ZAJMH-4): if a top-right widget would sit under a corner button, report it.
