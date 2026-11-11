# FS-MQYEX: Timed container opening

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Gameplay actions" → "Timed container opening"; `game-client/SPECIFICATION.md` "### Escape run" → "Progress shown while a container opens" → this FS · Related ADRs: [ADR-0060](../adr/0060-the-floor-map-is-sent-once-and-snapshots-are-cut-per-recipient.md) (snapshots are cut per recipient), [ADR-0064](../adr/0064-other-players-state-never-carries-their-bag-or-worn-gear.md) (what another player's state carries) · Interacts with: [FS-KE075](KE075-floor-1-dungeon.md) §J (guarded chests R57–R61; R60's "the coffer opens only on the state that shows the container open" is what this FS stands on), [FS-1D6BX](1D6BX-sacks-and-per-kind-container-views.md) (sacks, the per-kind roll and views), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) (drop piles), [FS-B3NDZ](B3NDZ-unified-countdown-bar.md) (the countdown look; it left cast and channel bars out), [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md) and [FS-3QHQZ](3QHQZ-forlorn-forest-and-branching-trails.md) (field containers, unchanged)

## Summary

In a run, a shut chest or sack no longer opens the instant a player reaches for it. The player
must stand at it for 1.5 seconds: a **timed open**, counted by the server. Moving, being hit, or
ending up out of reach cancels it, and nothing opens. A small bar over the container shows the
player how far along their own timed open is. Several players can work on the same container at
once; whoever finishes first opens it for everyone. Hub and field containers, drop piles, and
containers that are already open behave as they do today.

## Decisions folded from the charter (2026-11-11)

Charter "一樓壓力", option A. This FS was written `--from-thread`: the thread is the owner's locked
decisions, so no interview was held.

**Why (owner, playtest 2026-11-11).** Floor 1's chests are too easy. Players move at 200 and every
monster at 90–175, the open is instant, and monsters leash home, so a player circles the monsters
and opens the chest. Only chests in treasure rooms and pack halls are guarded (FS-KE075 §J); an
ordinary room's chest opens at once.

Locked decisions (owner approved 2026-11-11; each folded as a charter default with its reason):

- **L1, charter default: opening a shut container takes 1.5 s.** *Reason:* a player who outruns
  every monster needs no time at the chest today; 1.5 s standing still is long enough for a
  monster that was circled to arrive and strike.
- **L2, charter default: the server owns it.** The server starts the timed open on the reach,
  counts it on the tick and ends it; the client only draws it. *Reason:* the server is
  authoritative for every action in a run, and a client that timed its own open could skip it.
- **L3, charter default: it is cancelled when the player moves, takes damage, or leaves interact
  range.** *Reason:* these are the pressure itself. A chest cannot be opened while kiting or
  while being hit.
- **L4, charter default: chests and sacks on every floor of a run.** A drop pile, which is already
  open, has none. A container that is already open opens its view at once, as today. *Reason:*
  the wait guards the first open, where the loot is decided; a pile and an opened container hold
  what is already there.
- **L5, charter default: run worlds only.** Field and hub containers are unchanged. *Reason:* the
  playtest complaint is the Spire's; a field's chests restock and its deaths cost nothing.
- **L6, charter default: the guarded-chest rule is unchanged** (FS-KE075 §J). While a guard stands
  the reach is refused at once and no timed open starts; once every guard is dead the timed open
  runs. *Reason:* the guard rule answers "may it open", this FS answers "how long does it take".
- **L7, charter default: several players may open the same container at once**, each on their own
  timer. Nobody is refused because another is at it. The first to finish opens it, with the
  contents rolled once; every other player still at it stops and sees the contents too. A cancel
  affects only the player it happened to. *Reason:* a party should not queue at a chest, and one
  member being hit should not cost the others their progress.
- **L8, charter default: starting a timed open is not subject to the 100 ms per-container interact
  throttle** (`containerInteractedCache`). *Reason:* that throttle drops a second player's
  interact without a reply, which would silently break L7.
- **L9, charter default: the client shows a progress bar for the local player's timed open; a
  cancelled one shows no notice.** Taking loot follows today's rules. *Reason:* the bar vanishing
  with the chest still shut is the whole signal, as the refusal is for a guarded chest.

Derived here (chosen by the charter run where the locked decisions were silent; each overridable):

- **D1: the word is "timed open", never "channel".** *Reason:* in game-service a channel is a
  pod's copy of a field world and its `CONTEXT.md` forbids the bare word; on the client it is
  chat's. The owner's "channel" and this FS's "timed open" are the same thing.
- **D2: the timed open reaches the client in the per-tick state, on the recipient's own
  `current_player`, and nowhere else.** The code allows three ways:
  1. *An owner-only part of `current_player`* (picked). It repeats every tick, so a dropped frame,
     a reconnect or a spectating switch cannot leave the client with a stale bar; it follows the
     resource and parry parts already cut per recipient (ADR-0060); and it keeps R60's rule that
     the client believes only the state.
  2. *Discrete messages* (an `interact` reply at the start, another at a cancel). Rejected: a
     state frame a slow client cannot take is dropped, a message can be missed the same way, and
     the client would then have to time the bar itself, which L2 rules out.
  3. *A field on the container* naming who is at it. Rejected: it tells every recipient, grows
     every container entry, and nobody else draws it (D11).
- **D3: "moves" means the player's body is somewhere other than where it stood when the timed open
  started**, whatever moved it: walking, the warrior's dash, being shoved. A `move` message that
  moves nothing (zero velocity, or a wall in the way) cancels nothing. *Reason:* position is what
  the server owns; judging the message would cancel on a keystroke that went nowhere and miss a
  dash.
- **D4: "takes damage" means a hit lands and costs the player health.** A parried or refused
  strike costs none and cancels nothing; healing cancels nothing. *Reason:* every landed hit costs
  at least 1 health, so "lost health to a hit" is exact and needs no new event.
- **D5: "leaves interact range" is the reach's own measure**, 60 px from player to container
  (`DefaultInteractableRange`), and a container that is no longer in the world is out of range.
  *Reason:* one measure for starting and for staying.
- **D6: the time is simulation time, counted on the tick**, like the drink cooldown. A cancel
  cause on a tick is judged before the timer's end on that tick: a hit on the last tick still
  cancels. *Reason:* wall-clock timers beside the tick are how the throttle works today, and they
  cannot be judged in order with movement and combat.
- **D7: it also ends, silently, when the player is no longer in play** (dead, escaped, gone from
  the run) and on a floor change. *Reason:* it follows from D5 and from "only a player in play
  acts".
- **D8: one timed open per player.** Reaching for another shut container replaces it and starts
  from zero. Reaching again for the same one changes nothing. *Reason:* mashing E must neither
  restart nor shorten the wait.
- **D9: nothing else cancels.** Attacking, casting an ability that does not move the body,
  drinking, equipping, taking an item from an open container and using a door leave the timed
  open running. *Reason:* the owner named three causes. Flagged to the owner as an open question.
- **D10: the guards are asked once, at the reach.** *Reason:* a run's guards never come back, so
  a chest whose guards were all dead at the start cannot become guarded again before the end.
- **D11: nobody else is shown a player's timed open.** *Reason:* the owner asked for the local
  bar only, and another player's state carries only what everyone must see (ADR-0064).
- **D12: the per-player 100 ms interact throttle is unchanged** and a reach counts toward it as
  any interact does. *Reason:* the owner lifted only the per-container one.
- **D13: the client gives up a pending reach when its timed open ends with the container still
  shut, and when the player moves after a state has shown that timed open.** *Reason:* without
  it, a player who was hit out of a timed open and stayed put would have the view pop open later
  when a teammate finished, against "a cancel affects only the player it happened to" read from
  the other side.
  **Owner ruling, 2026-11-11 ("好那就用a"): "moves" is measured from the position in the first
  state that shows the player's own timed open on that container.** Between the E press and that
  state the client judges no change of position: it waits for the server's answer. *Reason:* the
  state the client holds at the E press can be older than the player's stop by a round trip. A
  player who pressed E just after stopping was then seen to "move" by the next state, the reach
  was given up, the server's timed open ran on, the bar filled, the chest opened and no view
  did. The server takes its own baseline where the body stands when the timed open starts (D3);
  the first state that shows the timed open is the client's nearest sight of that place.
- **D14: the open bar's look** (R24) is new art direction: FS-B3NDZ left channel bars out. It
  borrows the countdown's bar so the canvas keeps one bar look, fills instead of draining, and
  carries no number. *Reason:* 1.5 s has no whole seconds worth reading, and a fill reads as
  progress toward something.
- **D15: the duration is this FS's named tunable.** `Tunes FS-MQYEX` may change the 1.5 s, and
  the bar's size and offset, with no change section.

## Facts this spec rests on

Read in the code on 2026-11-11 (`feat/run-chest-open-channel`, cut from `fix/guarded-chest-coffer-waits`):

- **The open today.** `handleInteract` in `game-server/game-service/internal/game/session.go`,
  container branch: range check (refused `ErrOutOfRange` with a reply), guard check (refused
  `ErrContainerGuarded`, reason `container_guarded`), then `IsOpen = true` and, on the first open,
  `HasBeenOpened = true` and the roll for the container's kind (`rollChest`). A success sends no
  reply; the next state shows it.
- **The throttles.** The per-container one (`containerInteractedCache`) is checked first, for
  every kind of target. A refusal releases the container before the next action is applied; a
  success hands a 100 ms hold of the container, and of the player (`playerInteractedCache`), to
  sleeping goroutines. An action that meets either hold is dropped with an empty frame and no
  reply.
- **The tick.** Client actions are queued and applied at the start of each tick (`applyIntents`
  in `step`), then movement, projectiles, combat, deaths, interaction, elimination, the end rule.
  30 ticks a second (`constants.GameFrameRate`). The drink cooldown is counted the same way
  (`PotionComponent.CooldownRemaining`).
- **Damage.** Health is taken in one place, `CombatSystem.applyHit`
  (`internal/systems/combat.go`), and a landed hit costs at least `minimumDamage` (1).
- **In play.** `systems.InPlay` is the one test of whether a body may act; `handleInteract`
  refuses a player out of play before anything else.
- **Containers.** A run's chest or sack is created shut and never closes once open. A drop pile
  is created open and already rolled (`CreateDropPileEntity`). A field's chest closes again when
  it restocks (`forest_chests.go`); that is a field, and unchanged.
- **The state.** `types.CurrentPlayerState` is the recipient's own state, with owner-only parts
  beside it (`Resource`, `*ParryState`), filled by `internal/serializer/state_serializer.go` and
  cut per recipient. `types.ClientGameState.WorldType` says hub, run or field. The client's types
  are hand-written (`game-client/src/types/gameState.ts`); no HTTP, OpenAPI or proto is involved.
- **The client.** `BarrowspireScene.ts`: the E key calls `toggleChest`, which sends `interact`
  and, for a shut container, records `reaching`; `updateContainers` opens the view when the state
  shows that container open; the `interact` reply handler clears the reach on a refusal;
  `checkChestDistance` gives the reach up beyond 60 px. Notices are written in
  `game-client/src/ui/floor.ts`. `FieldScene` has its own container code and is not touched.
- **The bar.** `game-client/src/ui/countdownBar.ts` draws the one countdown bar
  (`drawCountdownBar`, 7 px, `palette.xpFill` on `palette.xpTrack`). The design guideline's
  "Countdowns" entry binds countdowns to it.

## Requirements

### §A. The timed open on the server

1. **Where it applies.** A timed open exists only in a run world, on every floor, for a **shut
   chest or sack**. A drop pile has none. A container that is already open has none. In the hub
   and in field worlds a container opens exactly as it does today.
2. **It starts on the reach.** When a player's `interact` on a shut chest or sack in a run is
   applied on the tick and passes today's checks in today's order (the player is in play, the
   container is within reach, no guard stands), the server starts that player's timed open on
   that container. The container stays shut and nothing is rolled. No reply is sent.
3. **Refusals are today's.** Out of reach is refused as today. A guarded chest whose guard stands
   is refused as today (`container_guarded`) and starts nothing. The guards are asked at the reach
   only (D10). A reach dropped by the per-player throttle starts nothing, as today (D12).
4. **The time.** A timed open lasts **1.5 s** of simulation time, counted on the tick from the
   tick that applied the reach. With the tick at 30 a second the container opens on the 45th tick
   after that one, never earlier. The duration is one named constant (D15).
5. **It completes.** When the time has passed, the container opens exactly as an open does today:
   it shows open, and on its first open its contents are rolled once for its kind; an empty roll
   leaves it open and empty. No reply is sent.
6. **Moving cancels.** If, after a tick's movement, the player's body is not where it stood when
   the timed open started, the timed open is cancelled (D3).
7. **A hit cancels.** If a hit costs the player health on a tick, the timed open is cancelled
   (D4).
8. **Leaving reach cancels.** If the player is farther than the interact range from the
   container, or the container is no longer in the world, the timed open is cancelled (D5).
9. **Out of play ends it.** A player who dies, escapes or leaves the run has no timed open from
   that tick. A floor change ends every timed open (D7).
10. **Cancel before complete.** On one tick, R6–R9 are judged after that tick's movement and
    combat and before R5. A timed open cancelled on its last tick opens nothing (D6).
11. **A cancel is silent and private.** A cancelled timed open opens nothing, rolls nothing, sends
    no reply, and changes nobody else's timed open. The player may reach again at once; the new
    timed open starts from zero.
12. **One per player.** A player has at most one timed open. A reach for a different shut
    container replaces it, from zero. A reach for the container the player is already opening
    changes nothing: the time neither restarts nor shortens (D8).
13. **Nothing else cancels** (D9).

### §B. Several players at one container

14. **Each on their own timer.** Any number of players may have a timed open on the same
    container. Each started when that player reached and is cancelled only by what happens to
    that player.
15. **No per-container throttle on the start.** A reach for a shut chest or sack in a run neither
    checks nor takes the per-container interact throttle. Two players' reaches for one container,
    applied on the same tick or within 100 ms of each other, each start a timed open. Every other
    interact (a door, a switch, an item, the stairs, an escape door, an open container, any
    container in the hub or a field) keeps the throttle as it is.
16. **The first to finish opens it.** The first timed open to complete opens the container, with
    one roll. On that tick every other timed open on that container ends. Two that complete on
    the same tick open it once.
17. **Everyone sees the contents.** The container shows open, with its items, in the state of
    every recipient whose snapshot holds it, as any open container does today.

### §C. What the client is told

18. **The recipient's own timed open rides their state.** While a player has a timed open, their
    `current_player` carries:

    | Field | Type | Meaning |
    |---|---|---|
    | `timed_open.entity_id` | string (uuid) | the container being opened |
    | `timed_open.elapsed` | number, seconds | simulation time counted so far |
    | `timed_open.duration` | number, seconds | the time it takes (1.5) |

    The key `timed_open` is absent when the player has none, and always absent in the hub and in
    field worlds.
19. **Only the owner is told.** No other player's state, and no container's, carries anything
    about a timed open (D11). No lock, flag or timer is added to `containers[]`.
20. **No new message.** A start, a completion and a cancel send nothing of their own. No HTTP,
    OpenAPI, proto or generated-client surface changes.

### §D. The client

21. **The reach waits for the state, as today.** The E key on a shut container sends `interact`
    and opens no view. The view opens on the state that shows the container open while the reach
    is pending (FS-KE075 §J R60). An already-open container opens its view at once, as today.
22. **The open bar.** While the state's `current_player.timed_open` names a container the client
    draws, the client draws the **open bar** for it, filled to `elapsed / duration`. Between
    states the fill may advance with real time so it reads smooth, never past full, and each
    state corrects it. The bar never opens anything: at full it waits for the state.
23. **It goes with the timed open.** When the state carries no `timed_open`, the bar is gone, with
    no notice, sound or effect, whether the container opened or the timed open was cancelled.
24. **The bar's look.** In the world, centred over the container, 10 px above its sprite; 44 px
    wide and 7 px high; the countdown bar's charcoal track, bright-brass fill and brass rim, drawn
    through the shared `countdownBar` drawing; filling from the left, the left end anchored; no
    number. The design guideline gains an "Open bar" entry beside "Countdowns" saying so, and
    that it is not a countdown (D14).
25. **Only one's own.** The client draws no bar for another player, and none while spectating.
26. **Giving up a reach.** A pending reach ends, and no view will open for it, when:
    - the server refuses it (as today);
    - its container is no longer in the state, or the state has the player farther from it than
      the interact range (as today);
    - a state has shown the player's timed open on that container, and a later state has the
      player's own position different from the one in the **first** state that showed it;
    - a state has shown the player's timed open on that container, and a later state shows none
      while the container is still shut.

    Between the E press and the first state that shows the timed open, the client judges no
    change of position: it waits for the server's answer. A state that shows the container open
    is read first: a player whose timed open ended because a teammate finished gets the view
    (D13).
27. **Nothing else on the client changes.** Taking items, the per-kind views, the "It will not
    open." notice, the field scene and the hub are as they are.

## User Stories

1. As a player, I want a shut chest in a run to take a moment to open, so that getting to the loot means holding ground, not outrunning monsters.
2. As a player, I want to see a bar fill while I open a container, so that I know it is working and how long is left.
3. As a player, I want to break off by walking away, so that I can abandon a chest the moment it gets dangerous.
4. As a player, I want a monster's hit to stop my open, so that I understand I must deal with the monster first.
5. As a player, I want to reach again straight after being interrupted, so that I am not locked out of the chest.
6. As a player, I want a cancelled open to say nothing, so that the screen is not full of notices in a fight.
7. As a player, I want a sack to take the same time as a chest, so that there is one rule to learn.
8. As a player, I want a monster's drop pile to open at once, so that picking up a kill's loot is not slowed.
9. As a player, I want a container that is already open to show its contents at once, so that coming back for what I left costs nothing.
10. As a player, I want the wait on every floor of a run, so that the rule does not change as I climb.
11. As a player, I want hub and field containers to open as they always have, so that only the Spire's chests ask this of me.
12. As a player, I want a guarded chest to refuse me at once while a guard stands, so that I do not stand through a wait that cannot succeed.
13. As a player, I want the wait to start on my first reach once the last guard has fallen, so that the fight is the only gate before it.
14. As a party member, I want to open a chest alongside a teammate, so that neither of us is turned away.
15. As a party member, I want to see the contents when a teammate finishes first, so that my time at the chest is not wasted.
16. As a party member, I want my open to keep going when a teammate is hit, so that one of us can finish while the other holds the monster.
17. As a party member, I want the chest to be rolled once however many of us opened it, so that nobody can double the loot.
18. As a player, I want pressing E again not to restart my open, so that an anxious second press costs me nothing.
19. As a player, I want to attack or drink a potion without losing my open, so that I can answer a threat without starting over, as long as I am not hit.
20. As a player who was interrupted, I want the chest's view not to pop open later when someone else opens it, so that a window never appears that I did not ask for.
21. As a player on a slow connection, I want the bar to match what the server counts, so that the chest never opens "early" or "late" against the bar.
22. As a player who reconnects mid-open, I want to see my bar where the server has it, so that I know whether to stay put.
23. As a player, I want the bar drawn over the container, so that it is clear which thing I am opening.
24. As a player, I want not to see other players' bars, so that the floor is not cluttered.
25. As a spectating player, I want no bar on my screen, so that nothing suggests I am acting.
26. As the server, I want to own the timer, so that a modified client cannot open a chest early.
27. As a developer, I want the duration to be one named constant, so that tuning it touches one line and needs no spec change.
28. As a developer, I want the timed open in the per-tick state, so that a dropped frame or a reconnect cannot leave a stale bar.

## Acceptance Criteria

**Server (`go test` in `game-server/game-service`)**

- [ ] In a run, a reach for a shut chest in reach with no guard leaves it shut and unrolled; with nothing else happening it is open and rolled on the 45th tick after the reach and not on the 44th. A sack does the same.
- [ ] In a run, a reach for a drop pile, and a reach for an open chest, behave as before this FS, and start no timed open.
- [ ] In a hub world and in a field world, a reach for a shut container opens it on that reach, as before this FS.
- [ ] A guarded chest whose guard stands is refused `container_guarded` and starts no timed open; with every guard dead the same reach starts one and it completes.
- [ ] A reach from out of range is refused as before and starts no timed open.
- [ ] A player whose position changes during a timed open (walking, and a dash) has none afterwards; the container is shut and unrolled.
- [ ] A `move` that does not change the player's position (zero velocity; a wall in the way) does not cancel.
- [ ] A hit that costs the player health cancels; a parried strike does not; a heal does not.
- [ ] A hit on the tick the timed open would complete cancels it: the container stays shut.
- [ ] A player who dies, escapes or leaves the run has no timed open; a floor change leaves none.
- [ ] After a cancel the same player's next reach starts a timed open from zero and it completes after the full 1.5 s.
- [ ] A second reach for the same container during a timed open neither restarts nor shortens it. A reach for another shut container replaces it from zero.
- [ ] Attacking, drinking and equipping during a timed open do not cancel it.
- [ ] Two players reaching for one shut container on the same tick both have a timed open; so do two reaching 50 ms apart.
- [ ] With two players at one container, cancelling one leaves the other's running to completion.
- [ ] When the first of two completes, the container is rolled exactly once, both players' timed opens are gone on that tick, and the container's items are in both players' states.
- [ ] `TestHandleInteract_Success_HoldsTheTargetBriefly` (a door) still passes: the per-container throttle is unchanged for every other target.
- [ ] A player with a timed open has `timed_open` `{entity_id, elapsed, duration}` on their own `current_player`, with `elapsed` rising tick to tick and `duration` 1.5; it is absent with none, absent from every other player's entry, and absent in hub and field states. `containers[]` entries are unchanged.
- [ ] `go test -race ./internal/game/... ./internal/systems/... ./internal/serializer/...` passes.

**Client (`npm test`, `npm run lint`, `npx tsc --noEmit` in `game-client`)**

- [ ] The E key on a shut container opens no view; a state with `timed_open` for it draws the open bar at `elapsed / duration`; a state showing the container open opens the view and removes the bar.
- [ ] A state without `timed_open`, the container still shut, after one that had it: the bar is gone, no notice is raised, the reach is given up, and a later state showing the container open opens no view.
- [ ] A state that both drops `timed_open` and shows the container open opens the view.
- [ ] E pressed while the held state still has the player at the place they were before they stopped: the next state has them stopped and shows their `timed_open` on the container, later states hold that position, and the state that shows the container open opens the view.
- [ ] After the first state that shows the player's `timed_open` on the container, a state with the player's own position changed gives the reach up, the container as near as before.
- [ ] Before any state shows that `timed_open`, a changed position within the interact range does not give the reach up; a state with the player beyond the interact range of the container, or without the container, does.
- [ ] The bar's fill never passes full and nothing opens without a state showing the container open.
- [ ] No bar is drawn from another player's state or while spectating.
- [ ] An already-open container's view opens at once on the E key; a guarded refusal still shows "It will not open." and no bar.
- [ ] `game-client/docs/design-guideline.md` has the "Open bar" entry (R24).

**Live check (two browsers, one run)**

- [ ] A shut chest takes about a second and a half to open, with the bar filling over it; walking off, and being hit, each stop it without a notice.
- [ ] Two players opening one chest both see it open when the first finishes.
- [ ] A guarded chest refuses at once while a guard stands, and opens through the timed open after the last guard falls.
- [ ] A drop pile and a hub or field chest open at once.

## Edge States

- **The reach is made while walking.** The timed open starts and is cancelled on the same tick
  (R6). No state ever shows it and nothing opens. The client has no answer to judge, so the
  reach is pending until the player is out of reach of the container or it leaves the state
  (R26); a teammate who opens it while the player is still in reach opens the player's view.
- **E is pressed within a round trip of stopping.** The state held at the press is older than
  the stop. The client judges no position until a state shows the timed open; that state's
  position is the baseline, the player holds it, and the view opens when the container does
  (R26, D13).
- **A hit and the last tick coincide.** The hit wins; the container stays shut (R10).
- **Two players finish on the same tick.** The first in the tick's order opens and rolls; the
  second finds it open and ends. One roll (R16).
- **A teammate finishes while the player is mid-open.** The player's timed open ends on that
  tick; the same state shows the container open, so their view opens (R16, R26).
- **A teammate finishes after the player was cancelled.** The player gave the reach up; no view
  opens. The chest is drawn open, and E opens its view at once (R26, R21).
- **The last guard dies during a refused reach's tick.** As FS-KE075 §J: a reach applied before
  the killing blow is refused; the next one starts a timed open (R3).
- **The player dies mid-open.** The killing hit cancels it; out of play ends it either way (R7,
  R9).
- **The floor changes mid-open.** The container is gone with the floor; the timed open ends, and
  nothing carries to the next floor (R9).
- **The player disconnects mid-open.** Nothing special: the timed open lives on the player's body
  and is judged by R6–R9 like any other. A player who reconnects while it still runs sees the
  bar from the next state; one whose body left the run has none.
- **A frame is dropped.** The next state carries the timed open again; the bar corrects (R22).
- **The reach is dropped by the per-player throttle.** As today, nothing starts and no reply
  comes; the reach is pending until the player is out of reach of the container or it leaves
  the state (R3, R26).
- **An empty roll.** The container opens empty and shows "(Picked clean)", as today (R5).
- **The container is out of the recipient's snapshot.** It cannot be: the player is within reach
  of it. If it is ever missing, no bar is drawn (R22).
- **A player out of play reaches.** Refused as today, before anything else (R2).
- **A client that does not know `timed_open`.** It draws no bar; the reach still waits for the
  state and the view opens when the container does (R21).

## Out of Scope

- Monster move speeds, leashing, the guard definition, new monsters, and loot rolls (owner).
- A timed open in the hub or a field world; on a drop pile; on an open container; on a door, a
  switch, the stairs or an escape door.
- Showing a player's timed open to anyone else; a lock, a flag or a timer on the container.
- A notice, sound or animation on a cancel or a completion; an opening animation for the coffer.
- Cancelling on an attack, a cast or a drink (D9); a way to cancel other than moving.
- Different durations per container kind, floor, class or item; anything that shortens the time.
- Any change to FS-KE075 §J, to the per-player interact throttle, or to the per-container
  throttle for other targets.
- HTTP, OpenAPI, proto, the generated client, any database, any other service.
