# FS-9K8EZ: Die by choice

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Escape run" (die by choice from the run's ESC menu); `game-server/game-service/SPECIFICATION.md` "### Gameplay actions" (a delver may end their own run as a death) → this FS · Related ADRs: [ADR-0004](../adr/0004-game-traffic-bypasses-the-application-gateway.md) (game-service owns the WebSocket contract) · Builds on: [FS-QPDKN](QPDKN-resolved-delver-spectate-and-leave.md) (dead delver's card, Watch / Leave the barrow, `leave_run`), [FS-G4VMQ](G4VMQ-switch-character-and-leave-queue-from-hub.md) (the hub's ESC menu: chrome, keys, pure choice rule), [FS-77AB6](77AB6-monsters-and-combat.md) §Requirements 15, 17 (end rule, resolved delvers), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) ("death loses everything"), [FS-NSV3D](NSV3D-solo-delve-entry.md) (a run of one ends when its delver resolves) · Vocabulary: no new terms (it is a death)

## Summary

A delver in the Spire who wants out has today exactly two doors: the escape door, or death.
This feature names the second one honestly. The run gets an ESC menu like the hub's; a living
delver may choose to **fall where they stand**, confirm it, and die, with everything that
death already means: the plunder is lost, the elimination is recorded, the dead delver's
card offers to watch or leave, a run of one ends. Nothing new is settled or rewarded; the
server simply sets their health to zero and the ordinary death path does the rest.

**Lane:** the server slice (`forfeit_run`) is **human lane**, hand-coded by the owner, agent for
tests only. The client slice (the run's ESC menu and confirm) is agent lane.

## Requirements

### The run's ESC menu (game-client)

1. **ESC in a run opens a menu**, built and keyed as the hub's (FS-G4VMQ R1–5): a camera-fixed
   panel in the popup band, number keys for actionable rows, Enter for the first, Esc (or
   *Back*) closes. ESC pressed again closes it. The controls panel (H) lists "ESC — Menu".
2. **Rows by state**, from a pure rule beside the hub's (`runMenuChoices({resolved, escaped})`):
   - in play: *Fall where you stand* `[1]`, *Back* `[Esc]`;
   - dead or left behind: *Leave the barrow* `[1]` (FS-QPDKN R13's `leave_run`, a second entry
     point to the same path), *Back* `[Esc]`;
   - escaped: *Back* `[Esc]` only (an escaped delver waits for the run's end, FS-QPDKN).
3. **Fall where you stand asks once.** Choosing it replaces the menu's rows with a confirm:
   the line "The barrow keeps its dead. Fall here?" and *Fall* `[1]` / *Not yet* `[Esc]`. Esc
   and *Not yet* return to the run with nothing sent. *Fall* sends `forfeit_run` (no payload)
   once, then disables itself until a reply or the next state.
4. **After sending, the client adds nothing.** The next state broadcast shows the delver at 0
   health; FS-QPDKN's resolved-card logic takes the menu down and shows the dead delver's
   card (Watch / Leave) if a teammate is still in play, or the result card arrives if the run
   ended. A refusal on `forfeit_run` (error reply) re-enables *Fall* and shows the message as
   a passing notice, in the HUD register.
5. **The menu owns the keyboard and the pointer while open**, as the hub's does: no `move`
   is sent (a stride it interrupts stops once), E/F/I/Q/H do nothing, left/right click attack
   and skill are dropped. Closing resumes all of it.
6. **The menu yields to what the server says.** A state that shows the delver resolved, or an
   `end_game`, takes the menu (and its confirm) down; the card or the result overlay that
   follows is not covered by it.
7. `ActionType.ForfeitRun = "forfeit_run"`, `ActionMap.forfeit_run` (no payload), in
   `src/assets/types/client.ts`.
8. Teardown: `resetRun` forgets the menu, the confirm, the pending flag; the menu's hit areas
   live outside its container (camera-fixed, as the hub's choices do since 2026-10-29).

### Dying by choice (game-service)

9. **A new inbound action `forfeit_run`**, handled on the message hub's loop and routed on the
   sender's record (FS-29KSH R16). Payload ignored.
10. **Accepted from a member whose record names a run and whose body there is in play**
    (`systems.InPlay`). The server sets that body's health to 0 and does nothing else: no
    message, no removal, no settlement of its own.
11. **The ordinary death path does the rest, unchanged:** the next tick's `EliminationSystem`
    records the elimination with the next index; `RulesSystem` ends the run if nobody is in
    play; `end_game` says `eliminated`; `match.ended` carries the elimination position; run
    progress keeps what was earned before; the plunder is lost as for any death (FS-4R9M9).
    FS-QPDKN's `leave_run` is then available to them like any dead delver.
12. **Refused**, with an error on the `forfeit_run` action (top-level `Error`, `payload.message`)
    and nothing changed:
    - record names no run (hub, or no world): "You are not in a delve.";
    - body already resolved (dead, escaped, left behind): "You are already out of the delve.";
    - body cannot be found: as "not in a delve".
13. `ActionForfeitRun = "forfeit_run"` beside `ActionLeaveRun` in the constants.
14. **No new result, no new event.** `match.ended` and `items.extracted` are untouched; a
    chosen death and a monster's kill are indistinguishable downstream.

## User Stories

1. As a delver who is stuck, lost or done, I want a way out of the Spire that does not
   pretend to be anything but death, so that I can end the run on my terms.
2. As a delver, I want that way out behind a confirm, so that a stray ESC and Enter never
   kill me.
3. As a delver, I want the choice's words to say it is death, so that I am not surprised by
   losing my plunder.
4. As a dead delver, I want the same ESC menu to offer Leave the barrow, so that there is one
   menu in the run whatever my state.
5. As an escaped delver, I want the menu to offer nothing but Back, so that I do not mistake it
   for a way to skip the wait (my plunder is settled at the run's end).
6. As a delver who chose to fall with a teammate still in play, I want the dead delver's card
   (Watch / Leave) afterwards, so that falling by choice and falling in combat feel the same.
7. As a solo delver who chose to fall, I want the run to end at once with the result card, so
   that I am not left staring at my body.
8. As a delver, I want the menu to stop my body while it is open, so that I do not walk into a
   monster while deciding.
9. As a delver, I want the menu to vanish if I am killed or the run ends while it is open, so
   that it never covers the card that matters.
10. As a delver whose request was refused, I want to be told why in a passing notice, so that
    I can try again or understand I am already out.
11. As the owner of game-service, I want `forfeit_run` to do nothing but set health to 0, so
    that there is exactly one death path to reason about.
12. As the owner of game-service, I want a chosen death to be refused for anyone already
    resolved or not in a run, so that it cannot be used to change a settled state.
13. As stats-service and items-service, I want a chosen death to look like any death, so that
    nothing changes in how I consume `match.ended` and `items.extracted`.
14. As a teammate, I want the run to go on when the other delver falls by choice, so that
    their choice does not end my delve.

## Acceptance Criteria

**Client**

- [ ] ESC in a run opens the menu; ESC again or *Back* closes it; the controls panel lists
      "ESC — Menu".
- [ ] In play: rows are *Fall where you stand* `[1]`, *Back* `[Esc]`. Dead or left behind:
      *Leave the barrow* `[1]`, *Back* `[Esc]`. Escaped: *Back* only. (Pure rule, case-per-row.)
- [ ] Choosing *Fall where you stand* shows the confirm line and *Fall* / *Not yet*; *Not yet*
      and Esc send nothing and return to the run.
- [ ] *Fall* sends exactly one `forfeit_run`; a second press before a reply or the next state
      sends nothing.
- [ ] *Leave the barrow* from the menu sends `leave_run` through the same path and pending
      flag as the card's button (FS-QPDKN slice 4).
- [ ] With the menu open: no `move` is sent (one `{0,0}` on the interrupting frame), E/F/I/Q/H
      do nothing, pointer attacks are dropped.
- [ ] A state showing the delver resolved, or `end_game`, takes the menu and confirm down.
- [ ] An error reply on `forfeit_run` re-enables *Fall* and shows the message as a passing
      notice.
- [ ] `resetRun` forgets the menu, confirm and pending flag; hit areas are destroyed with it.
- [ ] `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint` pass.

**Server (tests agent-written, red first; implementation human lane)**

- [ ] `forfeit_run` from a member in play: their body's health is 0 after the call; on the next
      tick they are eliminated with the next index; `end_game` to them says `eliminated` when the
      run ends; `match.ended` carries their position; they appear in run progress.
- [ ] `forfeit_run` with a teammate still in play: the run goes on; the fallen delver's
      `leave_run` is then accepted.
- [ ] `forfeit_run` in a run of one: the run ends once, settles, and the member is sent home.
- [ ] `forfeit_run` from a member in the hub: refused, "You are not in a delve."
- [ ] `forfeit_run` from a dead, escaped or left-behind member: refused, "You are already out
      of the delve."; nothing changes.
- [ ] `forfeit_run` twice on the same tick: one elimination record.
- [ ] `go test -race ./internal/...` green; `golangci-lint run` clean.

## Edge States

**Menu**
- ESC with the equipment panel or a container view open: the menu opens over it; the panel
  stays until closed as today (Q). The menu's keyboard ownership means Q does nothing while
  it is up; close the menu first.
- ESC while the dead delver's card (FS-QPDKN) is up: the menu opens with *Leave the barrow*;
  either entry point works. While spectating: the same.
- ESC while the result card is up: nothing (the run is over; the result card has the only
  action).
- The delver is killed by a monster while the confirm is up: the next state shows them dead;
  the menu goes down; the dead card appears (R6).
- `end_game` arrives with the menu up: the result overlay takes over; the menu goes down.
- Reconnect (scene restart) with the menu up: the scene is rebuilt; nothing was sent.

**Dying**
- `forfeit_run` twice before the tick records the death: the second finds health 0 → refused
  as already resolved; one elimination.
- `forfeit_run` racing a killing blow on the same tick: the same death, recorded once.
- `forfeit_run` on floor transition (FS-F6F88): the body is wherever it is; health 0 there.
- Solo run: health 0 → nobody in play → run ends that tick → result card → Return to the hub.
- Two delvers, one falls by choice: identical to that delver dying in combat; FS-QPDKN governs
  what follows (card, Watch, Leave; settlement at the end).
- Disconnect between confirm and reply: the request is on the hub's loop; it is applied; the
  reconnect finds them dead in the run (FS-QPDKN R18–19 keep them for settlement).

**Refusals**
- From the hub or no world: refused; the client shows the notice and the menu stays.
- Already resolved: refused; the client (which should not have offered *Fall*) shows the
  notice; the next state corrects the menu.

## WebSocket message surface

No HTTP endpoints change. The WebSocket contract (game-service, ADR-0004) gains one inbound
action.

**Inbound (client → server)**

| Action | Payload | Notes |
|---|---|---|
| `forfeit_run` (new) | none | Routed on the sender's record. Accepted from a member in play in a run; sets their health to 0. |

**Outbound (server → client)**

| Message | Change |
|---|---|
| `forfeit_run` (error reply) | `{message}` with `error` set, same shape as every refused hub-loop action |
| state broadcast, `end_game`, `world_entered` | unchanged; a chosen death is seen through them like any death |

## Out of Scope

- A retreat that keeps plunder or experience beyond what death keeps.
- Penalties, cooldowns or a record of chosen deaths.
- Dying by choice from the hub, the main menu, or by an escaped or already dead delver.
- Any change to how death is settled, ranked, rewarded or shown.
- A `forfeited` result value or any new event.
