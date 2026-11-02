---
id: I-R82NV-7
status: done
implements: FS-R82NV
blocked_by: [I-R82NV-6]
labels: [ready-for-agent]
title: "FS-R82NV slice 7: the invite prompt — accept, decline, countdown (game-client)"
---
Implements FS-R82NV §Requirements R32, R33

**Lane: agent (AFK).**

## What to Build

- An incoming `party_invite` shows a small carved prompt at top centre (under the queue panel's
  spot): "<leader> invites you to their party (<n>/<size>)", **Accept** / **Decline**, a 60 s
  countdown. Several prompts stack.
- Accept sends `party_accept {invite_id}`; Decline sends `party_decline {invite_id}`.
- The prompt closes on countdown end, on its own button, or when a `party_update` makes the
  player a member.
- Hidden under the end-of-run overlay, like the chat input.

## Acceptance Criteria

- [x] A `party_invite` message renders the prompt with the leader's name and count.
- [x] Accept / Decline send the right action with the invite id and close the prompt.
- [x] The countdown closes the prompt at 60 s (clock injected in the pure part).
- [x] Two invites stack; joining one party closes all prompts.
- [x] `vitest` green; lint fence passes.

## Blocked By

I-R82NV-6

## Spec Reference

FS-R82NV §Requirements R32, R33; §User Stories 3, 6.

## TDD Approach

- RED: pure prompt-queue test — push two invites, apply a `party_update` naming the viewer a member, queue is empty.
- GREEN: the queue module, then the scene draws it.

## Implementation notes (code review 2026-11-01)

- **The prompt is mounted in the hub only.** The server delivers invites to hub-seated players
  only (R7, R12), and an invite can be accepted only from the hub (R16), so nothing is ever drawn
  over the end-of-run overlay (R33). An invite that arrives elsewhere waits in the store, its
  countdown running, and shows on return to the hub if still live.
- **The countdown runs on the client's clock from arrival** (R14: "on its own clock"); the
  server's `expires_at` is checked by the wire guard but not read. One clock: the prompt reads
  the store's `secondsLeft`.
- **At most four prompts show at once** (`INVITE_PROMPT_MAX`), so the stack stays clear of the
  chat window; a fifth waits in the store with its countdown running. Not in the FS.
- `covers()` exists for a world click handler; the hub has none yet, so nothing calls it.
