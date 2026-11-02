---
id: I-B3NDZ-1
status: in-progress
implements: FS-B3NDZ
blocked_by: []
labels: [ready-for-agent]
title: "FS-B3NDZ slice 1: the shared countdown bar, on the ready-check popup and the invite prompt (game-client)"
---
Implements FS-B3NDZ §Requirements 1–11, 13

**Lane: agent (AFK).** Nick (2026-11-02): "所有倒數的樣式都統一用這個 組隊邀請也是". No server change.

## What to Build

- A shared module `src/ui/countdownBar.ts`: the bar's rect from a panel rect (full width, 7 px,
  along the foot), the fill rect from a fraction (anchored left, unrounded), the fraction from
  remaining over total, the seconds' words (`<n>s`) and size (18 px), and `drawCountdownBar` in the
  XP bar's look.
- The party store keeps a ready check's total (its first `expires_in_ms` for that `check_id`) and
  answers a fraction for the held check and for each invite on its own clock.
- The ready-check frame and each invite-prompt frame carry a `bar`; the panels grow by the bar's
  height; the countdown number moves to 18 px in vellum.
- Both popups redraw their bar on their own graphics layer every `postupdate`; the texts still
  redraw only when a second ticks or the view changes.

## Acceptance Criteria

- [ ] `countdownBarRect`, `countdownBarFill`, `countdownFraction` behave per FS-B3NDZ §Acceptance
      Criteria.
- [ ] Ready-check and invite frames carry `bar = countdownBarRect(panel)`; no content rect overlaps
      it; invite stacking, panel-aside and floor tests still hold.
- [ ] The store's ready-check total survives later messages for the same `check_id` and resets for
      a new one; fractions for the check and each invite are answered on the store's clock.
- [ ] Both popups draw the bar in `palette.xpFill` on `palette.xpTrack`, its fill narrowing from
      the right frame by frame, and draw the seconds at 18 px.
- [ ] No HubScene change.
- [ ] `vitest` green; `tsc --noEmit` clean; lint fence passes.

## Blocked By

None

## Spec Reference

FS-B3NDZ §Requirements 1–11, 13; §User Stories 1–7, 10–16; §Acceptance Criteria (shared module,
ready-check frame, invite frames, store totals and fractions, per-frame redraw); §Edge States
(later larger window, new check_id, hidden under overlay, stacked invites).

## Files expected to touch (game-client/src)

- `ui/countdownBar.ts` (+ `ui/countdownBar.test.ts`): new
- `stores/partyStore.ts` (+ test): ready-check total, fractions
- `ui/partyReadyCheckLayout.ts`, `ui/PartyReadyCheck.ts` (+ tests)
- `ui/partyInvitePromptLayout.ts`, `ui/PartyInvitePrompt.ts` (+ tests)

## TDD Approach

- RED: `countdownBarRect({x:10,y:20,width:300,height:100})` is `{x:10,y:113,width:300,height:7}`;
  `countdownBarFill(bar, 0.25)` keeps `x` and is 75 wide; the store's ready fraction after a
  re-sent message keeps the first total; the popup's bar fill narrows between two frames.
- GREEN: the shared module, the store fields, the frames' `bar`, the popups' bar layer.

## Charter run (2026-11-02)

Built by a /develop child (TDD), two-axis review: ready to merge. Review fix: countdownFraction moved to utils. Browser check pending: the bar over the carved panel's foot and studs.
