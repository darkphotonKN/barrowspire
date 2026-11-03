---
id: I-KCQ06-4
status: open
implements: FS-KCQ06
blocked_by: [I-KCQ06-3]
labels: [ready-for-agent]
title: "FS-KCQ06 slice 4: click a sender's name in the chat window to start a whisper to them (game-client)"
---
Implements FS-KCQ06 §Requirements C15

**Lane: agent. HITL check at the end:** Nick clicks names in a live window. A drawn line's hit area
can't be fully proven in unit tests.

**Escalated, still open (FS-KCQ06 R12):** clicking a name that contains a space fills
`@Two Words `, which slice 3's parse splits wrongly. Build to the FS as written, and note the case
in the report.

## What to Build

In the chat window, the sender's name in any line (any chat channel), and the target's name in a
"To Name" echo, gets a hit area measured from that name's rendered text width, not the whole
line. Clicking it puts `@Name ` in the input, replacing a channel prefix the draft already has and
keeping the rest of the draft, and focuses the input. Clicking your own name does nothing. A click
elsewhere on the line does nothing new.

Likely files: `src/ui/chatWindowLayout.ts` (the name span's width and offset per line),
`src/ui/ChatWindow.ts` (hit areas and the click), `src/ui/chatInput.ts` (the prefill entry
point), and their tests.

## Acceptance Criteria

- [ ] Clicking a sender's name fills `@Name ` and focuses the input.
- [ ] Clicking the name in a "To Name" echo fills that target.
- [ ] A click on the line outside the name does nothing new.
- [ ] Clicking your own name does nothing.
- [ ] A draft's existing prefix is replaced and its text is kept.
- [ ] Tests pass, and Nick has checked it in a live window.

## Blocked By

I-KCQ06-3

## Spec Reference

FS-KCQ06 §Requirements C15; User Stories 8, 9; Acceptance Criteria (client row 5).

## TDD Approach

- RED: the layout reports a name span (x, width) for a line, and a click inside it calls the input's prefill with the name.
- GREEN: measure the name text and wire the hit area.
