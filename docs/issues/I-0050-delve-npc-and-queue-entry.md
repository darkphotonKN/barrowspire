---
id: I-0050
status: done
implements: FS-0008
blocked_by: [I-0049]
labels: [blocked]
title: "FS-0008 slice 6: delve NPC and queue entry"
---
Implements FS-0008 §Requirements 9, 24-28

**Author: agent**

## What to Build

Move the entry to a delve out of the menu and into the world.

- **Function NPC machinery + the first one.** A function NPC stands at a **fixed position**
  defined in the hub map data — its placement is map data, not something broadcast per tick. Use
  the ECS `NPC` type tag, which is already declared and currently unused.
- **Dialogue box with options.** Interacting opens a box; the queue is joined only on the
  affirmative choice. Walking into or past the NPC never queues anyone. Not a dialogue tree — no
  branching, no per-player memory, no dialogue data format (FS-0008 §Out of Scope).
- **Queuing stays private.** A queued player keeps moving around the hub normally, and no other
  player can see they are queued — queue state is not carried in the hub broadcast to anyone
  else.
- **Persistent corner panel** showing queue progress, fed by the existing
  `queue_status {current,total}` message, visible anywhere in the hub.

Matchmaking is unchanged: `matchSize = 2`, random pairing, existing queue service.

**Decide and proceed** (marked AFK deliberately): write the NPC's dialogue copy and pick the
panel's corner. Copy follows the lore voice in `game-client/docs/design-guideline.md` — delvers,
the Spire, "Delve" not "Play". Keep it to a line and two options.

**Known and accepted, do not fix here:** `leave_queue` is broken (`RemovePlayerFromQueue` is
commented out; the not-found path nil-derefs) and is out of scope. The dialogue confirmation and
the panel between them prevent queuing by accident and forgetting, but a player who queues
deliberately still cannot cancel. This is recorded in FS-0008 §Accepted consequences — it is
chosen, not missed.

## Acceptance Criteria

- [x] The delve NPC is at a fixed position, identical for two different clients.
- [x] Interacting opens a dialogue box with options; declining leaves the player unqueued.
- [x] Walking past the NPC does not queue the player.
- [x] The affirmative option sends `find_game` and the player enters the queue.
- [x] A queued player can still move around the hub.
- [x] A queued player sees the panel from anywhere in the hub.
- [x] A second player observing a queued player sees no indication they are queued.
- [x] Two players queueing in the same tick both queue, and reaching `matchSize` matches them
      into the same run.
- [x] **Revised, as in I-0045 and I-0049:** no new test failures, no new lint findings versus
      the branch point. Lint held at 34 across the touched packages; `internal/game`'s movement
      integration test and `cmd/server`'s vet failure are red at HEAD and out of scope.

### Verified by playing it

Unlike I-0049, this slice was run. Three defects surfaced that the suite had not:

1. **The dialogue could not be answered.** Options were mouse-only, and the mouse path was
   broken too — a Phaser Container carries no texture, so `setInteractive` with no shape left
   them looking clickable and swallowing clicks. E/Enter confirm and Esc declines now, and the
   options say so.
2. **Descending restarted the hub instead of queuing.** `handlePlayerExistingGame` asked whether
   the player was in *a* session before queuing them, which every delver in the hub now is, so
   it resumed them into the world they were standing in. Third defect of that exact shape after
   the reconnect path and the empty-session shutdown: code written when "session" and "run"
   were one word.
3. Both were invisible to a green suite, which is now this feature's consistent pattern.

## Blocked By

I-0049 — queuing must lead somewhere, so the world switch has to work first.

## Spec Reference

FS-0008 §Requirements 9, 24-28; §Edge States (Empty — "Nobody else queued: the player waits
indefinitely"; Concurrent — "Two players interacting with the delve NPC in the same tick").
§Accepted consequences: off-peak the game cannot be entered, and a deliberately queued player
cannot cancel. §Out of Scope: fixing `leave_queue`, dialogue trees.

## TDD Approach

- RED: interact with the delve NPC and assert no `find_game` is sent until the affirmative
  option is chosen.
- GREEN: dialogue gate.
- RED: assert a second player's view of the hub broadcast contains no queue state for the first.
