---
id: I-NCC9J-7
status: open
implements: FS-NCC9J
blocked_by: []
labels: [ready-for-agent]
title: "FS-NCC9J slice 7: frames for teammates elsewhere, skeleton rows, the expiry line (game-client)"
---
Implements FS-NCC9J §Requirements R25–R27

**Lane: agent (AFK).** Built against FS-NCC9J's wire shapes (`reserved`, `online`).

## What to Build

- A teammate not in the player's world shows name and class bust only (no state word); a member
  with `online: false` is greyed.
- After the members, one skeleton row per `reserved` entry: the invitee's name, a grey pulse where
  the bust and bars go, no countdown; replaced by a real frame on join, gone on decline or expiry.
- When a reserved slot's `expires_at` passes without a join, the leader's client writes "No answer
  from <name>." as a system line.

## Acceptance Criteria

- [ ] A teammate absent from the world's state draws name and bust, no word.
- [ ] `online: false` greys the frame.
- [ ] Each `reserved` entry draws a skeleton row with the name; a join replaces it, a decline removes it.
- [ ] The leader's client writes the expiry line at `expires_at` (clock injected); other members do not.
- [ ] Rows (members + skeletons, up to the size) clear the chat window, panel and prompts at 1080x720.
- [ ] `vitest` green; lint fence passes.

## Blocked By

None (server: I-NCC9J-3 for `reserved`, I-NCC9J-4 for `online`)

## Spec Reference

FS-NCC9J §Requirements R25–R27; §User Stories 6, 7, 18.

## TDD Approach

- RED: a layout test that a party with one member and one `reserved` entry yields a member frame and a skeleton row carrying the invitee's name.
- GREEN: the skeleton slot kind, then the drawing, then the expiry line.
