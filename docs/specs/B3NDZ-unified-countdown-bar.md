# FS-B3NDZ: Unified countdown bar

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" (one countdown style across the canvas) → this FS · Related ADRs: none · Related: [FS-BJNYC](BJNYC-party-instance-entry.md) (the ready-check popup, R23–R26), [FS-R82NV](R82NV-party-formation.md) (the invite prompt, R14, R32, R33), [FS-NCC9J](NCC9J-party-membership-across-pods.md) (invite prompt in every world, R24), [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md) (the field fallen state, R58), [FS-BDA7X](BDA7X-character-leveling.md) (the XP bar whose look this borrows) · Art authority: [`game-client/docs/design-guideline.md`](../game-client/docs/design-guideline.md) "UI Chrome" → Countdowns

## Summary

Every countdown in the game canvas reads the same way: a thick bar along the bottom of its panel,
edge to edge, in the XP bar's bright brass, that drains smoothly from the right toward the left as
time runs out, with the whole seconds left in a larger number just above it. Today the ready check,
the party invite and the field's fallen state each show a small "12s" or a number inside a sentence;
after this they share one look, drawn by one shared piece, and any countdown added later uses it.

Asked by Nick, 2026-11-02: "倒數的方式幫我改成一個慢慢減少的bar在底部 不要太細 顏色用跟經驗值條類似的黃色
秒數還是要在可以大一點 所有倒數的樣式都統一用這個 組隊邀請也是", then "bar要滿版從右邊開始減少到左邊".

## Requirements

### The bar

1. **Placement.** A countdown's bar lies along the bottom of the panel or popup it belongs to:
   its left edge is the panel's left edge, its width is the panel's full width, and its bottom edge
   is the panel's bottom edge. It is never inset inside the panel's padding.
2. **Height.** The bar is **7 px** tall (`COUNTDOWN_BAR_H`). The panel grows by the bar's height,
   so the panel's existing content keeps its padding above the bar.
3. **Fill.** The fill is anchored at the bar's left edge; its width is the bar's width times the
   countdown's fraction (Requirement 6). As time runs out the right end recedes toward the left; at
   0 the bar shows track only. The width is not rounded to whole pixels.
4. **Smooth.** The bar is redrawn every frame the panel is shown, so it shrinks continuously, never
   in once-a-second steps. Its own graphics layer is redrawn per frame; the panel's texts redraw only
   when what they say changes.
5. **Colours.** The XP bar's: `palette.xpFill` (bright brass) on `palette.xpTrack` (charcoal), with
   the XP bar's brass rim (`palette.frame` at 0.6). Never amber: amber means interactable.

### The fraction

6. **Remaining over total**, clamped to 0..1. The total is the duration when that countdown began,
   never a hard-coded figure:
   - **Ready check:** the first `expires_in_ms` this client held for that `check_id`. Later
     `party_ready_check` messages for the same check keep it; a check with a new `check_id` takes
     its own first window. Remaining is the newest message's `expires_in_ms` less the time since it
     came, the same clock the seconds already use.
   - **Invite:** the invite's own window, `INVITE_TTL_MS`, from when this client heard it, on the
     store's clock (FS-R82NV R14: the prompt keeps its own clock).
   - **Fallen:** `FIELD_RISE_MS`, from the state that first reported the fall.
7. A total of 0 or less reads as an empty bar.

### The seconds

8. **The number stays.** The whole seconds left (as each countdown counts them today) are shown as
   `<n>s` in the body serif at **18 px** (`COUNTDOWN_SECONDS_PX`, up from 12 px), in vellum
   (`palette.hudText`).
9. **Near the bar.** On a popup with buttons, the number stands in the countdown's slot at the
   bottom left, in the row just above the bar, vertically centred on the buttons. On a panel with
   no buttons (the fallen state), it stands centred under the panel's line, just above the bar.

### Which countdowns

10. **Ready-check popup** (`src/ui/PartyReadyCheck.ts`, `partyReadyCheckLayout.ts`): bar and
    number per Requirements 1–9. The leader's status-only popup has them too.
11. **Invite prompt** (`src/ui/PartyInvitePrompt.ts`, `partyInvitePromptLayout.ts`): each stacked
    prompt carries its own bar and number. The taller prompt still stacks, steps aside of the open
    party panel and stays above the floor (FS-R82NV R32, FS-NCC9J R24).
12. **Field fallen state** (`src/scenes/fieldFallen.ts`, drawn by `FieldScene.ts`): a centred panel
    on the canvas, charcoal as today, with the line "You have fallen. You rise at the road home."
    (the number leaves the sentence for the shared seconds element), the number, and the bar. It
    still counts 3-2-1 and holds at 1 if the rise is late (FS-X2F2H R58), no result card, no loss
    copy.
13. **One shared piece.** The bar's rectangle, its fill and its drawing, and the seconds' words and
    size, live in one shared module (`src/ui/countdownBar.ts`) beside the XP bar's drawer. Every
    countdown above uses it.
14. **The rule for later.** Any countdown added to the game canvas uses the shared module and this
    look. The design guideline states it (UI Chrome → Countdowns).

## User Stories

1. As a party member, I want the ready check's time left as a bar draining along the popup's foot,
   so that I can tell at a glance how long I have without reading a number.
2. As a party member, I want the bar to drain smoothly, so that it feels like time passing rather
   than a ticking clock.
3. As a party member, I want the bar to drain from the right toward the left, so that it reads the
   same way the XP bar fills.
4. As a party member, I want the seconds left still shown, larger than before, so that I know the
   exact time when it matters.
5. As the party leader, I want my status-only ready-check popup to show the same bar, so that I can
   watch my party's time run out.
6. As a player invited to a party, I want each invite prompt to carry its own draining bar, so that
   I can tell which invite runs out first.
7. As a player with several invites stacked, I want the stack still to fit above the chat window,
   so that the bigger prompts do not cover it.
8. As a player in a field who has fallen, I want the wait before I rise shown as the same bar, so
   that every wait in the game reads alike.
9. As a player who has fallen, I want the 3-2-1 still counted in a large number, so that I know
   when I will stand again.
10. As a player, I want the bar in the XP bar's bright brass, so that it reads as progress and not
    as something to click.
11. As a player, I want the bar thick enough to read, so that I do not have to squint at a hairline.
12. As a player, I want the bar to run the panel's full width, so that it reads as the panel's foot
    rather than a widget inside it.
13. As a player whose ready check was re-sent after an answer, I want the bar to keep draining from
    where it was, so that a server update does not refill it.
14. As a player shown a new ready check, I want its bar to start full, so that a fresh check gives a
    fresh window.
15. As a player behind an overlay, I want the countdown to keep running underneath, so that closing
    the overlay shows the true time left.
16. As a developer adding a new countdown, I want one shared module to draw it, so that it looks like
    every other countdown without copying code.
17. As a designer, I want the look written in the design guideline, so that a later countdown cannot
    drift from it.

## Acceptance Criteria

- [ ] `countdownBarRect(panel)` returns `{ x: panel.x, y: panel.y + panel.height - 7, width:
      panel.width, height: 7 }`.
- [ ] `countdownBarFill(bar, fraction)` returns a rect anchored at `bar.x` whose width is
      `bar.width × fraction`, clamped to 0..`bar.width`, unrounded.
- [ ] `countdownFraction(remainingMs, totalMs)` is remaining over total clamped to 0..1, and 0 for a
      total of 0 or less.
- [ ] `drawCountdownBar` draws the track in `palette.xpTrack`, the fill in `palette.xpFill`, and the
      brass rim.
- [ ] The countdown number reads `<n>s` at 18 px in `palette.hudText`.
- [ ] The ready-check frame carries a `bar` that is `countdownBarRect(panel)`, and no content rect
      overlaps it.
- [ ] Each invite-prompt frame carries a `bar` that is `countdownBarRect(panel)`, no content rect
      (note included) overlaps it, and the stacking, panel-aside and floor tests still hold.
- [ ] The party store keeps a ready check's first `expires_in_ms` as its total across later messages
      for that `check_id`, and takes a new total for a new `check_id`.
- [ ] The party store answers a fraction for the held ready check and for each invite, on its own
      clock.
- [ ] The ready-check popup and the invite prompt redraw their bars every frame, with a fill that
      narrows from the right as the clock runs, and leave their texts alone between second ticks.
- [ ] `FallenCountdown` answers a fraction (1 at the fall, 0 at `FIELD_RISE_MS` and after), and none
      while standing.
- [ ] The field's fallen state is a panel with the line, the number and the bar along its foot,
      the bar narrowing each frame; it is taken down on rising and on release.
- [ ] No countdown in the game canvas is drawn outside the shared module.
- [ ] The design guideline carries a Countdowns rule pointing at this FS.

## Edge States

- **A later message with a larger window** than the check's first: the fraction clamps at 1.
- **A new `check_id` replaces the held one:** its total is its own first window; the bar starts full.
- **A check closed** (`started` / `cancelled`): the popup and its bar go with it.
- **Late rise:** the fallen number holds at 1 and the bar sits empty until the state stands the
  player up.
- **Hidden under an overlay:** the bar hides with its panel and the countdown keeps running; on
  return the bar shows the true fraction.
- **Stacked invites:** each prompt's bar runs on its own invite's clock. A prompt waiting its turn in
  the store keeps counting; when it shows, its bar shows what is left.
- **Expired invite:** removed by the store as today; its bar reached 0 first.
- **Corner studs and rim:** the bar is drawn over the carved panel's foot, its rim reading as part of
  the frame.

## Out of Scope

- The marketplace auction time-left (React, days and hours: `src/marketplace/*`,
  `src/components/bazaar/*`).
- Any change to server timing: the ready check's window, the invite's TTL, the fall's rise delay.
- HubScene changes: the popups keep their own `postupdate` registration.
- Monster or player health bars, the XP bar itself, and cast or channel bars (none exist today).
