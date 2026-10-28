# FS-QPDKN: Resolved delver spectate and leave

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Escape run" (spectate living teammates after resolving · leave a run early after dying · hold the run result until the delver returns); `game-server/game-service/SPECIFICATION.md` "### Session & matchmaking lifecycle" (leave a run early after dying · resolved delvers settle with the run despite leaving or disconnecting) → this FS · Related ADRs: [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (one connection across worlds), [ADR-0004](../adr/0004-game-traffic-bypasses-the-application-gateway.md) (game-service owns the WebSocket contract) · Builds on: [FS-77AB6](77AB6-monsters-and-combat.md) §Requirements 17 (resolved delvers stay out of play; this FS adds the early leave R17 listed as out of scope), [FS-29KSH](29KSH-hub-world-and-delve-entry.md) (return to the hub, `world_entered`), [FS-BDA7X](BDA7X-character-leveling.md) §Requirements 22–24 (run progress), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) ("death loses everything") · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md), [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (*spectate*, *watched delver*, *leave early* pending via domain-model)

## Summary

A delver who has resolved (died or escaped) is today a passenger: they see a one-line notice
and wait, unable to do anything, until the run ends, and when it does the result card is
swept away by the return to the hub before it can be read. This feature gives a resolved delver
a choice: watch a living teammate finish the delve, or, if they died, leave for the hub at
once. It also keeps the result card on screen until the delver dismisses it, and makes sure
that a resolved delver who leaves or loses their connection is still settled with the run,
so an escape is never lost to a dropped socket.

**Lane:** the client slices (spectate, the two cards, holding the result) are agent lane. The
game-service slices (leave early, keeping resolved delvers for settlement) are **human lane**:
hand-coded, with an agent for tests only.

## Requirements

### Resolving: the two cards (game-client)

1. **A resolved delver gets a card, not a notice.** When the client's state shows the delver
   resolved while at least one teammate is still in play (today's condition for the "delve
   goes on" notice, `delveNotice`), the client shows a card instead of that notice. The card
   is the same component in both cases below, differing only in copy and buttons.
2. **The dead delver's card** carries grim copy (the existing "The barrow keeps you" line is
   acceptable) and **two buttons**: *Watch the delve* and *Leave the barrow* (final copy per
   `game-client/CONTEXT.md` lore voice; "leave" here is the delver's own word for returning
   to the hub).
3. **The escaped delver's card** carries congratulatory copy ("You are out of the barrow"
   register; grim and terse, not triumphant) and **one button**: *Watch the delve*. There is
   no leave button for an escaped delver (see *Out of Scope*).
4. **The card does nothing until pressed.** The camera stays on the delver's own body until
   *Watch the delve* is pressed. Resolving never moves the camera by itself.
5. **The card is modal to the run view but not to the socket.** State keeps arriving and
   rendering behind it; the delver's refused actions (FS-77AB6 R17) remain refused.
6. **The card goes down when the run ends** (`end_game` arrives): the result card replaces it
   (R15).

### Spectating (game-client)

7. **Watch the delve** puts the client in spectate mode: the camera follows one living
   teammate, the **watched delver**. The first watched delver is any teammate still in play.
8. **Switching.** With more than one teammate in play, **Tab** cycles the watched delver
   through the teammates still in play, in a stable order. The delver's own body is not in
   the cycle.
9. **The spectate HUD** shows, while spectating: who is being watched ("Watching Kaelen") and
   the switch hint ("Tab: next delver"), in the neutral HUD register (vellum on the HUD panel;
   no amber, since nothing here is interactable in the world). The hint is shown even with
   one teammate, so the control is learned.
10. **A dead spectator keeps the leave button.** While a dead delver spectates, *Leave the
    barrow* stays on screen, moved to a corner where it does not cover the watched delver
    (placement per `game-client/docs/design-guideline.md`; same depth band as the HUD).
    An escaped spectator has no leave button.
11. **The watched delver resolves.** The camera moves to the next teammate still in play. With
    none left, the run ends on the server's next tick and R15 takes over; the client does not
    need to handle "nobody to watch" beyond waiting for `end_game`.
12. **Spectate mode ends** with `end_game` (R15), with the leave button (R13), or with a
    reconnect. A reconnect mid-run returns the delver to the card (R1), not to spectating: the
    scene is rebuilt from scratch on `world_entered`, and the card is the state the rebuild
    reaches.

### Leaving early (game-client + game-service)

13. **Leave the barrow** sends `leave_run` (new inbound action, no payload; routed on server
    state like every world action, FS-29KSH R16). The client does nothing else until the
    server answers; a second press while waiting is ignored.
14. **The server answers `leave_run`** for a dead delver with `world_entered(hub)`, and the
    client switches scenes as it does for any `world_entered`. No confirmation step
    (default taken: leaving loses nothing). For any other sender the server answers with an
    error on the `leave_run` action and changes nothing (Edge States).

### Holding the result (game-client)

15. **The result card stays until dismissed.** On `end_game`, the client shows the result card
    as today and **holds** the `world_entered(hub)` that follows it, staying on the run view,
    until the delver presses the card's one button, *Return to the hub*; then it applies the
    held `world_entered` and switches scenes. The two legacy buttons (the pre-hub `find_game`
    sender and WITHDRAW to the main menu) are removed.
16. **The hold is specific.** Only a `world_entered` with `world_type: "hub"` arriving while the
    result card is up is held. Any other `world_entered` (a run, a handoff host's run) is
    applied at once, as today.
17. **The hold is client-only.** The server has already moved the delver to the hub and the
    hub broadcasts them at the spawn; the client simply has not switched yet. Nothing on the
    server waits for the button.

### Resolved delvers settle with the run (game-service)

18. **A resolved delver's body stays in the run until the run ends**, whether they left early
    (R14) or their connection dropped past its reconnect grace. The run-end snapshot
    (`getRawMatchState`, `runProgress`, eliminations) therefore includes them, and they are
    settled (`items.extracted`, `match.ended`, run progress) exactly as if they had stayed.
19. **A resolved delver's record stays in the run until the run ends** when their connection
    drops past its grace. Their player record is not deleted at grace end; it is deleted when
    the run ends if they have not reconnected by then. A reconnect before the run ends finds
    `CurrentGameSessionId` naming the run and lands them back in it (R12). A reconnect after
    the run ends is a fresh connect, as today, with the run already settled.
20. **A delver still in play who drops is unchanged**: grace, then removed from the run, as
    today.
21. **The run sends only to members still in it.** Once a dead delver has left (R14) their
    record names the hub, and the run's per-tick state, `end_game`, and any other run message
    must not reach them. The run keeps their body (R18) but drops them from its recipients.
22. **The run-end return goes only to members still pointing at the run.** `ReturnPlayersToHub`
    moves a member to the hub only if their record's `CurrentGameSessionId` is this run. A
    member who left early is already in the hub, and may have queued for or entered a new run
    meanwhile (default taken: leaving early does not block queuing again); the old run's end
    must not pull them out of it.
23. **Position and result are unchanged by leaving.** A dead delver who left early keeps the
    elimination index they died with, and their `end_game` payload would have said
    `eliminated`; since they no longer receive it (R21), the record of it is the `match.ended`
    event only.

## User Stories

1. As a dead delver, I want to see what my choices are the moment I die, so that I am not
   left staring at a notice with nothing to do.
2. As a dead delver, I want to leave the barrow at once, so that I can get back to the hub and
   queue again instead of waiting for my teammate.
3. As a dead delver, I want to watch my teammate finish the delve, so that I can see whether
   they make it out.
4. As a dead delver who is watching, I want the leave button still within reach, so that I can
   stop watching whenever I decide to.
5. As an escaped delver, I want to be told I made it, so that the escape feels like the
   completion it is.
6. As an escaped delver, I want to watch my teammate, so that I can follow the rest of the
   delve I was part of.
7. As an escaped delver, I want my plunder settled even if my connection drops while I wait,
   so that an escape is never undone by my network.
8. As a resolved delver, I want nothing to happen until I press a button, so that the camera
   does not jump away from my body the moment I resolve.
9. As a spectator, I want to know whose eyes I am looking through, so that the view makes
   sense.
10. As a spectator, I want to be told how to switch, so that I do not have to guess the key.
11. As a spectator with several living teammates, I want to cycle between them, so that I can
    follow whoever is doing something interesting.
12. As a spectator, I want the view to move on when the delver I watch resolves, so that I am
    never staring at a corpse I did not choose.
13. As any delver, I want to read the result card for as long as I like, so that the end of
    the run is not snatched away.
14. As any delver, I want one clear button on the result card that takes me home, so that the
    old main-menu and re-queue buttons do not send me somewhere the hub flow does not expect.
15. As a delver who left early, I want to be able to queue again right away, so that leaving
    early actually saves me the wait.
16. As a delver who left early and started a new run, I want the old run's end to leave me
    alone, so that I am not yanked out of a delve in progress.
17. As a delver who left early, I want my experience and stats from that run still counted, so
    that leaving costs me nothing I had already earned.
18. As a resolved delver who refreshes the page while the run is still going, I want to be put
    back into the run, so that I can still watch or leave.
19. As a resolved delver who reconnects after the run ended, I want to find myself in the hub
    with the run already settled, so that nothing I earned is missing.
20. As a living delver, I want nothing about my disconnect handling to change, so that the
    reconnect grace I rely on still works.
21. As a living delver whose teammate died and left, I want the run to carry on for me alone,
    so that their leaving does not end my delve.
22. As the last living delver, I want the run to end when I resolve, even if my teammate left
    earlier, so that settlement is not stuck waiting on someone who is gone.
23. As game-service, I want `leave_run` from a living or escaped delver refused, so that a
    client cannot use it to skip the run or dodge settlement.
24. As game-service, I want to send run messages only to members who are still in the run, so
    that a member in the hub never receives a stale `end_game` or run state.
25. As items-service and stats-service, I want each run's settlement events to carry every
    delver who was in that run, exactly once, so that nothing changes in how I consume them.

## Acceptance Criteria

**Cards and spectating (game-client)**

- [ ] A dead delver with a teammate still in play sees a card with *Watch the delve* and
      *Leave the barrow*; the "delve goes on" notice is not shown.
- [ ] An escaped delver with a teammate still in play sees a card with congratulatory copy and
      *Watch the delve* only.
- [ ] Until *Watch the delve* is pressed, the camera follows the delver's own body.
- [ ] Pressing *Watch the delve* makes the camera follow a teammate still in play; the HUD
      shows "Watching <name>" and the Tab hint.
- [ ] With two or more teammates in play, Tab cycles the watched delver; the delver's own body
      is never watched.
- [ ] When the watched delver resolves, the camera moves to another teammate in play.
- [ ] While a dead delver spectates, *Leave the barrow* is on screen in its corner placement;
      while an escaped delver spectates, no leave button is shown.
- [ ] On `end_game`, the card (or spectate HUD) is replaced by the result card.
- [ ] A scene restart (reconnect mid-run) brings a resolved delver back to the card, not to
      spectate mode, with no leftover camera follow or listeners.

**Leaving early**

- [ ] *Leave the barrow* sends `leave_run` once; a second press before the answer sends nothing.
- [ ] A dead delver's `leave_run` is answered with `world_entered(hub)` and the client enters
      `HubScene`.
- [ ] A living delver's `leave_run` is answered with an error on the `leave_run` action and
      they remain in the run, in play.
- [ ] An escaped delver's `leave_run` is answered with an error and they remain in the run.
- [ ] After a dead delver leaves, the run's state broadcast no longer reaches their connection,
      and their body is still in the run's entities.
- [ ] A delver who left early can `find_game` and is queued.

**Holding the result (game-client)**

- [ ] After `end_game`, the following `world_entered(hub)` does not switch the scene; the
      result card stays with one *Return to the hub* button.
- [ ] Pressing *Return to the hub* switches to `HubScene` with the held payload's session id.
- [ ] A `world_entered` with `world_type: "run"` arriving while the result card is up is
      applied at once.
- [ ] Neither legacy button (pre-hub `find_game`, WITHDRAW) exists.

**Settlement (game-service)**

- [ ] A resolved delver who disconnects past the grace keeps their body and record in the run;
      the run-end `items.extracted` and `match.ended` include them; their record is deleted at
      run end.
- [ ] A resolved delver who reconnects before run end is announced the run (`world_entered`
      run) and receives state again.
- [ ] A resolved delver who reconnects after run end connects fresh and is not in any run.
- [ ] A delver in play who disconnects past the grace is removed from the run (unchanged).
- [ ] A dead delver who left early appears in `match.ended` with their elimination position and
      in run progress with their earned experience.
- [ ] At run end, a member whose record names a different session (they left and entered a new
      run) is not moved to the hub and receives no `world_entered` from the old run.
- [ ] With one teammate left in play after the other left early, the run continues; when that
      teammate resolves, the run ends once (FS-QG1HR D5 latch holds).
- [ ] `go test -race ./internal/...` stays green across the new paths.

## Edge States

**Resolving**
- Resolved with **no** teammate in play: the run ends on that tick; no card, the result card
  comes straight away (as today). The card only exists while someone is still in play.
- Resolved by the *last* floor transition rule (left behind on a lower floor, FS-F6F88): out of
  play but not dead or escaped. Treated as dead for the card (grim copy, both buttons) **[OD]**;
  the server accepts their `leave_run` as a dead delver's.
- Both delvers resolve on the same tick: the run ends; nobody sees the card.

**Spectating**
- Only one teammate in play: Tab cycles to the same delver; the hint still shows.
- The watched delver disconnects within grace: their body stays, in play; the camera stays on
  it. Past grace their body is removed; the camera moves on, or the run ends.
- The watched delver escapes: resolved, the camera moves on (R11).
- A spectating delver presses Tab while the card is still up (never pressed *Watch*): nothing.
- The spectator's own `move`/`attack`/`interact` keys: refused by the server as today; the
  client should not send `move` while spectating (the camera target is not the delver).

**Leaving**
- `leave_run` from the hub: error, nothing changes (the member is in no run).
- `leave_run` twice (the second arriving after the first was applied): the member is now in
  the hub; error, nothing changes.
- `leave_run` racing the run's end on the same tick: whichever lands first wins. Left first:
  they are in the hub, the end's return skips them (R22). Ended first: they are moved home by
  the end, their `leave_run` then errors (they are in the hub), the client ignores an error on
  `leave_run` while showing the result card.
- Items-service slow at hub re-entry: today's hub `AddPlayer` loads gear; unchanged.
- The leaver was the queue leader of nothing / had no queue entry: `find_game` after leaving
  behaves as any hub `find_game`.

**Holding the result**
- Refresh while the result card is held: the server already has the delver in the hub; the
  refresh lands in the hub. Accepted.
- Handoff (`world_handoff`) arriving while the result card is held: cannot happen in order
  (the delver must `find_game` from the hub first), but if it does the run `world_entered`
  from the host is applied at once (R16).
- `end_game` for a delver who left early: never sent (R21).

**Disconnects**
- Resolved delver drops; run ends before the grace ends: the run-end path settles them, moves
  them home (their record still names the run, R22 applies), and the grace timer then finds a
  record pointing at the hub. The timer's cleanup must not remove a hub body that the record
  now legitimately holds **[OD]**; simplest is for the grace cleanup to treat a resolved-in-run
  record as "kept" (R19) and for run end to delete records of members still disconnected.
- Resolved delver drops, reconnects, drops again: each drop starts its own hold (existing
  `graceHold` mechanism); R19 applies to whichever is current at run end.
- Server restart before run end: nobody is settled. Existing limitation, unchanged; closed
  only by escape-time settlement (Out of Scope).

**Concurrent**
- Two dead delvers (future party sizes) both leave on the same tick: each handled on the
  message hub's loop in order; both end in the hub.
- The run ends while a `leave_run` is on the hub's channel: see *Leaving* above.

## WebSocket message surface

No HTTP endpoints change. The WebSocket contract, owned by game-service (ADR-0004), gains one
inbound action.

**Inbound (client → server)**

| Action | Payload | Notes |
|---|---|---|
| `leave_run` (new) | none | Routed on server state (FS-29KSH R16). Accepted only from a dead (or left-behind) delver in a run. Any other sender gets an error reply on this action. |

**Outbound (server → client)**

| Message | Change |
|---|---|
| `world_entered` | unchanged shape; now also the answer to an accepted `leave_run` |
| `leave_run` (error reply) | `{message}` with `error` set, same shape as every refused action |
| state broadcast, `end_game` | unchanged shape; no longer sent to a member who left the run (R21) |

## Out of Scope

- **An escaped delver leaving early.** Their plunder is settled from the run-end snapshot; leaving
  would need settlement at the moment of escape (below).
- **Settlement at the moment of escape.** `items.extracted` can carry one member, but experience
  rides inside `match.ended`, so a one-member `match.ended` would make stats-service count an
  extra match. It needs a new member-settled event or experience split out of `match.ended`:
  a cross-service event contract change (ADR), human lane. Revisit before letting escaped
  delvers leave early.
- **The server waiting for the result-card button** before ending the run or returning anyone.
- **Spectating the delver's own corpse**, or free camera.
- **Spectating from the hub**, or spectating a run one is not a member of.
- **A dead delver rejoining the run** (revival is a separate, unscoped feature).
- **Confirmation before leaving.**
- **Changes to the reconnect grace durations.**
- **Changes to `match.ended` / `items.extracted` shape or consumers.**
