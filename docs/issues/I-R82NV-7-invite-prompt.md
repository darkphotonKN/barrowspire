---
id: I-R82NV-7
status: open
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

- [ ] A `party_invite` message renders the prompt with the leader's name and count.
- [ ] Accept / Decline send the right action with the invite id and close the prompt.
- [ ] The countdown closes the prompt at 60 s (clock injected in the pure part).
- [ ] Two invites stack; joining one party closes all prompts.
- [ ] `vitest` green; lint fence passes.

## Blocked By

I-R82NV-6

## Spec Reference

FS-R82NV §Requirements R32, R33; §User Stories 3, 6.

## TDD Approach

- RED: pure prompt-queue test — push two invites, apply a `party_update` naming the viewer a member, queue is empty.
- GREEN: the queue module, then the scene draws it.
