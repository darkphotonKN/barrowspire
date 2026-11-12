---
id: I-R6EYZ-4
status: open
implements: FS-R6EYZ
blocked_by: [I-R6EYZ-2, I-R6EYZ-3]
labels: []
title: "FS-R6EYZ slice 4: Nick's browser check of the disconnect notice and the menu's reconnect (game-client)"
---
Implements FS-R6EYZ §Acceptance Criteria (Live)

**Lane: human (HITL).** Nick, in a real browser, with the local stack (`make dev` in
`game-server/game-service` and the other services, `npm run dev` in `game-client`). No code
unless the check finds something; anything found becomes a new issue or an escalation.

## What to Check

- [ ] **Server down, in the town:** in the town, stop game-service (Ctrl-C in its `make dev`). The notice comes up at once: "Disconnected", "The connection to the server was lost.", "Return to menu", the town dimmed and still. Keys (WASD, I, Enter), clicks and the wheel do nothing; the chat field is gone.
- [ ] **The same in a field and in a run** (enter one, then stop game-service).
- [ ] **One notice:** it does not stack (wait a few seconds, nothing new appears).
- [ ] **Return to menu with the server still down:** the menu shows "CONNECTING..." then "RECONNECT" with "The torch gutters // Connection lost".
- [ ] **Back up:** start game-service again, press RECONNECT: "The way is open // Server connected", then ENTER THE TOWN enters the town (the server restarted, so nothing was held).
- [ ] **A held run comes back:** enter a run in tab A. Open `/game` in a second tab B as the same player: B goes into the run, and A shows the notice (the server closed A's older socket). In A press Return to menu: A goes back into the run where it stood (and B shows the notice in turn).
- [ ] **No notice where there should be none:** travel to a party leader's town; enter a run from the Spire's door; leave /game for another page and come back; sit on the main menu while game-service is stopped (the menu shows the loss, no popup).
- [ ] **Look:** the carved panel, brass frame, amber button label that brightens its outline on hover, at the normal window and in fullscreen.

## Blocked By

I-R6EYZ-2, I-R6EYZ-3

## Spec Reference

FS-R6EYZ §Acceptance Criteria "Live (owner's browser check)"; Edge States (two tabs, server
still down, server restarted).

## Files it expects to touch

None.
