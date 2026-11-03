# FS-988SM: A random match forms a party for its run

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Party" → "A random match forms a party", "A matched party lasts only for its run" → this FS · Related ADRs: [ADR-0039](../adr/0039-a-matched-party-lives-only-for-its-run.md) (a matched party lives only for its run), [ADR-0035](../adr/0035-a-party-is-the-universal-instance-roster-ephemeral-and-locked-inside.md) (amended by ADR-0039), [ADR-0037](../adr/0037-party-state-lives-in-redis-membership-spans-pods.md) (party state in Redis)

> Terms follow `game-server/game-service/CONTEXT.md` § Party (**matched party**, **pre-formed
> party**, instance lock, seated) and § Seats. Decisions are charter defaults approved by Nick on
> 2026-11-03 (charter "單人排隊自動組隊"), marked "(charter #N)". Nick overrode #4 the same day:
> every matched player is a member from the run's initialisation, and one who never arrives is a
> disconnected member; those requirements carry an amendment mark. Later the same day Nick
> replaced R8's "leave the player out" with cancelling the whole match, and the party is now
> created before the run; those requirements carry a second amendment mark. After the code
> review the same day, R4, R9 and R17 were brought in line with the code, and Nick accepted a
> leader who is disconnected when the run starts (Edge States). This FS realises
> FS-BJNYC's Out of Scope entry "Random-match auto-party and its random leader".

## Summary

A player who queues alone with *Wait for company* and is matched with strangers now enters the
Spire in a party with them: the party frames show everyone, and party chat works for the whole
run. The party belongs to the run. A member leaves it when they leave the run, and it is gone
once the last of them has left, so everyone comes home party-less and can queue again at once.
Parties players form by hand are unchanged.

## Requirements

### Origin (game-service)

1. A party created from a random match (`find_game` → the matchmaker's `MatchStart`) is a
   **matched party** and carries a matched origin in its Redis record (charter #1). Every other
   party (made by `party_create` or an invite) is a pre-formed party, and nothing in this FS
   changes it: it persists after a run, and members resolved inside a run stay members
   (ADR-0035, FS-BJNYC R18).
2. The origin is set once at creation and never changes. It is not shown to clients and adds
   nothing to `party_update`.

### Creation on the host pod (game-service)

3. When the host pod receives a `MatchStart` (the hub loop's match case), it creates one matched
   party from **every matched player**: its local players (`ResolvedMatchedPlayers.LocalPlayers`)
   and the players on other pods (`ResolvedMatchedPlayers.HandoffPlayers`, from
   `MatchStart.Players` whose `Pod` is not the host's), before anyone's screen enters the tower. A
   new store script creates the party with all of them as members in one step. `Create` makes a
   party of one and is not reused. Membership is decided at initialisation, not by arrival.
   *(Amended 2026-11-03, charter; Nick: "其他人晚進或是關掉分頁對遊戲來說他都算進塔 他關掉只能當作斷線
   就算是host也一樣". Was: local players only, remotes joining when seated.)*
3a. **The party comes first, then the run.** The host runs the creation script **before**
   `CreateGameSession`, off the hub loop as every party write is (R17). When the script's result
   comes back, the run is created on the hub loop: on success it is created, `world_entered` goes
   to the local players and the other pods are told to hand theirs over, exactly as today; on a
   cancel (R8) none of that happens. The hub loop never blocks on Redis; entering the tower is
   delayed by one Redis round trip. *(Amended 2026-11-03, charter; Nick: "建立配對的時候發現他已經在隊伍的話
   是不是就取消這場遊戲跟所有人說配對失敗請重新配對". Was: the run first, the party after it.)*
4. The leader is chosen at random among the **local** players (charter #5): their records are
   on the host at initialisation, so the run's leader is never a player still travelling from
   another pod. The join order the script records is the leader first, then the other local
   players, then the players on other pods in `MatchStart` order. A local matched player whose
   record the hub cannot find when it resolves the match is in neither the run nor the party.
   **After the party script answers, the hub checks each local player again on its loop.** A
   local whose player record is gone, or now names a world other than the hub (they started a
   solo run or walked into a field during the round trip), is left out of the run and taken out
   of the party with reason `left` (R12). A local inside their reconnect grace whose record is
   still in the hub goes into the run as a disconnected member (R7). If no local is left, no run
   starts: the members are removed quietly, with no `party_update` (R19), and every matched
   player gets R8a's refusal. The leader may therefore be a local who is disconnected when the
   run starts; this is accepted (Edge States, "The random leader is disconnected when the run
   starts"). *(Amended 2026-11-03, charter, after code review; Nick, as R7: "就算是host也一樣";
   on a disconnected leader, Nick: "那就先不處理". Was: a local the hub drops at resolution because
   they are no longer connected is not in the run, so not in the party.)*
5. The pod remembers the run's party the way a party entry does: `partyRuns[run.ID] = {partyID,
   roster}` (party_entry.go). From that moment the instance lock (FS-BJNYC R19) applies to the
   matched party exactly as to a party that entered from the gate.
6. **A late arrival is simply entering.** A player on another pod is a member from R3 while
   they travel. Being seated (`SeatArrival`, FS-K2HKP) adds nothing to the party; it is them
   entering the tower they already count as in. If the creation update did not reach them on
   their old pod, the host's reconcile shows them the party on arrival (reason `sync`, FS-NCC9J
   R21a). *(Amended 2026-11-03, charter; Nick, as R3. Was: a new join-on-seating script.)*
7. **A member who never arrives is a disconnected member.** Not connecting after the match, or
   closing the tab in transit, is a disconnect like any other, host players included. A seated
   member who disconnects has the run's reconnect grace (30 s, 10 s going-away). A member who was
   never seated can come back until their seat is released at 15 s (FS-K2HKP R25, unchanged);
   after that the host refuses them. **When a disconnected member can no longer come back, they
   count as dead and leave the run, and so the party** (R11). For a never-seated member, the seat
   release is that moment: the session reports the released members, and each is removed with
   reason `left`, with succession if they led (R13). *(Amended 2026-11-03, charter; Nick:
   "超過時間還沒連回來被釋放當然就當死掉了". Was: a no-show never joins, and nothing removes them.)*
8. **A matched player already in a party cancels the match.** If, when the script runs, **any**
   matched player, local or remote, already has a party (their `player:<id>:party` pointer names
   a live party; a race the queue refusals should prevent: FS-BJNYC R1, FS-NCC9J's `queued`), the
   script writes nothing and reports the cancel. The match is cancelled: no party, no run, no
   `world_entered`, no handoff announcement. Nobody moves; the remote players never leave their
   pods. The pod logs the cancel at Warn with the players found in a party. The script never moves
   anyone out of another party. *(Amended 2026-11-03, charter; Nick, as R3a. Was: that player
   is left out and plays the run outside the party.)*
8a. **Everyone is told the match failed.** Every matched player, the one already in a party
   included, gets the existing refusal message that `find_game` refusals use (action `find_game`,
   the words in `error` and `payload.message`; no new message type) reading "The match failed.
   Queue again." The host sends it to its local players directly. Remote players are told
   through the pod inbox, with a new letter kind (internal, between pods; not a WebSocket message)
   that their own pod turns into the same refusal. The match already took them out of the queue;
   they are not queued and must queue again themselves. Nobody is re-queued automatically: that
   would touch the matchmaker (Out of Scope). *(Added 2026-11-03, charter; Nick, as R3a.)*
9. **A Redis failure is not a cancel.** A creation that fails on Redis, so that whether anyone is
   in a party cannot be known, is logged at Warn and the run is created and goes on without a
   party. A removal that fails on Redis is logged at Warn, tried again (R17), and the run goes
   on. A run never fails because of its party. *(Amended 2026-11-03: "or join" became "or removal", as no join script
   exists any more. Amended again 2026-11-03, charter default B: a Redis error keeps the run; only
   a player found in a party cancels it, R8.)*
10. If the matched players exceed the party size, the first ones up to the size are members (the
    leader always among them) and the rest play outside the party. Match size (2) does not exceed
    the party size (2) today; this only guards a later change to either.

### Leaving with the run (game-service)

11. A matched party member leaves the party **at the moment they leave the run** (charter #3,
    ADR-0039). Leaving the run is any of:
    - a dead delver leaving early through `LeaveRun` (FS-QPDKN R13, R14);
    - the run ending, for everyone `ReturnPlayersToHub` moves, and for anyone kept only for
      settlement (`forgetIfAwaitingSettlement`);
    - their reconnect grace running out (`cleanUpPlayerCompletely`), whether their record is
      deleted or kept for the run's settlement;
    - their seat being released before they ever arrived (R7). *(Added 2026-11-03, charter.)*
12. Leaving uses the existing remove script with reason `left`. It is not a voluntary
    `party_leave`, so the instance lock does not refuse it. Voluntary `party_leave`, kick,
    transfer and settings changes stay refused inside the run (FS-BJNYC R19).
13. When the leader leaves the run, the remove script's existing rule applies: the
    earliest-joined remaining member leads at once (charter #3a; FS-R82NV R19, FS-BJNYC R17).
    FS-BJNYC's drop-time succession inside the run keeps working as it does.
14. The last member leaving ends the party, by the remove script's existing rule. That member's
    own update reads `dissolved` (charter #6).
15. **Leaving the run is the boundary, not death.** A dead or escaped member who stays to watch
    (FS-QPDKN) is still a member: they keep the party frames and party chat. An escaped member
    cannot leave early (`Depart` refuses `ErrEscapedWaits`), so they stay a member until the run
    ends.
16. **A watching member receives nothing** (charter #3b). They get no XP for a kill (FS-BDA7X pays
    the living, un-escaped) and no item: a dead member cannot pick anything up, and FS-V780R's
    allocation (when built) draws only living, un-escaped members. This FS adds no logic for it;
    acceptance criteria pin it.
17. Leaving is applied off the world's tick and off the hub loop's hot path, on the party
    registry's loop, as every party write is (party.go). **A remove Redis fails is kept and tried
    again on the registry's tick** until the script answers: the first failure is logged at Warn,
    at most 8 waiting removals are tried per tick, and at most 64 are kept, past which a new
    failure is logged at Warn and given up. Quiet removals (a match left with no run, R4) are kept
    and retried the same way, and stay quiet. TTL is no safety net here: the party cache keeps
    re-reading the party while a seated member is online, which keeps their pointers alive, so a
    lost remove would otherwise leave them in the matched party, refused `find_game` in town
    (R21). *(Amended 2026-11-03, after code review. Was: a lost remove ends with their record
    expiring by TTL.)*
18. A matched party member who reconnects within the grace has not left the run and is still a
    member. So is a member still in transit before their seat is released, and a disconnected
    member inside their grace, host player or not. *(Amended 2026-11-03, charter; as R7.)*

### Notices and client (both)

19. Creation sends every member a `party_update` with reason `joined` (charter #7); a member in
    transit sees the party on arrival (R6). A seated arrival sends nothing: they were already a
    member. *(Amended 2026-11-03, charter; was: each seated arrival sends `joined`.)* Each
    departure, a released seat included, sends the remaining members `left`, and
    the leaver an update that no longer lists them. The end sends `dissolved` (charter #6). A
    cancelled match sends no `party_update` at all, only R8a's refusal. No new message type and no
    new reason. *(Amended 2026-11-03, charter: the cancel line.)*
20. Party chat's join and leave lines come from these updates as they do today (FS-XGW7H).
21. After leaving, the player is in town with no party and may `find_game` again at once
    (charter #9): FS-BJNYC R1's party-member refusal no longer applies to them.
21b. **A timed-out member who connects again has no tie to the run, and no party.** A matched
    member whose seat was released (R7) or whose reconnect grace expired (R11) counts as dead, and
    their membership ended at that moment. If they connect again later, they land in their pod's
    village as today (FS-K2HKP story 10, the `4002` refusal; FS-QPDKN story 19). They are not in
    the matched party: no party frame shows it, no Redis party pointer for them still names it,
    and `find_game` queues them at once. *(Added 2026-11-03, charter; Nick: "死亡的人在連回來後就只會在村莊
    跟塔沒任何關聯了".)*
22. The loot rule of a matched party is the party default, random allocation (charter #8). It
    cannot be changed inside the run (instance lock), and the party is gone after it.
23. The client needs no change (charter #10): `partyStore.apply` already lets the party go on an
    update that no longer lists this player or reads `dissolved`. If manual testing shows a gap,
    only text is added.
24. **On R8a's refusal the queue panel returns to not queued.** The corner queue panel and the
    door's queued line clear, and *Wait for company* can be pressed again. If today's client keeps
    showing the queued state on a `find_game` refusal that arrives after `queue_status`, the fix is
    the smallest client change that clears it (charter default C). *(Added 2026-11-03, charter.)*

## User Stories

1. As a player who queued alone, I want to be in a party with the strangers I was matched with, so that I can see them in my party frames during the run.
2. As a matched player, I want party chat with my run-mates, so that we can coordinate without shouting in area chat.
3. As a matched player, I want the party to disappear when I leave the run, so that I come home without a group I never chose.
4. As a matched player, I want to queue again as soon as I'm back in town, so that a leftover party never blocks my next delve.
5. As a matched player who died and left early, I want to leave the party then, so that I stop hearing a run I'm no longer in.
6. As a matched player who died and stayed to watch, I want to keep party chat, so that I can still talk to my run-mates while I watch.
7. As a matched player who died and stayed to watch, I want to know I receive nothing from the run, so that nobody accuses me of leeching.
8. As a living matched player, I want XP and loot to go only to those still playing, so that the rules match a party I formed myself.
9. As a matched player, I want a leader at once, so that the run always has someone in charge.
10. As a matched player, I want the lead to pass to the next member when the leader leaves the run, so that the party is never leaderless while it lasts.
11. As a matched player on another pod, I want to be in the party from the moment we are matched, so that arriving a few seconds late changes nothing. *(Amended 2026-11-03.)*
12. As a matched player whose partner never arrived, I want them out of the party once their seat is released, so that the frames show who is really there. *(Amended 2026-11-03.)*
12a. As a matched player who closes the tab, host or not, I want to be treated as disconnected like anyone else, so that the rules don't depend on which pod I was on. *(Added 2026-11-03.)*
13. As a matched player who dropped and reconnected in time, I want to still be in the party, so that a blip doesn't cost me my group.
14. As a matched player whose grace ran out, I want to be out of the party, so that my run-mates' frames don't show a member who is gone.
15. As a player in a party I made myself, I want nothing about it to change, so that my friends and I still come home together.
16. As the owner of the matchmaker, I want it untouched, so that my hand-coded queue keeps working as written.
17. As the instance, I want the matched party locked like any party inside a run, so that nobody kicks or reshuffles strangers mid-delve.
18. As the run, I want to go on even when Redis refuses the party, so that a party failure never costs a delve. *(Amended 2026-11-03: a Redis error, not a player found in a party.)*
19. As the party chat, I want my audience to be exactly the current members, so that a player back in town no longer hears the run.
20. As a matched player, I want a match containing someone already in a party to be called off and to be told plainly, so that no run ever mixes a pre-formed party into a random match. *(Added 2026-11-03.)*
21. As a matched player whose match was called off, I want my queue panel to show I'm no longer queued, so that I know to press *Wait for company* again. *(Added 2026-11-03.)*

## Acceptance Criteria

- [ ] A match whose players are all local to the host creates one matched party with every matched player as a member, its leader one of them, and each member receives `party_update` `joined`.
- [ ] A match with players on other pods creates one matched party at initialisation with every matched player as a member, local and remote, before anyone is seated; the leader is always a local player. *(Amended 2026-11-03.)*
- [ ] The matched origin is in the Redis record and nowhere in any message.
- [ ] A remote member being seated adds nothing to the party and sends no `joined`; they see the party on arrival. *(Amended 2026-11-03.)*
- [ ] A remote member whose seat is released (never arrived) leaves the party: the others receive `left`, and if they led, the earliest-joined remaining member leads. *(Added 2026-11-03.)*
- [ ] A member in transit, or disconnected inside their grace (host player or not), is still a member. *(Added 2026-11-03.)*
- [ ] A match in which any matched player (local or remote) already has a party is cancelled: the script writes nothing, no run is created, no `world_entered` is sent, no handoff is announced, nobody is removed from their own party, and the pod logs a Warn. *(Amended 2026-11-03, R8. Was: that player is left out.)*
- [ ] On a cancel, every matched player, the one in a party included, receives the `find_game` refusal "The match failed. Queue again.": local players from the host directly, remote players from their own pod through the new inbox letter. None of them is queued afterwards. *(Added 2026-11-03, R8a.)*
- [ ] The run is created only after the creation script answers success; on a cancel no session exists for the match. *(Added 2026-11-03, R3a.)*
- [ ] A Redis failure on create (whether anyone is in a party unknown) is logged at Warn, and the run is created and plays normally without a party; a Redis failure on removal is logged at Warn and the run plays on. *(Amended 2026-11-03, R9.)*
- [ ] After a cancel the client's queue panel shows not queued and *Wait for company* can be pressed again. *(Added 2026-11-03, R24.)*
- [ ] Inside the run, `party_leave`, `party_kick`, `party_transfer` and a loot-rule change from a matched member are refused exactly as for a gate-entered party.
- [ ] A dead member who leaves through `LeaveRun` is removed from the matched party: the others receive `left`, the leaver receives an update that no longer lists them, and they are in town party-less.
- [ ] When the leader leaves the run, the earliest-joined remaining member leads at once and every remaining member is told.
- [ ] At the run's end, every member still in the run leaves the party as they are returned to the hub, and the last one's update reads `dissolved`.
- [ ] A member whose reconnect grace runs out (either branch: record deleted, or kept for settlement) leaves the party.
- [ ] A member who reconnects within the grace is still a member.
- [ ] A dead member who stays to watch is still a member and still receives party chat.
- [ ] A dead or escaped member who stays to watch receives no XP when a living member kills a monster, and no item reaches their bag.
- [ ] An escaped member stays a member until the run ends (they cannot leave early).
- [ ] A player back in town after a matched run can send `find_game` and is queued, not refused as a party member.
- [ ] A matched member who timed out (seat released, or grace expired) and connects again later lands in the village with no party: no party frame, no Redis party pointer naming the matched party, and `find_game` queues them. *(Added 2026-11-03, R21b.)*
- [ ] A pre-formed party that enters from the gate behaves exactly as before: it persists after the run, and members who die or escape stay members until it does.
- [ ] No file under `internal/matchmaker` or `internal/match_queue` changes, and no new WebSocket message type or `party_update` reason is added.
- [ ] The client needs no change, or only text: the frames clear on the leaver's update and on `dissolved`.

## Edge States

- **The host has one local matched player:** the party starts with every matched player, that local player leading. *(Amended 2026-11-03.)*
- **The leader leaves the run while the others are still in transit:** the others are already members (R3), so the earliest-joined remaining member leads and the party goes on. The earlier edge "the host's only local player leaves before any remote is seated, so later arrivals play party-less" no longer exists, because remotes are members from initialisation. *(Amended 2026-11-03.)*
- **Everyone remote is a no-show:** at 15 s each released member leaves (`left`), leaving the local players. *(Amended 2026-11-03.)*
- **A local matched player is gone before the run is created:** once the party script answers, the hub checks each local again (R4). One whose record is gone, or now names a solo run or a field, is left out of the run and taken out of the party with `left`. One who only dropped and is inside their reconnect grace, record still in the hub, goes into the run disconnected (R7), host player or not. If every local is gone, no run starts, the members are removed quietly (no `party_update`, R19), and every matched player gets R8a's refusal. *(Added 2026-11-03. Amended 2026-11-03, charter, after code review. Was: the hub drops them at resolution because they are no longer connected.)*
- **The random leader is disconnected when the run starts:** the leader is drawn among the local players, and one inside their reconnect grace is one of them (R4, R7). FS-BJNYC's drop-time succession inside the run does not fire, because they dropped before the run, so they stay leader, disconnected, until they reconnect or their grace ends (at most 30 s). Then the remove script's succession passes the lead (R11, R13). Accepted on purpose (Nick, 2026-11-03: "那就先不處理"): inside the run the instance lock refuses kick, transfer and settings, and a matched party ends with its run, so a matched party's leader has no power that matters. *(Added 2026-11-03, charter, after code review.)*
- **Two members leave in the same tick:** the remove script serializes them. One leaves with `left`, and the last one's update reads `dissolved`.
- **A member leaves while their remove is in flight and the run ends:** the second remove finds them gone (`not_member`), which is success for leaving.
- **Redis is down for the whole run:** no party, no frames. The run plays. Creation is not retried. Each removal that fails, quiet ones included, is kept and tried again on the registry's tick (at most 8 per tick, 64 kept) until the script answers (R17), so a member who left is taken out once Redis is back. *(Amended 2026-11-03, after code review. Was: nothing is retried.)*
- **The host pod dies mid-run:** the run is gone. The party's records lapse by TTL as any party's do (ADR-0037).
- **A member reconnects to another pod:** FS-MCYWK's reconnect to the holding pod applies; they are still in the run, so still a member.
- **Race with an invite between match and run creation:** the match is cancelled and everyone is told (R8, R8a). *(Amended 2026-11-03.)*
- **No local player can lead because every local is already in a party:** this edge no longer exists. Any matched player already in a party cancels the match (R8), so a party is only ever created when every local player is free to lead. The first pass's "no party, the run goes on" placeholder is gone. *(Amended 2026-11-03.)*
- **A remote player's pod is unreachable when the cancel letter is sent:** the letter is lost like any inbox letter; that player stays in their village unqueued with no refusal shown. The local players still get theirs. Nothing is retried. *(Added 2026-11-03.)*
- **Match size grows past the party size later:** R10.

## Out of Scope

- The matchmaker and `match_queue` (user-owned; FS-0XMCP R14, FS-K2HKP).
- Match size.
- "Every run is a party": a solo run (`start_solo`) stays party-less (FS-BJNYC Out of Scope).
- Any new WebSocket message type, `party_update` reason, or client-visible origin. (R8a's new
  inbox letter kind is internal between pods, not a WebSocket message.)
- Re-queueing the players of a cancelled match automatically: it would touch the matchmaker.
  They queue again themselves (R8a). *(Added 2026-11-03.)*
- Changing pre-formed parties' lifetime or membership rules.
- Keeping a matched group together after the run, or offering to convert it to a pre-formed party.
- FS-V780R's loot allocation itself (still a draft). Note for when it is scoped: its candidates
  ("alive and un-escaped") should also exclude disconnected members.
- **XP for a disconnected member inside the grace.** Nick, 2026-11-03: "那經驗值先維持吧". This
  is a deliberate decision to keep today's behaviour, not an oversight: under FS-BDA7X a
  disconnected member whose body is still in the run gets kill XP, because `kill_experience.go`
  pays every `InPlay` player and `InPlay` does not look at the connection. Changing it touches
  every run, not only matched ones, so it belongs to its own item.
- Seat timing and FS-K2HKP's seat release (15 s); a never-arrived member is not given the 30 s
  reconnect grace.
