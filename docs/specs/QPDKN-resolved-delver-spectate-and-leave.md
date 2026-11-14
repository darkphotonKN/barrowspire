# FS-QPDKN: Resolved delver spectate and leave

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Escape run" (spectate living teammates after resolving · leave a run early after dying · hold the run result until the delver returns); `game-server/game-service/SPECIFICATION.md` "### Session & matchmaking lifecycle" (leave a run early after dying · resolved delvers settle with the run despite leaving or disconnecting · a dead player's disconnect counts as leaving the run, added 2026-11-03 · an escaped player cut off from their run waits in the village until it settles, added 2026-11-03; `game-client/SPECIFICATION.md` "### Escape run": told why entry waits while a run settles, added 2026-11-03) → this FS · Related ADRs: [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (one connection across worlds), [ADR-0004](../adr/0004-game-traffic-bypasses-the-application-gateway.md) (game-service owns the WebSocket contract) · Builds on: [FS-77AB6](77AB6-monsters-and-combat.md) §Requirements 17 (resolved delvers stay out of play; this FS adds the early leave R17 listed as out of scope), [FS-29KSH](29KSH-hub-world-and-delve-entry.md) (return to the hub, `world_entered`), [FS-BDA7X](BDA7X-character-leveling.md) §Requirements 22–24 (run progress), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) ("death loses everything") · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md), [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (*spectate*, *watched delver*, *leave early* pending via domain-model) · Amended 2026-11-02 (charter, after ship): an escaped delver gets a bottom-centre *Watch the delve* button instead of a card (R1, R3, R12, Edge States), and game-service keeps sending an escaped delver their own state until the run ends (R24) · Amended 2026-11-03 (charter "死亡斷線視同離開"; Nick: "他斷線就當他按下離開了"): a dead delver's disconnect is a leave (R25); the keep-in-run-past-grace rule (R18, R19) and the reconnect-into-the-run path (R12) now apply to an escaped delver only · Amended 2026-11-03 (charter addendum; Nick: "逃出的人不能離開 是因為斷線被退出隊伍才不得已回村莊的", "斷線被踢出隊伍就會先回村莊"): an escaped delver who can no longer come back (grace run out, or a normal close at once) is released to the village with their body kept for settlement (R29–R31), and a released player can't enter any world that takes their gear until that run settles (R32–R36); R19 now applies to nobody · Amended 2026-11-03 (after code review; Nick: "好"): R35's fail-open is confirmed, and two settling gaps are accepted until escape-time settlement ships (Edge States, Out of Scope)

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
   *(Amended 2026-11-02, charter; Nick: only the dead delver gets a card. An escaped delver gets
   the button of R3 instead (charter default (Nick approved 2026-11-02); reason: "單純出現觀看按鈕").)*
2. **The dead delver's card** carries grim copy (the existing "The barrow keeps you" line is
   acceptable) and **two buttons**: *Watch the delve* and *Leave the barrow* (final copy per
   `game-client/CONTEXT.md` lore voice; "leave" here is the delver's own word for returning
   to the hub).
3. **The escaped delver's card** carries congratulatory copy ("You are out of the barrow"
   register; grim and terse, not triumphant) and **one button**: *Watch the delve*. There is
   no leave button for an escaped delver (see *Out of Scope*).
   *(Amended 2026-11-02, charter; Nick: in a multiplayer run an escaped delver saw no card and
   no button, only the "escaped successfully" line, because the state broadcast dropped their
   `current_player` (R24). Superseded as follows, each a charter default (Nick approved
   2026-11-02):
   (a) an escaped delver with a teammate still in play gets **no card**, only a *Watch the delve*
   button at the bottom centre of the screen; pressing it enters the existing spectate (R7–R9:
   the "Watching <name>" HUD at the top, Tab to cycle). Reason: Nick, "單純出現觀看按鈕".
   *(Amended again 2026-11-02, Nick: "觀看按鈕往上移動一些 大概200px" — the button stands 200 px
   above the bottom margin, still centred across.)*
   (b) The "escaped successfully" notification line stays; it is how the escaped delver is told
   they made it. Reason: it already says so, and no card replaces it.
   (c) The client reads the escape from `current_player.escape === true`. Reason: the wire shape
   R24 restores, so the client slice does not wait on the server's.
   (d) Still no leave button for an escaped delver, and with no teammate in play no Watch button
   shows (the run ends). Reason: as this FS already says (R10, *Out of Scope*, Edge States).
   (e) The dead delver's card (Watch + Leave, R2, R10) is unchanged. Reason: already working.)*
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
    reaches. *(Amended 2026-11-02, charter; Nick: for an escaped delver the rebuild reaches the
    bottom-centre Watch button of R3, not a card. Charter default (Nick approved 2026-11-02);
    reason: follows R3.)*
    *(Amended 2026-11-03, charter; Nick: 他斷線就當他按下離開了. A reconnect mid-run returns only an
    **escaped** delver to the run (to the Watch button). A dead delver's drop already took them out
    of the run (R25), so their reconnect lands in the village and the rebuild is the hub's. Was: "A
    reconnect mid-run returns the delver to the card (R1)", for dead and escaped alike.)*
    *(Amended 2026-11-03, charter addendum; Nick: 斷線被踢出隊伍就會先回村莊. An escaped delver is
    returned to the run only by a reconnect **inside their grace** (R30). Once released (R29), their
    reconnect lands in the village and the rebuild is the hub's. Was: "A reconnect mid-run returns
    only an escaped delver to the run", at any time before the run ends.)*

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
    *(Amended 2026-11-03, charter; Nick: 他斷線就當他按下離開了. For a dead delver, a dropped
    connection is a leave at the moment of the drop (R25), so their body stays here as it does for
    R14. "Dropped past its reconnect grace" now describes an escaped delver only. Was: "whether they
    left early (R14) or their connection dropped past its reconnect grace", for any resolved
    delver.)*
    *(Amended 2026-11-03, charter addendum; Nick: 斷線被踢出隊伍就會先回村莊. An escaped delver's body
    also stays when they are released (R29), which now covers a normal close (code 1000) too. Today
    that close removes the run body and loses their settlement; R29 ends that.)*
19. **A resolved delver's record stays in the run until the run ends** when their connection
    drops past its grace. Their player record is not deleted at grace end; it is deleted when
    the run ends if they have not reconnected by then. A reconnect before the run ends finds
    `CurrentGameSessionId` naming the run and lands them back in it (R12). A reconnect after
    the run ends is a fresh connect, as today, with the run already settled.
    *(Amended 2026-11-03, charter; Nick: 他斷線就當他按下離開了. This requirement now applies to an
    **escaped** delver only: they are still waiting on their plunder, and a reconnect returns them
    to the run to watch. A dead delver never reaches it: their drop is a leave (R25), so their record
    already names the hub. Was: "A resolved delver's record …", for dead and escaped alike.)*
    *(Amended 2026-11-03, charter addendum; Nick: 逃出的人不能離開 是因為斷線被退出隊伍才不得已回村莊的.
    **This requirement now applies to nobody.** An escaped delver who doesn't reconnect within their
    grace is released (R29): body kept, record out of the run, marked settling. Their record is no
    longer kept in the run until it ends. Was: an escaped delver's record kept in the run until its
    end, with a reconnect at any time before then returning them to the run.)*
20. **A delver still in play who drops is unchanged**: grace, then removed from the run, as
    today.
21. **The run sends only to members still in it.** Once a dead delver has left (R14) their
    record names the hub, and the run's per-tick state, `end_game`, and any other run message
    must not reach them. The run keeps their body (R18) but drops them from its recipients.
22. **The run-end return goes only to members still pointing at the run.** `ReturnPlayersToHub`
    moves a member to the hub only if their record's `CurrentGameSessionId` is this run. A
    member who left early is already in the hub, and may have queued for or entered a new run
    meanwhile (default taken: leaving early does not block queuing again); the old run's end
    must not pull them out of it. *(Amended 2026-11-03, charter addendum: a released escaped
    delver is the exception. They can't enter another world before this run settles (R33), so the
    old run's end never finds them in a new run.)*
23. **Position and result are unchanged by leaving.** A dead delver who left early keeps the
    elimination index they died with, and their `end_game` payload would have said
    `eliminated`; since they no longer receive it (R21), the record of it is the `match.ended`
    event only.

### An escaped delver still sees themselves (game-service)

*(Added 2026-11-02, charter; Nick: "死亡有可以看 但成功逃離卻沒有可以觀戰的按鈕". The state
serializer skipped an escaped player entirely, so their own frame carried `current_player: null`
and the client could not tell it had resolved, so R3 never showed.)*

24. **An escaped delver keeps receiving their own state until the run ends.** Each tick, an
    escaped delver's frame carries their own `current_player` with `escape: true`, sent to them
    alone, the way a left-behind dead delver sees only themselves (FS-F6F88 §Requirements 15).
    Charter default (Nick approved 2026-11-02); reason: the client needs it to know it escaped.
    Other delvers still do not see an escaped delver: they are absent from `other_players`, no
    body is drawn for them, and `escaped_count` is unchanged. Charter default (Nick approved
    2026-11-02); reason: they have left the barrow. No new action, and no change to when the run
    ends.

### A dead delver's disconnect is a leave (game-service)

*(Added 2026-11-03, charter "死亡斷線視同離開"; Nick: "他斷線就當他按下離開了", "死亡的人在連回來後就只會在
村莊 跟塔沒任何關聯了". Escaped and living delvers are unchanged: Nick, "逃出的人維持現狀（寬限期＋回去
觀戰）".)*

25. **A dead delver whose connection closes leaves the run at that moment**, exactly as if they
    had pressed *Leave the barrow* (R13, R14). This applies to every close: a tab closed, a refresh,
    a network drop, a normal close. It happens when the drop is detected, with no reconnect grace in
    the run. It runs the existing leave path (`LeaveRun`) unchanged:
    - the run marks them departed, keeps their body and settles them at its end (R18, R23);
    - the hub takes them, and their record names the hub (R21, R22 then hold as for any leaver).
    From then on they are a hub member who has dropped: the ordinary hub handling applies (the hub's
    own reconnect grace; then their record is deleted). A reconnect within that grace is announced
    the hub. A later reconnect is a fresh connect, which also lands in the hub. Either way they land
    in the village with no tie to the run. "Dead" means what R14 accepts for `leave_run`: a delver
    out of play who has not escaped, including one left behind on a lower floor (FS-F6F88).
    Charter default (Nick approved 2026-11-03); reason: "他斷線就當他按下離開了".
26. **A refused leave changes nothing.** If the run would refuse their leave (they are still in play,
    they have escaped, or their record names no run), the drop is handled exactly as before: a delver
    in play is held for the grace and then removed (R20); an escaped delver is kept for settlement
    (R18, R19). Charter default (Nick approved 2026-11-03); reason: only the dead delver's rule
    changes. *(Amended 2026-11-03, charter addendum: an escaped delver's refused leave now falls
    through to R29 and R30 (grace, then released), not R19.)*
27. **One leave, whichever comes first.** A dead delver's drop and their own `leave_run` can race.
    The first to reach the run leaves them; the second finds their record already naming the hub and
    changes nothing (R14's refusal for a sender in no run, logged, never sent to a closed
    connection). Charter default (Nick approved 2026-11-03); reason: leaving is idempotent by record.
28. **Everything hanging off the leave follows.** Anything that reacts to `LeaveRun` reacts the same
    way to a dead delver's drop. In particular, the matched-party leave of FS-988SM (on its own,
    unmerged branch) hangs off `LeaveRun`, so a dead matched member who drops leaves their party
    with no extra code once both are merged. This FS doesn't depend on that branch. Settlement,
    `LeaveRun`'s own behaviour and the client are unchanged. Charter default (Nick approved
    2026-11-03); reason: Bounds.

### An escaped delver who can't come back is released to the village (game-service)

*(Added 2026-11-03, charter addendum; Nick: "逃出的人不能離開 是因為斷線被退出隊伍才不得已回村莊的",
"斷線被踢出隊伍就會先回村莊". This replaces "escaped delvers unchanged" in the R25–R28 header note and
the Out of Scope entry on an escaped delver's disconnect rule.)*

29. **An escaped delver is released when they can no longer come back.** That moment is when their
    reconnect grace runs out (30 s, or 10 s after a going-away close), or the moment of a normal
    close (code 1000), which has no grace. Being released means:
    - the run marks them departed and keeps their body, so its end settles their plunder and
      experience exactly as if they had stayed (R18, R23);
    - their record leaves the run. It is removed the way a dropped hub member's is once their grace
      ends, so any later connect is fresh and lands in the village with no tie to the run;
    - they are marked settling (R32).
    This is not a leave. An escaped delver still can't leave on their own (`leave_run` is refused,
    `ErrEscapedWaits`, R14), and no Leave button is shown to them (R10). The release reuses the run's
    departure bookkeeping, with an escaped delver allowed only on this path. Charter default (Nick
    approved 2026-11-03); reason: Nick's rule. It also closes a bug. Today a normal close by an
    escaped delver goes `cleanUpClient` → `releaseDeparted` → `leaveCurrentWorld`, which removes
    their run body and with it their settlement, against story 7.
30. **Inside the grace, nothing changes.** A reconnect within the grace returns them to the run to
    watch (R12), still a member of their party. Charter default (Nick approved 2026-11-03).
31. **Party membership follows the run.** A release is leaving the run, so a matched party drops
    them through its leave-the-run hook (FS-988SM, on its own unmerged branch; no dependency here).
    A pre-formed party keeps them (ADR-0035), as it keeps a dead delver who left early. Charter
    default (Nick approved 2026-11-03).

### Settling: no entry until the run settles (game-service + game-client)

*(Added 2026-11-03, charter addendum. Reason: an escaped delver's plunder lands in their **bag**
when the run settles (items-service `storeExtractedPlayerItems` sets `LocationBag`). A bag checked
out into another world in the meantime (FS-18Z5F) would collide with it. A dead delver brings
nothing new home, so story 15 stands for them.)*

32. **A released escaped delver is marked settling.** The run's pod writes a Redis key,
    `settling:<playerID>`, when it releases them (R29). It refreshes the key while the run lives
    (TTL 90 s, refreshed every 30 s) and deletes it when the run ends, after the run's settlement
    events are written. The TTL is only a safety net. Charter default (Nick approved 2026-11-03);
    reason: a reconnect may land on any pod.
33. **A settling player can't enter any world that takes their gear.** Every pod checks the key
    before each of these entries. Each is refused on its existing refusal path:
    - `find_game` and `start_solo`: the refusal text "Your plunder is still being counted. Wait for
      the delve to end."
    - Party instance entry (FS-BJNYC): refused if any member is settling, with a new `party_notice`
      code `settling` to the one who pressed. The client shows the same text.
    - Field entry (FS-X2F2H, ADR-0030): a field refusal with reason `settling` and the same text.
    The rest of the village stays open to them: moving, chat, stash, the Bazaar. Charter default
    (Nick approved 2026-11-03); reason: the bag must stay home.
34. **The mark lets go when the run settles.** Deleting the key (R32) opens every entry at once. A
    reconnect after that is an ordinary village player. Charter default (Nick approved 2026-11-03).
35. **An unreadable mark lets them in.** If Redis can't be read, the entry goes ahead and the
    failure is logged at Warn: refusing every entry while Redis is down would block everyone, and the
    collision needs both an outage and a released escapee entering in it. *(Amended 2026-11-03,
    after code review; Nick confirmed fail-open: "先放行". Each read of the mark has its own
    timeout, so a slow mark read fails open too. It can't hold the entry long enough to turn into a
    gear refusal.)*
36. **Who is never marked.** A dead delver, who has no plunder to bring home. A delver who
    reconnected inside their grace (R30). A living delver. A player is in one world at a time
    (ADR-0015), so at most one run can mark them.

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
   completion it is. *(Amended 2026-11-02, charter: told by the "escaped successfully" line, not
   a card; R3.)*
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
    *(Amended 2026-11-03, charter; Nick: 他斷線就當他按下離開了. Now an **escaped** delver's story: an
    escaped delver is put back into the run to watch. A dead delver's refresh is a leave (R25, story
    26). Was: "As a resolved delver …".)*
    *(Amended 2026-11-03, charter addendum: only a refresh inside the grace puts them back (R30). Past
    it, they are released to the village (R29, story 31).)*
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
26. As a dead delver whose connection closes, for any reason, I want that to count as leaving, so
    that I come back to the village and not to a run I can no longer play. *(Added 2026-11-03,
    charter, R25.)*
27. As a dead delver who closed the tab, I want my experience and stats from that run still
    counted, so that a closed tab costs me no more than pressing Leave does. *(Added 2026-11-03,
    charter, R25, R18.)*
28. As a dead delver who drops and then reconnects, I want to land in the village straight away,
    so that I can queue again without waiting on my teammates. *(Added 2026-11-03, charter, R25.)*
29. As an escaped delver, I want nothing about my disconnect handling to change, so that I can
    still come back to watch and see my result. *(Added 2026-11-03, charter, R26.)*
    *(Amended 2026-11-03, charter addendum: they still come back to watch, but only within their
    grace (R30). Past it they are released to the village (R29), and their plunder is still settled.)*
30. As game-service, I want a dead delver's drop and their own `leave_run` to leave them once,
    whichever arrives first, so that a race never seats them twice or errors at a closed socket.
    *(Added 2026-11-03, charter, R27.)*
31. As an escaped delver whose connection is gone for good, I want to be sent to the village rather
    than left tied to a run I can't see, so that being cut off ends the same way for everyone.
    *(Added 2026-11-03, charter addendum, R29.)*
32. As an escaped delver who closed the game normally, I want my plunder still settled, so that a
    clean exit never costs me what I carried out. *(Added 2026-11-03, charter addendum, R29.)*
33. As an escaped delver who drops and comes back within the grace, I want to land in the run again
    and watch, so that a short hiccup changes nothing. *(Added 2026-11-03, charter addendum, R30.)*
34. As a released escaped delver, I want to be told why I can't queue or enter a field yet, so that I
    know my plunder is on its way. *(Added 2026-11-03, charter addendum, R33.)*
35. As a released escaped delver, I want to queue again as soon as my run settles, so that I wait no
    longer than the plunder does. *(Added 2026-11-03, charter addendum, R34.)*
36. As a party leader, I want to be told when a member who is still settling stops our party
    entering, so that I know who we are waiting on. *(Added 2026-11-03, charter addendum, R33.)*
37. As items-service, I want no bag checked out into another world while a run that owes plunder to
    it is still settling, so that settlement never collides with a live checkout. *(Added
    2026-11-03, charter addendum, R33.)*

## Acceptance Criteria

**Cards and spectating (game-client)**

- [ ] A dead delver with a teammate still in play sees a card with *Watch the delve* and
      *Leave the barrow*; the "delve goes on" notice is not shown.
- [ ] ~~An escaped delver with a teammate still in play sees a card with congratulatory copy and
      *Watch the delve* only.~~ *(Superseded 2026-11-02, charter; Nick: R3.)*
- [ ] An escaped delver with a teammate still in play sees no card and no leave button, only a
      *Watch the delve* button at the bottom centre; pressing it shows "Watching <name>" at the
      top and Tab cycles. The "escaped successfully" line still shows once. *(Added 2026-11-02,
      charter, R3.)*
- [ ] An escaped delver with no teammate in play sees no Watch button; the result card follows
      as today. *(Added 2026-11-02, charter, R3.)*
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
      spectate mode, with no leftover camera follow or listeners. *(Amended 2026-11-02,
      charter: an escaped delver comes back to the bottom-centre Watch button, R3, R12.)*
      *(Amended 2026-11-03, charter: this applies to an escaped delver only. A dead delver's
      reconnect lands in the hub, R12, R25.)*

**Leaving early**

- [ ] *Leave the barrow* sends `leave_run` once; a second press before the answer sends nothing.
- [ ] A dead delver's `leave_run` is answered with `world_entered(hub)` and the client enters
      `HubScene`.
- [ ] A living delver's `leave_run` is answered with an error on the `leave_run` action and
      they remain in the run, in play.
- [ ] An escaped delver's `leave_run` is answered with an error and they remain in the run.
- [ ] After a dead delver leaves, the run's state broadcast no longer reaches their connection,
      and their body is still in the run's entities.
- [ ] A delver who left early can `find_game` and is queued. *(Amended 2026-11-03, charter
      addendum: a dead delver. A released escaped delver waits for their run to settle, R33.)*

**Holding the result (game-client)**

- [ ] After `end_game`, the following `world_entered(hub)` does not switch the scene; the
      result card stays with one *Return to the hub* button.
- [ ] Pressing *Return to the hub* switches to `HubScene` with the held payload's session id.
- [ ] A `world_entered` with `world_type: "run"` arriving while the result card is up is
      applied at once.
- [ ] Neither legacy button (pre-hub `find_game`, WITHDRAW) exists.

**Settlement (game-service)**

- [ ] ~~A resolved delver who disconnects past the grace keeps their body and record in the run;
      the run-end `items.extracted` and `match.ended` include them; their record is deleted at
      run end. *(Amended 2026-11-03, charter: an **escaped** delver, R19.)*~~ *(Superseded
      2026-11-03, charter addendum: R19 applies to nobody; see the release criteria below.)*
- [ ] A resolved delver who reconnects before run end is announced the run (`world_entered`
      run) and receives state again. *(Amended 2026-11-03, charter: an **escaped** delver, R19.)*
      *(Amended 2026-11-03, charter addendum: only within their grace, R30.)*

**An escaped delver who can't come back is released (game-service)** *(Added 2026-11-03, charter
addendum, R29–R31)*

- [ ] An escaped delver whose grace runs out is released: the run marks them departed and keeps
      their body; their player record no longer names the run; they are marked `settling`.
- [ ] An escaped delver's normal close (code 1000) releases them at once, the same way. Their body
      is still in the run's entities afterwards, and the run-end `items.extracted` carries their
      plunder. This pins the old plunder-loss bug.
- [ ] A released escaped delver appears in the run-end `match.ended` and run progress exactly as
      if they had stayed.
- [ ] A released escaped delver who connects again before the run ends lands in the village
      (`world_entered` hub) and receives no run state.
- [ ] An escaped delver who reconnects inside their grace is announced the run and receives state
      again; nothing is marked.
- [ ] An escaped delver's `leave_run` is still refused, and no Leave button is shown to them.
- [ ] A dead delver's drop (R25) and a living delver's drop (R20) are unchanged by the release, and
      neither is ever marked `settling`.

**Settling (game-service + game-client)** *(Added 2026-11-03, charter addendum, R32–R36)*

- [ ] While `settling:<playerID>` exists, that player's `find_game` and `start_solo` are refused with
      "Your plunder is still being counted. Wait for the delve to end." and they are not queued or
      seated.
- [ ] While it exists, their field entry is refused with reason `settling` and the same text.
- [ ] While any member of a pre-formed party is settling, that party's instance entry is refused
      with `party_notice` `settling` to the one who pressed, and the client shows the same text.
- [ ] The check holds on every pod: a settling player who reconnects to another pod is refused there
      too.
- [ ] When the run ends and its settlement events are written, the key is deleted, and the same
      player's `find_game` then queues them.
- [ ] The run's pod refreshes the key while the run lives. If that pod dies, the key lapses within
      its TTL (90 s) and entry opens.
- [ ] If Redis can't be read for the check, the entry goes ahead and a Warn is logged (R35).

**A dead delver's disconnect is a leave (game-service)** *(Added 2026-11-03, charter, R25–R28)*

- [ ] A dead delver whose connection drops (abnormal close) is left at once: the run marks them
      departed and keeps their body; their record names the hub, with no grace counted in the run.
- [ ] The same holds for a going-away close (tab closed) and for a normal close (code 1000): in
      every case the body stays in the run and is settled at its end.
- [ ] That delver appears in the run-end `match.ended` with their elimination position and in run
      progress with their earned experience, exactly as a delver who pressed *Leave the barrow*.
- [ ] A dead delver who reconnects before the run ends is announced the hub (`world_entered`
      hub), never the run, and receives no run state.
- [ ] A dead delver who reconnects after their hub grace is a fresh connect in the hub.
- [ ] A dead delver's `leave_run` racing their drop leaves them once: one departure, one hub
      body, and no error written to a closed connection.
- [ ] An escaped delver's drop is unchanged (kept for settlement, a reconnect before run end
      returns them to the run); a living delver's drop is unchanged (grace, then removed).
      *(Amended 2026-11-03, charter addendum: an escaped delver's drop now follows R29–R30: a
      reconnect inside the grace returns them to the run, and past it they are released.)*
- [ ] A delver left behind on a lower floor (FS-F6F88) is treated as dead by this rule.
- [ ] A resolved delver who reconnects after run end connects fresh and is not in any run.
- [ ] A delver in play who disconnects past the grace is removed from the run (unchanged).
- [ ] A dead delver who left early appears in `match.ended` with their elimination position and
      in run progress with their earned experience.
- [ ] At run end, a member whose record names a different session (they left and entered a new
      run) is not moved to the hub and receives no `world_entered` from the old run.
- [ ] With one teammate left in play after the other left early, the run continues; when that
      teammate resolves, the run ends once (FS-QG1HR D5 latch holds).
- [ ] `go test -race ./internal/...` stays green across the new paths.

**An escaped delver still sees themselves (game-service)** *(Added 2026-11-02, charter, R24)*

- [ ] In a two-delver run where one escapes while the other plays on, each tick the escaped
      delver's frame carries their own `current_player` with `escape: true`.
- [ ] In the same run, the delver still in play does not find the escaped one in
      `other_players`, and `escaped_count` counts them once.

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
  *(Amended 2026-11-02, charter: for an escaped delver, while the Watch button is still up.)*
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
*(Amended 2026-11-03, charter: the three "Resolved delver drops …" states below now describe an
**escaped** delver. A dead delver's drop is the states under "A dead delver's disconnect".)*
- Resolved delver drops; run ends before the grace ends: the run-end path settles them, moves
  them home (their record still names the run, R22 applies), and the grace timer then finds a
  record pointing at the hub. The timer's cleanup must not remove a hub body that the record
  now legitimately holds **[OD]**; simplest is for the grace cleanup to treat a resolved-in-run
  record as "kept" (R19) and for run end to delete records of members still disconnected.
- Resolved delver drops, reconnects, drops again: each drop starts its own hold (existing
  `graceHold` mechanism); R19 applies to whichever is current at run end.
- Server restart before run end: nobody is settled. Existing limitation, unchanged; closed
  only by escape-time settlement (Out of Scope).

**A dead delver's disconnect** *(Added 2026-11-03, charter, R25–R28)*
- Dead and still on the card, never pressed *Leave*, then drops: the drop is the leave (R25).
- Dead and spectating, then drops: the same. The spectate state is client-only and is simply gone.
- Drop and `leave_run` on the same tick: whichever reaches the run first leaves them. The other
  finds their record naming the hub and changes nothing (R27).
- Drop and the run's end on the same tick: whichever lands first wins, as for `leave_run`. Left
  first, the run's end skips them (R22). Ended first, the run's end moves them home, and the drop
  is then an ordinary hub drop.
- Dead, drops, and the hub is missing (`errHubMissing`): the leave is refused. The drop falls back
  to today's handling (R26), so they are kept for settlement as before. Logged at Warn.
- Reconnect lands while the leave is being applied: the leave runs under the server's own ordering,
  and the reconnect sees the record as it stands. Before the leave, it re-maps them in the run and
  the drop's leave finds them connected again. That is accepted: they are back, dead, and may press
  *Leave*. After the leave, they are announced the hub.
- Escaped, then drops: unchanged (R19, R26). *(Amended 2026-11-03, charter addendum: grace, then
  released, per R29 and R30.)*
- In play, then drops: unchanged (R20, R26). If their grace runs out, they are removed as today.
  They are not "dead and left" by this rule, because the removal is not a leave.

**Releasing an escaped delver** *(Added 2026-11-03, charter addendum, R29–R31)*
- A reconnect racing the grace's expiry: the existing hold decides. If the reconnect maps them
  first, the expiry finds them connected and does nothing (R30). If the expiry runs first, they are
  released, and the reconnect is a fresh connect that lands in the village.
- The run ends inside an escaped delver's grace: the run's end settles them and takes them home as
  today (R22). The expiry then finds a record that names the hub, so nothing is released and nothing
  is marked.
- The run ends in the same moment as a release: whichever comes first wins. Released first: the
  run's end settles the kept body and deletes the key. Ended first: no release, no mark.
- The earlier "Resolved delver drops; run ends before the grace ends" and "drops, reconnects, drops
  again" states still hold for the grace. Only the past-grace outcome changes: release instead of
  keep.
- Server restart before the run ends: nobody is settled (unchanged), and any key lapses by TTL.

**Settling** *(Added 2026-11-03, charter addendum, R32–R36)*
- The run's pod dies mid-run: the key stops being refreshed and lapses within 90 s, so entry opens.
  Nobody is settled anyway (above). Accepted.
- The key write fails when the escapee is released: logged at Warn, and they are not blocked. The
  collision this guards against can then happen, but needs a later entry before the run ends.
  Accepted, and rare.
- The key delete fails at run end: the TTL lets it lapse within 90 s. Until then, entry is refused
  with the settling text. Accepted.
- Redis is unreadable when an entry is checked: the entry goes ahead with a Warn (R35).
- A settling player is invited to, or joins, a pre-formed party: allowed. Only instance entry is
  refused, while they are settling (R33).
- A settling player is at the main menu or switches character: not an entry. Their next world entry
  is checked like any other.
- Two marks for one player: can't happen. A player is in one world at a time (ADR-0015), so only one
  run can release them.
- **ACCEPTED: the mark lets go a moment before the plunder lands.** The key is deleted once the
  run's settlement events are written to the outbox (R32), but items-service puts the plunder in the
  bag only when it consumes them. In that sub-second gap the player could enter a world with their
  bag. The worst case is a bag over its cap; nothing is lost. *(Added 2026-11-03, after code review;
  Nick: "好". Accepted because the planned escape-time settlement removes the mark altogether, Out
  of Scope.)*
- **ACCEPTED: an escaped delver inside their grace isn't marked yet.** Marks are written only at
  release (R29, R36). If they reconnect to another pod inside their grace, that pod has no record
  of them, so they get a fresh village connect with no mark, and for up to the rest of the grace
  (30 s at most) they could queue. Likewise, a party ready check already open when a member's grace
  ends goes through: settling is checked only when entry is pressed (R33). *(Added 2026-11-03,
  after code review; Nick: "好". Accepted for the same reason. Marking at drop time and checking
  again when the ready check completes was considered and declined as interim code.)*

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
| state broadcast | unchanged shape; an escaped delver's own frame now carries their `current_player` (`escape: true`) until the run ends (R24, amended 2026-11-02) |
| `find_game`, `start_solo` (error reply) | unchanged shape; new refusal text "Your plunder is still being counted. Wait for the delve to end." while settling (R33, added 2026-11-03) |
| field refusal (`enter_field` error reply) | unchanged shape `{message, reason}`; new reason `settling` with the same text (R33, added 2026-11-03) |
| `party_notice` | unchanged shape; new code `settling`, sent to the one who pressed party entry while a member is settling (R33, added 2026-11-03) |

## Out of Scope

- **An escaped delver leaving early.** Their plunder is settled from the run-end snapshot; leaving
  would need settlement at the moment of escape (below).
- **Settlement at the moment of escape.** `items.extracted` can carry one member, but experience
  rides inside `match.ended`, so a one-member `match.ended` would make stats-service count an
  extra match. It needs a new member-settled event or experience split out of `match.ended`:
  a cross-service event contract change (ADR), human lane. Revisit before letting escaped
  delvers leave early. *(Noted 2026-11-03, charter addendum; Nick: "之後想改成逃出的先自己結算".
  Planned as its own feature. Once it ships, the settling mark (R32–R36) and the release (R29)
  can go.)* *(Amended 2026-11-03, after code review; Nick: "漏洞一是不是先逃出的先結算就沒這些問題",
  then "好". It removes the settling mark, the release, the waiting in R29–R36, and both ACCEPTED
  settling edge states. Even then, a one-member settlement still crosses the outbox, so a
  sub-second lag before the plunder lands remains unless items-service confirms it.)*
- **The server waiting for the result-card button** before ending the run or returning anyone.
- **Spectating the delver's own corpse**, or free camera.
- **Spectating from the hub**, or spectating a run one is not a member of.
- **A dead delver rejoining the run** (revival is a separate, unscoped feature).
- **Confirmation before leaving.**
- **Changes to the reconnect grace durations.**
- **Changes to `match.ended` / `items.extracted` shape or consumers.**
- ~~**An escaped delver's disconnect rule.** It stays as R19: kept for settlement, and a reconnect
  returns them to watch. *(Added 2026-11-03, charter; Nick: "逃出的人維持現狀（寬限期＋回去觀戰）".)*~~
  *(Superseded 2026-11-03, charter addendum: R29–R31. Within the grace nothing changes; past it,
  they are released.)*
- **A village notice for a run settled while the delver was away** (e.g. "your delve settled: N
  items, X experience"). It was raised 2026-11-03 and parked; it is not part of this amendment.
- **Refusing to queue until the previous run ends.** Story 15 stands: a delver who left early,
  including by dropping (R25), may queue again at once. *(Noted 2026-11-03.)* *(Amended
  2026-11-03, charter addendum: this still holds for a dead delver. A released escaped delver is
  refused until their run settles, R33.)*
- **A Leave button or a voluntary leave for an escaped delver.** They wait (R14, R29). *(Added
  2026-11-03, charter addendum.)*
- **Waiting for settlement through another mechanism** (polling items-service for IN_RUN gear,
  for instance). The settling key is the one signal. *(Added 2026-11-03, charter addendum.)*

## Change: Panel shortcut icons on the HUD → FS-3EBCA

## Amendment 2026-11-14 (FS-TQZ5J § Change: Batch 6): the row's words and place

Appended; nothing above is edited. The owner, 2026-11-14: 「文字改成WATCH LEAVE SETTLEMENT」 and
「文字可以小一點」, with layout B. Specified in FS-TQZ5J § Change: Batch 6, R120–R124; recorded here
because it changes R2's, R3's and R10's buttons.

- **The words.** *Watch the delve* reads **WATCH** and *Leave the barrow* **LEAVE**, on the dead
  delver's card (R2), on the escaped delver's bottom-centre button (R3 as amended), and on the dead
  spectator's corner button (R10). SETTLEMENT (FS-GV8WN R21) is unchanged in word. What each does is
  unchanged.
- **The type and size.** 13 px bold, letter-spaced 1 px; each button as wide as its word plus 24 px a
  side (WATCH 104, LEAVE 94, SETTLEMENT 144), 38 high.
- **The row's place.** Still 200 px above the bottom margin (R3's amendment), its buttons 8 apart in the
  order watch, leave, settlement. Centred across, unless centring would bring it within 12 px of the open
  chat window at the bottom left; then it starts 12 px right of the window (x 442). The card keeps its
  place, its buttons centred on it 8 apart; the corner button keeps its corner.

## Change: The party death flow and the spectate switcher
Status: work-order
Date: 2026-11-14

Scoped and promoted in one run under the owner's approved change (2026-11-14), with the integrator's
defaults; no interview. The owner's words **[owner]**; what the code forces (read on feat/client-ui-scene,
a0482fe6) **[code]**; a default applied to a case nobody named, *Derived*. Numbered from R150. Nothing
above is edited; this section changes R1, R2, R8–R10 and the § Amendment 2026-11-14's corner button, and
touches FS-GV8WN R21, FS-TQZ5J R47 and R57, FS-WDM0X § Pass 2b, FS-48CTQ §E.15, FS-3EBCA R14, FS-8AY7S
R24 and FS-P9G8R R24 (each carries a pointer stub).

**The owner's words.** For a player who dies while a teammate is still in play: only the settlement record
pops up; its CLOSE brings the card with WATCH and LEAVE; 「settlement在跳出watch leave跳窗時不要出現」 (no
SETTLEMENT while the WATCH/LEAVE card is up); WATCH starts spectating with SETTLEMENT and LEAVE side by side
at the bottom centre, 「settlement跟leave低一點」 (lower than today's row), the corner LEAVE folded into it;
「切換箭頭就放在上方一些」 (the switching arrows a little above them): ◄ Watching <name> ►; 「畫面正上方好像
已經有相關資訊 那就把上面的資訊刪除」 (delete the top-centre spectate text). Later the same day:
「左上角的個人血量魔量不用隱藏 就顯示死亡時的狀態就好了」 (the player's own Health and mana at the top left
need not hide; show them as they were at death). Solo death and escape unchanged.

**The owner's process.** No screenshots or parity shots. The checks are the full client vitest, `tsc
--noEmit`, `npm run lint` and `npm run lint:fence`; the look and the sounds are the owner's check (HITL).

**Lane.** game-client only. No server, proto, gateway or manifest change.

### Facts (verified 2026-11-14 on feat/client-ui-scene, a0482fe6)

- **The order a death arrives in.** game-service settles a fallen member inside the tick's `step`
  (`recordEliminations` → `settleDeath` → `handOff`, which sends `settlement`) and broadcasts the state after
  it (`manageGameLoop`: `step`, then `broadcastFullState`). So the record normally arrives just before the
  first state that shows the death. A member whose snapshot fails is settled at the run's end and gets no
  record (FS-GV8WN Edge States). **[code]**
- **Today, a death with a teammate in play.** The `settlement` opens the record (`showSettlement` →
  `openRecord`, `endPopsUp`: one `dialog_open`, the party panel and the moved windows shut silently, R47,
  R58), and the next state puts up the card "The barrow keeps you" (`syncResolvedView` →
  `showResolvedCard`) under it, with SETTLEMENT alone in the bottom-centre row (`resolvedRow`). WATCH takes
  the card down, puts LEAVE in the bottom-right corner (`placeLeaveInCorner`, `leaveButtonPlace`, above the
  corner row) and the spectate HUD at the top centre (`showSpectateHud`: "Watching <name>" at
  `SPECTATE_HUD_Y` 10 and "Tab: next player" 30 under it). **[code]**
- **The record's Close.** The UI scene's `UiRecordSlot` plays `menu_click`, then requests `close: record`,
  which the run answers with `closeRecord` (FS-TQZ5J R57). **[code]**
- **The target frame.** `updateTargetFrame` hides it while the spectate HUD stands (`covered =
  this.spectateHud !== undefined || this.arrivalCard.up`, FS-48CTQ §E.15). **[code]**
- **The own bars.** `hudBars` returns none once the player is out of the delve (FS-8AY7S R24), and
  `potionCell` stands exactly when the bars do (FS-P9G8R R24); the run sends both each state
  (`showResourceBars`). The level bar (`showProgress`) is sent on every state with the player's own
  progress and never hides on resolving. The ability card is down while resolved (`abilityCard`). **[code]**
- **The shared pieces.** `drawHudButton` (`PartyPanel.ts`): a 1 px brass-outlined HUD button, live or greyed,
  its sounds by `hudButtonSounds` (`menu_hover` on the pointer coming over, `menu_click` on the release,
  `menu_error` on a greyed one's release), no cursor of its own. The options slider's arrows are triangles
  drawn in code (8 × 12), since the canvas body face has no ◄ or ►. **[code]**
- **The corner row** at 720 tall: its plates y 658–704, from x W − 294 to W − 16; its hover label's bottom
  at y 652 (12 px text, 3 px padding: about y 631–652). The open chat window: x 10–430, y 468–704 at every
  width. **[code]**

### Requirements

**Who.** **150.** This change is the dead player's with a teammate still in play (`resolvedView` dead). A
solo death, a solo escape, the last of a party to resolve and the escaped player's offer before WATCH (R3 as
amended: WATCH, LEAVE, SETTLEMENT 200 above the bottom margin) are unchanged. **[owner]**

**The record first.**

151. **The record alone.** The death's `settlement` opens the record as today, with the end's one
     `dialog_open` (FS-WDM0X E1) and the silent closes (FS-TQZ5J R47, R58). While it is up and the card has
     not yet stood, no card and no bottom-centre button stand: the dead player's row is empty until they
     watch (R156). **[owner]**
152. **CLOSE brings the card.** The card stands for the dead player with a teammate in play, not watching,
     whenever the record is not up: so the record's first close puts it up, with WATCH and LEAVE, as today's
     card. Once WATCH is pressed the card never comes again (spectating, R12's end rules unchanged); a close
     once the run has ended brings nothing (the held town comes in, FS-GV8WN R23). **[owner]**
153. **CLOSE's one sound.** The close that brings the card plays `dialog_open` alone, in place of
     `menu_click`: one press closes the record and opens the card, and FS-WDM0X S3 has the new window's open
     sound play alone, as E3 (SETTLEMENT bringing the record back) and M11 (Fall opening its confirm) do.
     Every other close of the record plays `menu_click` (E5). The R47/R58 closes are not repeated (the end
     popped up once). *Derived* (the owner asked for the choice to be named).
     - **Who plays it.** The run, which alone knows what the close brings: the record slot's Close requests
       `close: record` and plays nothing; the run's answer plays `dialog_open` or `menu_click`, then acts,
       so a close that lets a held town in is still heard as it leaves (E5). The slot keeps the hover
       (`menu_hover`, E4). No function crosses the bridge (ADR-0081); FS-TQZ5J R57's "Close plays
       `menu_click`, then sends `close: record`" reads "Close sends `close: record`; the run plays its
       sound". *Derived* (an alternative, a sound named in the record's data, would go stale as teammates
       resolve between the send and the press).
154. **No SETTLEMENT while the card is up** (nor before it, R151): the card's two buttons are the only way
     on. **[owner]**
155. **No record, the card at once.** A dead player whose death shows before any record (a record that
     never comes, or comes late) gets the card at once, chiming the end as today (E1). A record arriving
     later opens over it as today and plays nothing (E1's edge "the card first, the record late"); its close
     brings nothing more (the card stands). *Derived* (fallback, so no dead player is left without a way
     on).
156. **The card's LEAVE** leaves, as today (R13, R14). **[owner]**

**The spectate controls.**

157. **WATCH** takes the card down and starts spectating (R7). The spectate controls stand while this player
     watches, dead or escaped: the row and the switcher below. **[owner; Derived for the escaped]**
158. **The row.** LEAVE, then SETTLEMENT once a record has come, left to right 8 apart, each its label's
     width plus 24 a side, 38 high (FS-TQZ5J R120–R122), their bottom **70** above the view's bottom (at 720
     tall: y 612–650, the line y 631). Centred across unless centring would bring it within 12 of the open
     chat window's right edge; then its left edge is 442 (FS-TQZ5J R123's rule). In the HUD band (1000, hit
     areas 1001), in the world (ADR-0083 2.3). **[owner]** It meets neither the corner row's plates (y 658
     and down) nor their hover labels: at 1080 its right edge is 688 and the leftmost label's left edge
     about 750; at 1280, 763 and about 950. The default 70 clears both, so no lower y was needed.
     - **The corner LEAVE folds in.** The dead spectator's LEAVE is the row's; the bottom-right corner
       button and `leaveButtonPlace` go. **[owner]**
     - **The escaped spectator** has the same row (their LEAVE and SETTLEMENT, FS-GV8WN R25), moved down
       with it as they watch: one place for every spectator's controls. *Derived* (the top text goes for every
       spectator, so the switcher stands for every spectator, over this row).
159. **The switcher.** "◄ Watching <name> ►", 8 above the row (at 720 tall: y 576–604), 28 high, centred on
     the row's centre (the view's centre with no row), never left of 442 (the chat rule). Its look is neutral
     HUD out of the shared pieces: one `hudPanel` backing across it, the words "Watching <name>" in vellum
     (`hudText`) 14 px EB Garamond, 10 px padding each side; each arrow a 28 × 28 `drawHudButton` (the 1 px
     brass outline, live or greyed) with the options slider's 8 × 12 triangle drawn in code, amber
     (`interactable`) while live and `hudFaint` greyed. Its width is the words' plus 76. **[owner; Derived
     for the measures]**
160. **Switching.** ► watches the next teammate in play and ◄ the previous one, in R8's stable order, round
     at either end. Tab still goes to the next. The player's own body is never in the cycle. **[owner]**
161. **Its sounds.** A live arrow plays `menu_hover` as the pointer comes onto it and `menu_click` on the
     press's release, once, as it switches (FS-WDM0X E4, E5; the party's buttons, P5, P6). No cursor of its
     own: the bone hand stays (FS-KYPQ9 § Change: Every hover keeps the bone hand). Tab plays nothing (§
     Pass 2b Out of Scope: the spectate HUD's Tab). **[owner]**
162. **Greyed with one.** With one teammate in play the arrows are greyed: no hover sound, and a press plays
     `menu_error` and changes nothing (E6, P7). They come live as soon as two are in play again. **[owner]**
163. **The top text goes.** "Watching <name>" and "Tab: next player" at the top centre are no longer drawn;
     `SPECTATE_HUD_Y` goes. The switcher says whose eyes (R9's "who"); its arrows are the visible control
     (R9's hint). **[owner]**
164. **The target frame while spectating** follows its own rules: with nothing at the top centre, it is no
     longer hidden while the player watches (FS-48CTQ §E.15); only the floor veil and the arrival card still
     cover it (§E.16). An intended look change for the owner. **[owner]**
165. **The record while spectating.** SETTLEMENT opens it (`dialog_open`, E3); its CLOSE or SETTLEMENT
     closes it (`menu_click`) and the player is spectating as before: the card does not come again, and the
     row and the switcher stand as they stood. The record keeps its anchor (FS-TQZ5J R124): its bottom 12
     over the 200-lift line, clear above the switcher. **[owner]**
166. **A new logical view** puts the row and the switcher back in their places at once; nothing plays
     (E2). **[Derived]**
167. **Never over UI pieces.** The record stays the UI scene's; the card, the row and the switcher stay the
     world's (ADR-0083 2.3) and meet no UI piece: at every logical width from 1080 to 1280 neither the row
     nor the switcher meets the open chat window or its open picker list, nor the corner row or its hover
     label. **[owner]**

**The own bars.**

168. **They stay, frozen, out of the delve.** In a run, the player's own Health and class resource bars no
     longer hide once the player is out of the delve. The first state that shows them dead or escaped
     fixes them as that state draws them (Health at 0 on a death; the resource as it was), and they stand so,
     unchanged by later states and by watching a teammate (they are always the player's own), until the run
     scene stops; a state that drops the player's own (an escaped player's) keeps them. **[owner]**
     - **The potion cell** stands beside them by the same rule today (FS-P9G8R R24: up exactly when the bars
       are), so it stays too, frozen with its count. The drink key still sends nothing once out of the
       delve. *Derived* (the owner's "same rule" test).
     - **The level bar** never hid on resolving: unchanged. **[code]**
     - **An escape** hides the bars by the same rule as a death (FS-8AY7S R24), so the bars stay there too,
       frozen at the escape. *Derived* (the owner's "same rule" test).
     - **Unchanged:** the ability card and the controls badge (down while resolved), and a field's bars (down
       while the player lies fallen). **[owner]**

### Acceptance Criteria

- [x] A death with a teammate in play: the record alone (one `dialog_open`, no card, no row); its CLOSE
      brings the card with WATCH and LEAVE and plays `dialog_open` alone; no SETTLEMENT while the card is up.
- [x] The card's LEAVE sends `leave_run` as today.
- [x] WATCH: the card down; LEAVE and SETTLEMENT side by side at the bottom centre, their bottom 70 above
      the view's bottom; the switcher 8 above them naming the watched teammate; no corner LEAVE.
- [x] SETTLEMENT while spectating opens the record (`dialog_open`); closing it plays `menu_click`, brings no
      card, and leaves the row and the switcher as they were.
- [x] ► next, ◄ previous, round; Tab next; live arrows `menu_hover` and `menu_click` on the release; with
      one teammate in play both greyed, a press `menu_error` and no change; no cursor of their own.
- [x] No "Watching" or "Tab: next player" text at the top centre; the target frame is not hidden while
      spectating.
- [x] The row and the switcher meet neither the open chat window nor its open list, nor the corner row or
      its hover label, at every logical width from 1080 to 1280; their rects pinned at 1080 and 1280.
- [x] A death shown before any record: the card at once, one `dialog_open`, as today.
- [x] Solo death, solo escape and the escaped player's offer before WATCH: as today.
- [x] The own Health and resource bars and the potion cell stay up, frozen at the death or the escape;
      watching a teammate leaves them the player's own; the ability card stays down; a field's bars as today.
- [x] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.
- [ ] The owner's look and listening check (HITL).

### Edge States

- **The teammate resolves while the record is up.** Nobody is left: the run ends on the next tick, and
  the close brings no card (R152); the close plays `menu_click`.
- **The party panel or a gear window opened over the record, then CLOSE.** The card comes up under it; the
  end popped up once, so nothing shuts it again (FS-TQZ5J R47's edge "a reopened panel can cover the end's
  buttons again").
- **The watched teammate resolves.** The camera moves on (R11) and the switcher names the next; with one
  left the arrows grey.
- **A Leave pending.** The row's LEAVE dims and a press plays `menu_error` (E6), as the corner's did.
- **The run ends while spectating.** `end_game` takes the row and the switcher down, plays nothing; the
  record, if open, holds the town (FS-GV8WN R23).
- **A very long name.** The switcher grows with it, centred on the row, its left edge never under 442; a
  name long enough to reach the view's right edge is not cut. Named, not designed.
- **A view under 1080 or over 1280 wide.** The rule holds: neither left edge goes under 442.

### Out of Scope

- Moving the card, the row or the switcher into the UI scene; the card's own look and words.
- The escaped player's offer before WATCH; the record's look, anchor and scroll.
- Any server, proto or gateway change.

### As built (2026-11-14)

Appended after the slices; the text above is not edited. Built in I-QPDKN-12 (the record first), I-QPDKN-13
(the spectate controls) and I-QPDKN-14 (the own bars); the owner's check is I-QPDKN-15. No screenshots.

- **The record first.** `syncResolvedView` puts the card up only while `record?.open` is false; `closeRecord`
  runs it again before the held town's release, so the first close brings the card. The record slot's Close
  only requests `close: record`; the run answers with `recordClosePressed`, which plays `dialog_open` when
  `closeBringsCard()` (dead with a teammate in play, not watching, no card, the run not ended) and
  `menu_click` otherwise, then closes. `fell` (sticky: a dead state, or a `settlement` with `outcome: died`,
  which arrives first) empties the row until the player watches (`resolvedRow`'s `fell`, `watching`).
- **The spectate controls.** `resolvedRow.ts`: `SPECTATE_ROW_BOTTOM` 70, `spectateRowY`, `rowSpan`,
  `switcherRect`, `switcherWidth`, `SWITCHER_H`, `SWITCHER_ARROW_W` 28, `SWITCHER_PAD` 10, `SWITCHER_GAP` 8; the
  row holds LEAVE for a fallen spectator. `spectateSwitcher.ts` (`SpectateSwitcher`): a `hudPanel` backing,
  the words "Watching <name>" 14 px `hudText`, two `drawHudButton` arrows (`watch-previous`, `watch-next`, a
  blank space for words) with 8 × 12 triangles in `interactable` or `hudFaint` at 0.45. `nextWatched` takes a
  step (-1 for ◄). Gone: `placeLeaveInCorner`, `leaveButtonPlace`, `LEAVE_BUTTON_DEPTH`, `showSpectateHud`,
  `SPECTATE_HUD_Y`, the ability card's `leaveUp`. The target frame's cover is the arrival card alone.
- **The own bars.** `potions.ts` `runOwnHud(state, held)` and `OwnHud`; `resources.ts` `barsOf(me)`, which
  `hudBars` uses in the delve; the run holds `heldHud` from the first resolved state until it resets.
- **The numbers.** At 720 tall the spectate row's buttons span y 612–650 (their line y 631, where the old corner
  LEAVE's centre stood) and the switcher y 576–604. LEAVE + SETTLEMENT at 1080: 442–536 and 544–688; at 1280:
  517–611 and 619–763. LEAVE alone: 493–587 and 593–687. The switcher is its words' width plus 76, centred on
  the row's centre (565 at 1080 with both buttons, 540 with LEAVE alone; 640 at 1280), never left of 442. The
  sweep over 1080–1280 (rows, switchers of words 60–240 wide, the open and folded chat, its list, the corner
  plates and 160-wide hover labels) is in `resolvedRow.test.ts`; the run's tests pin the rects at 1080 and
  1280 with their stand-in's 7 px a character.
- **Looks a player can see** (the owner's check): the record alone at a party death and the card after its
  CLOSE; no SETTLEMENT by the card; the spectate row lower and the corner LEAVE gone; the switcher; no text at
  the top centre and the target frame up while spectating; the escaped spectator's LEAVE and SETTLEMENT moved
  down with the row; the own bars and potion cell standing frozen at the top left after a death or an escape.
