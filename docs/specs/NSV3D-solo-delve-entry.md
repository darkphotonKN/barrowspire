# FS-NSV3D: Solo delve entry

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Hub" (solo delve entry from the hub); `game-server/game-service/SPECIFICATION.md` "### Session & matchmaking lifecycle" (start a solo run without the queue) → this FS · Related ADRs: [ADR-0004](../adr/0004-game-traffic-bypasses-the-application-gateway.md) (game-service owns the WebSocket contract), [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) · Builds on: [FS-29KSH](29KSH-hub-world-and-delve-entry.md) (delve NPC, `find_game`, queue panel), [FS-G4VMQ](G4VMQ-switch-character-and-leave-queue-from-hub.md) (the hub's `queued` flag, leave the queue), [FS-77AB6](77AB6-monsters-and-combat.md) §Requirements 15, 22, [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) R7a (refuse-while-queued pattern), [FS-BDA7X](BDA7X-character-leveling.md) R6 (entry refusals) · Vocabulary: no new terms

## Summary

Today the only way into the Spire is the queue: the delve NPC's one choice puts the delver in
the global queue, and alone they wait forever. This feature lets a delver **descend alone**: the
NPC offers a solo choice beside the queue, and the server builds a run for that one delver at
once, without the queue, matchmaker or handoff. While the delver is already queued the NPC
only says so; the solo and queue choices are not offered.

**Lane:** the server side (`start_solo`) is **human lane**, hand-coded by the owner, agent for
tests only. The client side (dialogue choices, queued state, action type) is agent lane.

## Requirements

### The delve NPC (game-client)

1. **Three choices.** The delve NPC's dialogue offers, in this order: *Descend alone*, *Wait for
   company*, *Not yet*. *Wait for company* does what *Descend* does today (`find_game`). *Not
   yet* dismisses. Copy follows the lore voice in `game-client/CONTEXT.md`; the NPC's warning
   line ("Few return whole, and fewer return twice") stays and is the only warning: no
   confirmation step on *Descend alone* (default taken).
2. **Descend alone sends `start_solo`** (no payload) once, and disables the choice until the
   server answers. The dialogue stays open while waiting.
3. **The dialogue data shape grows from accept/decline to a list of choices**, each with a label
   and an action, so the NPC table in `HubScene` carries three for the delve NPC and two for the
   storekeeper without a second code path.
4. **While queued, the dialogue shows a queued state**: one line ("The delve is gathering. Wait,
   or leave the queue." or equivalent) and a single dismiss. Neither *Descend alone* nor *Wait
   for company* is offered. "Queued" is FS-G4VMQ's `queued` flag on `HubScene` (set on
   `find_game` success and on `queue_status`, cleared on `leave_queue` success,
   `world_handoff_failed`, and scene shutdown). The queue count is not repeated here; the
   panel shows it.
5. **A refused `start_solo`** (an error reply on that action) re-enables the choice and shows the
   server's message as a passing notice in the hub, in the same place and register a refused
   `leave_queue` uses (FS-G4VMQ). The dialogue may stay open.
6. **A successful `start_solo`** is the ordinary `world_entered(run)`; `PhaserGame.tsx` switches
   to the run scene as for a match. The client adds nothing for success.
7. `ActionType.StartSolo = "start_solo"` and `ActionMap.start_solo` (no payload) in
   `src/assets/types/client.ts`.

### Starting a solo run (game-service)

8. **A new inbound action `start_solo`**, handled on the message hub's loop beside `find_game`.
   It is routed on the sender's record (FS-29KSH R16); the payload is ignored.
9. **Refusals mirror `find_game`**, each answered with an error on the `start_solo` action
   (top-level `Error`, `payload.message`), and nothing changed:
   - no character in play on the record → FS-BDA7X R6's copy ("Enter the hub with a character
     first.");
   - the member is queued (`QueuedCharacter` finds an entry) → "Leave the queue first." (same
     shape as FS-K2HKP R7a);
   - the sender's record is not in the hub (in no world) → refused as `find_game` would be.
10. **Already in a run: resume** (default taken, mirrors `find_game`'s
    `handlePlayerExistingGame`): if the record names a run that still exists, answer
    `world_entered(run)` for that run and create nothing. A record naming the hub is not "in a
    run".
11. **Otherwise the hub creates the run at once**: `CreateGameSession` with the sender as the
    only local player and no handoff players, then `world_entered(run)` to the sender. This
    is the same call a match of one would make; the hub removes them, the run seats their
    character in play with their gear (as a match does), the first floor is built for a party
    of one (FS-77AB6 R22: monster level = this delver's level).
12. **No queue, no matchmaker, no Redis, no handoff.** The run lives on the pod the sender is
    connected to, by construction. `AddPlayer` to the queue is never called for a solo start.
13. **Solo runs are ordinary runs.** Nothing downstream distinguishes them: the end rule
    (FS-77AB6 R15, roster of one ends when that delver resolves), the return to the hub,
    `match.ended` and `items.extracted` with one member, run progress, FS-QPDKN's result-card
    hold. FS-QPDKN's resolved-delver card never appears (no teammate in play).
14. **Content is not scaled** (user): same floors, monster count and loot rules as a run of two.
15. `ActionStartSolo = "start_solo"` beside `ActionFindGame` in the server's constants.

## User Stories

1. As a delver alone in the hub, I want to descend without waiting for a stranger, so that I
   can play when nobody else is online.
2. As a delver, I want the choice between going alone and waiting for company at the same
   NPC, so that the way into the Spire is one place.
3. As a delver who chose to go alone, I want to be in the run at once, so that the choice feels
   like a door, not a queue of one.
4. As a delver who is already queued, I want the NPC to tell me so instead of offering the
   same choices again, so that I do not queue twice or wonder whether I am queued.
5. As a queued delver who changes their mind, I want to leave the queue (FS-G4VMQ) and then go
   alone, so that waiting never traps me.
6. As a delver, I want a refused solo start to tell me why, so that I can fix it (enter with a
   character, leave the queue).
7. As a delver whose client got confused (a reconnect mid-run), I want *Descend alone* to put me
   back in the run I am already in, so that the confused state resolves rather than erroring.
8. As a solo delver, I want the run to end when I die or escape, so that I am not stuck waiting
   on a teammate who does not exist.
9. As a solo delver, I want my loot, experience and stats settled like any run, so that going
   alone is not a lesser delve.
10. As a solo delver, I want the same Spire as a party faces, so that a solo clear means the same
    thing (scaling is a later question).
11. As the owner of game-service, I want solo starts to touch neither the queue nor Redis, so
    that a Redis outage (FS-K2HKP edge state) still lets delvers play alone.
12. As the owner of game-service, I want `start_solo` on the hub's loop with the same guards as
    `find_game`, so that there is one set of entry rules.
13. As the storekeeper NPC's code, I want the dialogue shape to carry two choices as before, so
    that the delve NPC's third choice does not fork the dialogue code.
14. As stats-service, I want a one-member `match.ended`, so that solo runs count like any other
    without a new event.

## Acceptance Criteria

**Client**

- [ ] The delve NPC's dialogue shows *Descend alone*, *Wait for company*, *Not yet*; the
      storekeeper's dialogue is unchanged.
- [ ] *Wait for company* sends `find_game` exactly as *Descend* did.
- [ ] *Descend alone* sends one `start_solo`; a second press before the reply sends nothing.
- [ ] With the `queued` flag set, opening the delve NPC's dialogue shows the queued line and a
      dismiss only; no `start_solo` or `find_game` can be sent from it.
- [ ] An error reply on `start_solo` re-enables the choice and shows the message as a passing
      notice in the hub.
- [ ] A `world_entered(run)` after `start_solo` switches to the run scene (existing path; no
      new handling).
- [ ] `ActionType.StartSolo` exists; unit tests cover the choice list by state (idle / queued),
      the single send, and the refusal re-enable.
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint` pass.

**Server (tests agent-written, red first; implementation human lane)**

- [ ] `start_solo` from a hub member with a character in play creates a run whose roster is that
      one member, removes them from the hub, and answers `world_entered(run)`; the queue
      service's `PlayerJoinQueue` is never called.
- [ ] `start_solo` from a member with no character in play is refused with R6's copy; nothing
      changes.
- [ ] `start_solo` from a queued member is refused with "Leave the queue first."; they stay
      queued and in the hub.
- [ ] `start_solo` from a member already in a run answers `world_entered` for that run and creates
      no second run.
- [ ] A solo run ends when its one delver dies (or escapes): `end_game`, return to the hub,
      `PublishMatchComplete` with one player.
- [ ] The first floor of a solo run is built (walls, stairs, monsters) with the party formation
      for one and monster level equal to the delver's level.
- [ ] `go test -race ./internal/...` green; `golangci-lint run` clean.

## Edge States

**Dialogue**
- `queued` flips while the dialogue is open (a `queue_status` lands, or `leave_queue` succeeds):
  the dialogue is not rebuilt mid-view; the next open shows the right state. If *Descend alone*
  is pressed on a stale dialogue after queuing, the server refuses (R9) and the notice says so.
- A `world_entered` (match found) while the dialogue is open: the scene stops; the dialogue goes
  with it.

**Starting**
- `start_solo` twice before the reply: the first creates the run; the second finds the member in
  a run → resume (R10), a second `world_entered` for the same run, harmless. The client's
  disable (R2) makes this unlikely.
- `start_solo` racing a match found for the same member: cannot happen (queued members are
  refused); the hub's loop serialises both anyway, and the second finds the member in a run.
- `start_solo` from a member in a run that no longer exists (stale record): `find_game` clears
  the stale id and treats them as not in a run; `start_solo` does the same, then creates.
- Items-service slow or down at seating: whatever `CreateGameSession`'s `AddPlayer` does today
  for a match (loads gear with the member's token; its failure mode is unchanged by this FS).
- Hub occupancy: a solo start frees a hub slot like a match (the hub removes them).
- Redis down: `QueuedCharacter` errors; `find_game`'s `enter_hub` path treats an unreadable
  queue as "not queued" and lets them in (FS-K2HKP R7a note). `start_solo` does the same:
  an unreadable queue does not block a solo start. **[OD]**

**The run**
- The solo delver disconnects: ordinary reconnect grace; past it the run has nobody in play and
  ends (today's last-player-leave teardown; FS-QPDKN-5 keeps resolved delvers only).
- The solo delver dies on floor 1: the run ends on that tick (R15); result card; home.
- Floors (FS-F6F88) with a party of one: the formation and the "left behind" rule apply to a
  roster of one (nobody can be left behind).

**Concurrent**
- Two members `start_solo` on the same tick: two runs; each is independent.

## WebSocket message surface

No HTTP endpoints change. The WebSocket contract, owned by game-service (ADR-0004), gains one
inbound action.

**Inbound (client → server)**

| Action | Payload | Notes |
|---|---|---|
| `start_solo` (new) | none | Routed on the sender's record. Accepted from a hub member with a character in play who is not queued. |

**Outbound (server → client)**

| Message | Change |
|---|---|
| `world_entered` | unchanged shape; the answer to an accepted `start_solo`, and to one from a member already in a run (resume) |
| `start_solo` (error reply) | `{message}` with `error` set, same shape as every refused hub-loop action |

## Out of Scope

- Joining a solo run in progress; invites; parties larger than the queue's `matchSize`.
- Difficulty, monster count or loot scaling for solo runs (R14).
- A solo option anywhere other than the delve NPC (not the ESC menu).
- Any change to the queue, matchmaker, Redis keys or handoff.
- A confirmation step before descending alone.
- Showing the queue count inside the NPC dialogue.
