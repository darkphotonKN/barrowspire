---
id: I-KCQ06-3
status: done
implements: FS-KCQ06
blocked_by: [I-KCQ06-1]
labels: [ready-for-agent]
title: "FS-KCQ06 slice 3: @Name message sends a whisper; From/To lines in the whisper colour; new notices (game-client)"
---
Implements FS-KCQ06 §Requirements C11–C14, C16

**Lane: agent.** It is built against the wire contract in FS-KCQ06 B6 and can run beside I-KCQ06-2.

**Escalated, still open (FS-KCQ06 R12):** character names may contain spaces. Build R12 exactly as
written: the name runs to the first space. Put the parse in one small, tested function, so Nick's
answer changes one place.

## What to Build

- `whisper` joins `CHAT_OPEN_CHANNELS` (`src/ui/chatInput.ts`). The `@` prefix stops going to
  Area as plain text.
- A line `@Name message` is sent as `{channel: "whisper", target: "Name", text: "message"}`.
  `@Name` with no message is not sent, and the draft stays.
- Picking Whisper in the picker puts `@` at the start of the draft. A recalled whisper line keeps
  its `@Name ` and picks whisper.
- In the window (`chatWindowLayout.ts` / `ChatWindow`): a received whisper renders as
  "From Name: text", and an echo (the sender's own id as `sender_id`) as "To <target_name>:
  text", both in `palette.chatWhisper`. The existing whisper filter toggle applies to both.
- `not_online` and `whisper_self` show as chat notices, keyed on the code.

## Acceptance Criteria

- [ ] `@Name hello` sends `{channel: "whisper", target: "Name", text: "hello"}`.
- [ ] `@Name` alone is not sent and stays in the input.
- [ ] `@` lines are no longer sent on Area.
- [ ] Picking Whisper puts `@` at the start, and a recalled whisper picks whisper.
- [ ] A received whisper reads "From Name: text", and an echo reads "To Name: text", both in `chatWhisper`.
- [ ] The whisper filter hides and shows them.
- [ ] `not_online` and `whisper_self` render as notices.
- [ ] Tests pass (`chatInput.test.ts`, `ChatWindow.test.ts` / `chatWindowLayout.test.ts`).

## Blocked By

I-KCQ06-1 (the wire, for the end-to-end check; the client tests run against the contract alone)

## Spec Reference

FS-KCQ06 §Requirements C11–C14, C16; User Stories 1, 6, 7, 13, 14, 15, 17; Acceptance Criteria (client rows 1–4, 6).

## TDD Approach

- RED: `chatInput` turns `@Name hello` into a whisper send with `target: "Name"`.
- GREEN: open the channel and add the target parse.
