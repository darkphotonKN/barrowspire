---
id: I-TQZ5J-7
status: done
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-4]
labels: [ready-for-agent]
title: "FS-TQZ5J A2: the town's NPC dialogue card moves into the UI scene, as typed data the world hands it and an id it hands back"
---
Implements FS-TQZ5J §Amendment A2 (R28–R32, R35)

**Lane: AFK (agent).** game-client only. No behaviour or look change: the card draws, answers and
closes as today, over the corner row again.

## What to Build

- The interface carries the dialogue as plain data (R29): `showDialogue({ speaker, text, options })`
  and `closeDialogue` from the town; `pickDialogue` with an option's id back (R30). `speaker` is the
  name, role and portrait (texture key and frame); each option `{ id, label, register, enabled }`.
  No callback crosses (ADR-0081).
- The UI scene's dialogue slot draws the card with `showDialogueCard` at the popup band (2000), with
  today's key hints, dimming and relayout; a card with the same speaker, text and option ids
  retones in place, any other replaces it (R29).
- Its keys (R31): E, Enter, 1–3 and Esc are the UI scene's while a card is shown, read as the menu's
  are (I-TQZ5J-4's key reading); the town's E, Enter and 1–3 handlers stay guarded by its dialogue.
  Esc is `close: dialogue` (R17), already the UI scene's after I-TQZ5J-4.
- The town keeps the dialogue's rules (`delveChoices`, `telling`, `residentLine`, `NPC_DIALOGUE`,
  the pendings) and acts on the id picked; it sends the card again on any change (a reply awaited,
  a page turned, its pendings answered) and closes it as today (the gate, a pick, Esc, leaving).
- Slice 3's every-icon hold under a dialogue (`UiCornerRow.heldNow`) gives way to depth: the card's
  rows over the row as at 74ecdf3c, the town still refusing Party (R14, R32).
- The menu yields to a card (R20); the card closes as its world leaves, no sound.

## Acceptance Criteria

- [ ] A2's dialogue criteria: its owners' criteria hold (FS-29KSH R24, FS-NSV3D, FS-0XMCP's door,
      FS-B0H2D R27, FS-BJNYC R20–R22), tests moved with the code; the town no longer calls
      `showDialogueCard`; the messages are plain data.
- [ ] Keys: E, Enter, 1–3, Esc on an open card as today, never acted on by both the card and the
      town, in the first world after a page load and after a world switch (FS-TQZ5J § Spike (b)).
- [ ] Before/after screenshots (R23) against 74ecdf3c, extending the git-ignored harness
      `game-client/tmp/ui-scene-corner/`: the door's card (three ways; one dimmed; its refusal line),
      a page of the Elder's telling, a resident's card; idle and each row hovered; the row under the
      card (each icon hovered); at render scale 1, 1.5 and 2, windowed and fullscreen. Pixel-equal,
      or each difference named for I-TQZ5J-5. The corner row's 119 and I-TQZ5J-4's menu set stay
      pixel-equal.
- [ ] The depth cases of R35 for the card screenshotted and named.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-TQZ5J-4: the card joins the menu in the popup band (2000) and on the UI scene's Esc step and key
reading, which that slice builds. Touches `HubScene` as I-TQZ5J-8 does; if both run at once, the
later one rebases.

## Spec Reference

FS-TQZ5J §Amendment A2 (R28–R32, R35, its acceptance criteria and edge states); R11, R17, R20, R21,
R23, R24; Amendment A1 (its pointer rules hold for the card).

## TDD Approach

- RED: over a fake bridge, a `showDialogue` with three options, the second disabled, draws three rows
  with `[1]`–`[3]` and the second dimmed; a press on the first sends `pickDialogue: solo` and none
  for the dimmed one; the same card again with the second enabled retones without replacing; a card
  with another text replaces it; 2 with a card shown sends the second id and the town's handler does
  nothing; a world leaving closes the card; the town answers `pickDialogue` as `showDialogue`'s pick
  does today (stays, next, close).
- GREEN: the bridge's dialogue messages, the UI scene's dialogue slot, the town's card as data.
