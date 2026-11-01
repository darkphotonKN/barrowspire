# FS-BJNYC: Enter the Spire as a party

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Party" → "Enter an instance as a party from its gate", "Ready check before a party enters", "Party members enter only with their party", "A party is locked inside its instance"; `game-client/SPECIFICATION.md` "### Party" → "Enter the Spire as a party", "Party entry ready check" → this FS · Related ADRs: [ADR-0036](../adr/0036-party-state-lives-in-redis-membership-spans-pods.md) (party state in Redis, membership spans pods, no party pod; supersedes [ADR-0034](../adr/0034-a-party-lives-on-one-pod-joining-is-a-hub-handoff.md)), [ADR-0035](../adr/0035-a-party-is-the-universal-instance-roster-ephemeral-and-locked-inside.md) (an instance locks the party; its auto-formed-party and party-of-one halves are not built here, see Out of Scope), [ADR-0030](../adr/0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md) (a field is never a handoff destination) · Depends on: [FS-R82NV](R82NV-party-formation.md) (the party, leader, succession to the earliest-joined), [FS-NCC9J](NCC9J-party-membership-across-pods.md) (party state in Redis, party cache, presence, travel to the leader; no invite or create in a run) · Builds on: [FS-NSV3D](NSV3D-solo-delve-entry.md) (`start_solo`: a run built for a given roster without the queue; party entry is its N-player form), [FS-0XMCP](0XMCP-hub-destination-gates.md) (the Spire gate, where entry actions live), [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) (a run returns its players to its pod's hub) · Siblings: [FS-XGW7H](XGW7H-party-chat.md), [FS-V780R](V780R-party-loot-rule.md) · Related: [FS-BDA7X](BDA7X-character-leveling.md) (kill XP already goes to every living, un-escaped delver in full; no change) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) § Party (*party entry*, *ready check*, *instance lock*, *leader's pod*); [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) § Party terms

## Summary

A party goes down the Spire together. The leader, standing at the Spire's door, chooses **Enter as
a party**; every member gets the same popup listing each member's answer with a 15-second
countdown, the leader already ticked; when every other member accepts, the whole party enters one
run at once, with no handoff, because everyone has already gathered in the leader's town. Inside,
the party is locked: nobody leaves, is kicked or loses the lead by transfer. If the leader drops,
the earliest-joined member leads at once. Afterwards the party is still a party, back in the same
town. A party member can no longer queue for a random match or descend alone: a party enters
together. That queue block ships first, on its own.

Scoped 2026-11-01 with Nick; v1 cut and defaults set by the approved charter of 2026-11-02. Nick,
verbatim: "組隊時不能按單人跟排隊 只能按隊伍進塔 目前沒檔"; chose "1加2" (build party entry, and
block the queue now); "組隊進塔 隊長按了之後所有人都要在15秒內 按同意 跳窗會有所有人確認的狀況 還有秒數倒數";
"隊長是按的人所以預設就打勾".

## Requirements

### Party members don't queue or descend alone (game-service)

1. **The queue is closed to party members.** `find_game` from a player who is in a party is refused
   with "Your party enters together." The check reads the pod's party cache on the hub loop (no
   Redis call) and runs after the existing no-character check and after an already-delving player
   is resumed, ahead of the Spire-gate check. Nothing about the queue itself changes. A player in
   no party queues exactly as today. *Charter default 1 (Nick approved 2026-11-02); reason: decided
   2026-11-01 (I-R82NV-2 session), ships at once.* This requirement ships alone, before any other.
2. **Solo entry is closed to party members.** `start_solo` from a player in a party is refused with
   the same words and in the same place in its guard order as R1. A party of just the leader is a
   party too: it enters by R3, not by `start_solo`. A player in no party descends alone exactly as
   today. *Charter default 2 (Nick approved 2026-11-02); reason: Nick's ask.* R2 ships **in the same
   slice as party entry (R3–R18), never before**: without party entry a party could not delve at
   all.

### Party entry (game-service)

3. **Only the leader enters a party.** The new inbound action `party_enter` (no payload; who sends
   it comes from the connection) starts a party entry. A party of just the leader takes the same
   path; its ready check has nobody left to wait for, so it completes at once and the run starts
   (no popup is needed). *Charter default 3 (Nick approved 2026-11-02); reason: the draft.*
4. **Entry conditions.** The leader must stand in the Spire's gate zone (FS-0XMCP). Every other
   member must be seated in the hub world (the town) **of the leader's pod**: the pod the leader is
   connected to now (ADR-0036; a party has no pod of its own). A member on another pod, in a field,
   in a run, away, or disconnected is not in the town. Nobody is pulled back automatically: a member
   on another pod uses Travel (FS-NCC9J) first. *Charter default 4 (Nick approved 2026-11-02);
   reason: the draft ("everyone in the same place, e.g. the village"), adapted to ADR-0036.*
5. **Refusals, in order,** each as a `party_notice` to the leader only:
   1. `not_member`: the sender is in no party.
   2. `not_leader`: the sender is a member but not the leader.
   3. `locked`: the party is in a run already (R19), e.g. a leader who left the run early.
   4. `checking`: the party already has a ready check open.
   5. `not_at_gate`: the leader is not in the Spire's gate zone.
   6. `not_in_town`, naming **every** member who is not in the town (R4), in join order.
   7. `unavailable`: Redis cannot be reached to read the party (FS-NCC9J R8).

   A leader with no character in play, or already in a run, is answered as `start_solo` answers
   them (the no-character refusal; resumed into their run) before this list.
6. **Fresh roster, decided on the loop.** At `party_enter` the pod reads the party from Redis off
   the hub loop and makes every decision in R5 back on the loop, as travel does (FS-NCC9J,
   `party_travel.go`). The party cache may serve an early refusal; it never decides who enters.

### The ready check (game-service)

7. **The leader's press is their acceptance.** When R5 passes, the pod opens a ready check for the
   party: one id, the roster as read in R6, a 15-second deadline, the leader marked **accepted**
   from the moment it opens and every other member **waiting**. *Charter default 5 (Nick approved
   2026-11-02, revised by Nick; "隊長是按的人所以預設就打勾"); reason: Nick's revision.*
8. **Everyone sees the same state.** The new outbound message `party_ready_check` goes to every
   member of the check, the leader included, carrying: `check_id`, `leader_id`, `expires_in_ms`
   (time left by the server's clock, so the client's countdown does not depend on clock skew), and
   one row per member `{player_id, name, state}` with `state` one of `waiting`, `accepted`,
   `declined`; plus `outcome`, one of `open`, `started`, `cancelled`, and on `cancelled` a `reason`
   and the `names` it concerns. It is sent when the check opens, **after every answer**, and once
   when it starts or is cancelled.
9. **Members answer.** The new inbound action `party_ready` `{check_id, accept}` from a member who is
   `waiting` in that open check records `accepted` or `declined`. The leader sends no answer (their
   popup has no accept or decline, and no cancel: not asked). An answer naming a check that is not
   open, from someone not in it, or from someone who already answered is ignored (logged at debug).
10. **Any no cancels.** The check is cancelled, and every member told who, when:
    - a member declines (`reason: declined`, their name);
    - 15 s pass with members still waiting (`timeout`, the names of everyone still waiting);
    - a member, the leader included, leaves the town (a field, travel, back to the roster)
      (`left`, their name);
    - a member, the leader included, disconnects (`disconnected`, their name);
    - the party's membership or leader changes while it is open (an accept, a leave, a kick, a
      transfer, an expiry removal) (`changed`, no names).

    The leader stepping out of the gate zone within the town does not cancel it: their press was
    their answer. *(Derived from charter default 5: only "leaving the village or disconnecting"
    were named.)*
11. **All accepted → they enter together.** When the last waiting member accepts, the pod reads each
    member's gear off the loop exactly as `start_solo` reads one player's (`checkGear`), and
    re-reads the party from Redis with it. Back on the loop it builds the run only if the roster
    still equals the check's and every member is still seated in the town; otherwise the check is
    cancelled (`changed`, or `left` / `disconnected` naming who). A member whose gear cannot be
    read cancels it with `reason: failed` and their name, in the gear refusal's spirit (an entry
    fails closed rather than seating unread gear). Redis unreachable at that re-read, or a run that
    cannot be built, cancels it `failed` with no names; nobody leaves the town.
12. **One check per party.** A party has at most one open check; a second `party_enter` while one is
    open is refused `checking` (R5). A pod holds its checks in memory only; a pod that stops loses
    its open checks and nobody enters.

### Starting the run (game-service)

13. **No handoff.** Every member is on the leader's pod, so the run is built there from the party's
    roster as `start_solo` builds one for one player: `CreateGameSession` with every member as a
    local player, which takes each out of the hub and seats them together. Each member is
    world-switched in and sent `world_entered` as `start_solo` sends it. *Charter default 6 (Nick
    approved 2026-11-02); reason: the draft.*
14. **The run knows its party.** At start the pod records which party the run was built from, and
    the roster, as the run's snapshot (ADR-0036: "a run snapshots what it needs from its party at
    entry"). This is pod memory; **the party's Redis structure does not change** (charter Bounds).
15. **Match size and party size are one setting.** `PARTY_SIZE` already sets both the party cap and
    the matchmaker's match size (`config/party.go`). Nothing to build; the draft's open question is
    closed. *Charter default 10 (Nick approved 2026-11-02); reason: already done.*

### Inside the run (game-service)

16. **Reconnect grace unchanged.** A member who drops inside the run keeps their seat for the grace
    the run already gives (FS-QPDKN settle rules) and counts as dead for the run only when it runs
    out. They stay a party member either way. Dying, escaping, `leave_run` and `forfeit_run` keep
    their existing rules, and the player stays a member. Nick: "沒有立即生效 就照之前的設計會有一段時間會保持
    過久才會真離開".
17. **The leader drops → the lead passes at once.** When the leader's connection drops while they
    are in the party's run, the earliest-joined other member becomes leader immediately (by the
    existing transfer script), not after the grace and not after FS-NCC9J's away timeout. A leader
    who reconnects within the grace comes back as a member. A party of one has nobody to pass to.
    Succession is the one party change the lock never refuses. *Charter default 8 (Nick approved
    2026-11-02); reason: the draft (so the run never waits on a missing leader).*
18. **After the run.** When the run ends the party persists, and every member is back in the town of
    the pod the run lived on (the leader's pod at entry), as K2HKP's hub return already does; no
    reconnect. *Charter default 9 (Nick approved 2026-11-02); reason: the draft ("退出塔副本後隊伍會繼續存在").*

### The instance lock (game-service)

19. **Locked while in the run.** A party is **in a run** from the moment its party-entry run starts
    (R13) until that run ends. Meanwhile `party_leave`, `party_kick` and `party_transfer` from any
    member are refused `locked`: the registry's existing `locked(ctx, p)` seam, false today, now
    answers from the pod's record of R14. *Charter default 7 (Nick approved 2026-11-02); reason: the
    draft and ADR-0035.* Nick: "在副本不能退出 除非斷線脫離就當他死了 隊長也不能踢人". A member who left
    the run early and stands in the town is still refused (their party is still in the run).
    Inviting and creating are already closed in a run by FS-NCC9J; nothing changes there.

### Spire door (game-client)

20. **Party members don't see the queue as open.** At the Spire's door, "Wait for company" is greyed
    for a player in a party, and the door says "Your party enters together." A player in no party
    sees the door as today. Ships with R1.
21. **The leader enters; members wait.** For the party's leader the door offers **Enter as a party**
    (sends `party_enter`), and greys "Descend alone" and "Wait for company". A member who is not the
    leader sees both greyed and no entry choice. "Not yet" stays for everyone. A party of just the
    leader sees Enter as a party. Ships with R2–R13 (R2's greying never before party entry).
22. **Refusals in words.** Each `party_enter` refusal (R5) and each cancellation (R10) is shown in
    passing, by the code tables below; the player stays where they stand.

### The ready-check popup (game-client)

23. **One popup for everyone.** On a `party_ready_check` with `outcome: open`, every member, the
    leader included, sees the same carved popup: the question, one row per member with their
    state (waiting / accepted / declined), and a countdown in whole seconds from `expires_in_ms`.
    The leader's row shows **accepted from the moment the popup opens**. Modelled on the invite
    prompt (`PartyInvitePrompt.ts`); it does not pull a member out of a shop or a dialogue.
24. **Who may answer.** A member who is `waiting` sees **Accept** and **Decline**, which send
    `party_ready`; once answered they are replaced by the answer. The leader's popup shows the
    status only: no Accept, no Decline, no Cancel.
25. **Live.** Each later `party_ready_check` for the same `check_id` redraws the rows; the countdown
    follows the newest `expires_in_ms`.
26. **Close.** `started`: the popup closes and the scene follows the `world_entered` that comes with
    it. `cancelled`: the popup closes and the reason is shown in passing (copy below).

### Copy (game-client)

| Where | Code / case | Words |
|---|---|---|
| door, party member | queue and solo greyed | "Your party enters together." |
| `find_game` / `start_solo` refused (R1, R2) | server's words | "Your party enters together." |
| `party_enter` refused | `not_member` | existing copy |
| | `not_leader` | existing copy |
| | `locked` | "Not while delving." (existing) |
| | `checking` | "Your party is already being asked." |
| | `not_at_gate` | "Walk to the Spire's door first." (the gate refusal's words) |
| | `not_in_town` | "<names> is not in the town." / "<names> are not in the town." |
| | `unavailable` | existing copy |
| popup | question | "<leader> would enter the Spire. Are you ready?" |
| cancelled | `declined` | "<name> declined. The party stays." |
| | `timeout` | "<names> did not answer. The party stays." |
| | `left` | "<name> left the town. The party stays." |
| | `disconnected` | "<name> is gone. The party stays." |
| | `changed` | "The party changed. Ask again." |
| | `failed`, a name | "<name>'s gear could not be read. Ask again." |
| | `failed`, no names | "The way is shut for now. Ask again." |

The screen word is **the town** (`game-client/CONTEXT.md`); Nick's "X 不在村莊" / "X is not in the
village" reads "X is not in the town".

## User Stories

1. As a party leader at the Spire's door, I want to choose "Enter as a party", so that my whole party goes down together.
2. As a party leader, I want my press to count as my own acceptance, so that I am not asked to confirm twice.
3. As a party leader, I want to see my own row already ticked when the popup opens, so that it is plain I am in.
4. As a party member, I want a popup asking whether I am ready, so that nobody is dragged into a run unprepared.
5. As a party member, I want to see who has accepted, who is still deciding and who declined, so that I know what we are waiting on.
6. As a party member, I want a countdown, so that I know how long I have to answer.
7. As any party member, I want the popup to update the moment anyone answers, so that the state I see is the state there is.
8. As a party member, I want to decline, so that I can say "not now" without leaving the party.
9. As a party member, I want to be told who declined or did not answer when an entry is cancelled, so that we can sort it out.
10. As a party leader, I want an entry refused with the names of members who are not in the town, so that I know whom to wait for.
11. As a party member on another server, I want to know I must travel to the leader first, so that I am not left behind silently.
12. As a party member, I want not to be pulled out of a field automatically, so that the game never moves me without my say.
13. As a party member, I want the queue button greyed with "Your party enters together.", so that I don't wander into a random match without my party.
14. As a party member, I want "Descend alone" greyed, so that I don't split from my party by accident.
15. As a party member who is not the leader, I want no entry button, so that it is clear the leader starts it.
16. As a leader whose party is just me, I want "Enter as a party" to take me straight down, so that I am never stuck with no way in.
17. As a party, we want to arrive together at one spawn point, so that we start as a group.
18. As a party member in a run, I want my party unable to kick me, so that a run cannot strand me mid-delve.
19. As a party leader in a run, I want leave, kick and transfer refused, so that the run's roster stays the party.
20. As a party member, I want the lead to pass to the earliest-joined member the moment the leader drops, so that the party always has a leader.
21. As a leader who reconnects in time, I want my seat back in the run, so that a blip doesn't cost me the delve, even though the lead has moved.
22. As a party member, I want the party to still exist after the run, so that we can go again.
23. As a party member, I want to be back in the same town after the run, so that the party is together again without travelling.
24. As a player in no party, I want "Descend alone" and "Wait for company" to work as before, so that solo play is untouched.
25. As a member who dies early and walks home, I want to stay in my party, so that I am grouped when my teammates come back.
26. As a party leader, I want a second press while a check is open refused, so that nobody gets two popups.
27. As a party member, I want an entry cancelled if a teammate disconnects or leaves the town during the check, so that we never enter short-handed.
28. As an operator, I want nothing about the party's Redis structure to change, so that party entry adds no migration.

## Acceptance Criteria

- [ ] `find_game` from a party member is refused with "Your party enters together.", after the no-character check and the resume of an already-delving player, before the Spire-gate check; it never reaches the queue. A player in no party queues as before. (R1)
- [ ] Client: at the Spire's door a party member sees "Wait for company" greyed and "Your party enters together."; a player in no party sees the door unchanged. (R20)
- [ ] `start_solo` from a party member is refused with the same words in the same place, shipped in the same slice as party entry and never before it. (R2)
- [ ] `party_enter` refusals fire in R5's order under a table-driven test: `not_member`, `not_leader`, `locked`, `checking`, `not_at_gate`, `not_in_town` (every absent member named, in join order), `unavailable`. (R5)
- [ ] A member on another pod, in a field, in a run, away, or disconnected counts as not in the town; nobody is moved. (R4)
- [ ] The roster is read from Redis off the hub loop and every decision is made on the loop. (R6)
- [ ] On a passing `party_enter` every member, the leader included, receives `party_ready_check` `outcome: open` with the leader `accepted`, everyone else `waiting`, and `expires_in_ms` of about 15 000. (R7, R8)
- [ ] Each `party_ready` answer is recorded and every member receives the updated state; stale, foreign and repeated answers are ignored. (R8, R9)
- [ ] A decline, a 15 s timeout, a member leaving the town, a member disconnecting, and a membership or leader change each cancel the check, and every member receives `outcome: cancelled` with the right `reason` and names. The leader leaving the gate zone within the town does not. (R10)
- [ ] When the last member accepts, every member's gear is read off the loop; with the roster unchanged and everyone still in the town, one run is built with every member seated together and each receives `world_entered`; a member with unreadable gear cancels it `failed`, named. (R11, R13)
- [ ] A party of just the leader enters at once on `party_enter`, no member popup. (R3)
- [ ] A second `party_enter` during an open check is refused `checking`. (R12)
- [ ] While the party's run is in progress, `party_leave`, `party_kick` and `party_transfer` are refused `locked`, including from a member who left the run early; after the run ends they work again. (R19)
- [ ] The leader's connection dropping in the party's run makes the earliest-joined other member leader at once; the old leader reconnecting within the grace is seated back as a member. (R17)
- [ ] When the run ends the party is unchanged and every member is in the town of the pod the run lived on. (R18)
- [ ] The party's Redis keys and scripts are unchanged. (R14)
- [ ] Client: the leader sees "Enter as a party" and greyed "Descend alone" / "Wait for company"; a non-leader member sees both greyed and no entry choice. (R21)
- [ ] Client: every member sees one popup with each member's state and a whole-second countdown; **the leader's row is ticked (accepted) from the moment the popup opens**; waiting members see Accept and Decline; the leader sees status only (no Accept, Decline or Cancel). (R23, R24)
- [ ] Client: the popup redraws on each `party_ready_check`, closes on `started` (the scene follows `world_entered`) and on `cancelled` (reason shown in passing, copy table). (R25, R26)
- [ ] Client: each `party_enter` refusal and each cancellation reads per the copy table. (R22)

## Edge States

- **Party of one:** the ready check has nobody to wait for; the run starts at once (R3).
- **Leader presses twice:** the second is refused `checking` (R12).
- **Member answers late:** an answer after the check closed names a check that is not open and is ignored; the member already saw `cancelled` or `started`.
- **Member accepts, then walks into a field before the last answer:** `left`, named, cancels (R10).
- **Member is in a building in the town:** still in the town's hub world; counts as in the town.
- **Member is away (no refresh for ~30 s) at the press:** not seated in the town; named in `not_in_town`.
- **Leader disconnects during the check:** `disconnected`, leader named; with the leader gone, FS-NCC9J's normal away and removal rules apply (no in-run succession, since no run started).
- **Someone accepts an invite during the check:** membership changed → `changed` (R10).
- **Redis unreachable at the press:** refused `unavailable`. **At the final re-read (R11):** cancelled `failed` with no names; nobody enters (the same fail-closed stance as gear).
- **Gear unreadable for one member:** cancelled `failed`, named (R11).
- **The run cannot be built:** cancelled `failed`, no names; nobody leaves the town.
- **Pod stops during a check:** the check is gone with it; nobody enters; the party is untouched in Redis.
- **Pod stops during the run:** the run ends as K2HKP says; the party is untouched in Redis; the lock went with the pod's memory.
- **Member reconnects to another pod while the party is in the run:** that pod has no record of the run, so it does not see the party as locked there. Accepted for v1: reconnect returns a player to the holding pod (FS-MCYWK), and the Redis structure does not change (charter Bounds).
- **Member who left the run early tries to leave the party in the town:** refused `locked` (R19). The client shows Leave live there (its lock reads only the player's own world) and the refusal's words, "Not while delving."
- **Leader drops in the run in a party of one:** nobody to pass to; the grace runs as today.
- **Leader drops, and every other member is also disconnected:** the earliest-joined other member still takes the lead (they are members until FS-NCC9J's expiry).
- **Leader leaves the run early and presses Enter as a party again:** refused `locked` (R5.3).
- **Stale party cache on a just-joined member's `find_game`:** the accepter's own pod applies the accept result itself, so its cache knows; a stale cache elsewhere only affects players not seated there.
- **Only party entry puts a party member in a run:** once R1 and R2 ship, a party member cannot queue or descend alone, and a player already in a run cannot be invited (FS-NCC9J R10 `delving`) or accept (R14 `locked`).

## Out of Scope

- **Random-match auto-party and its random leader.** Draft decision, Nick: "如果是隨機配對 入塔後也要自動幫進入的組隊", "可能隨機選一個當隊長". The host pod would create a party from the matched roster at run creation; a no-show not a member; the earliest arrival taking over from a no-show leader. Parked by the charter (2026-11-02). ADR-0035 still records it as decided; a later FS realises it.
- **"Every run is a party" (a solo run is a party of one).** Draft, Nick 2026-11-01 (FS-NCC9J session): every player in a run is in a party, so an invite to someone in a run answers `already_in_party`. Parked by the charter; FS-NCC9J's in-run `locked` / `delving` refusals keep standing in.
- **Instances entered from a field gate.** Draft: "the rule generalises: same world as the leader"; "塔只是一個範例 之後所有副本都通用這個模組". v1 is the Spire gate only.
- **Loot rule** (FS-V780R), including its lock inside an instance.
- **Party channel** (FS-XGW7H): the draft's "the party channel is the instance's chat".
- **Filling a party from the queue** ("wait for company" as a party). Parties enter as parties.
- **Changing the party's Redis structure** (charter Bounds).

### Parking lot

- A "recall them" action on a `not_in_town` refusal (draft open question; refused, not offered, in v1).
- A leader's Cancel on the ready check (not asked).
- Greying the client's Leave / Kick / Transfer for a member in the town while teammates are still in the party's run.
- Re-checking the leader's place at the gate when the last member accepts.

### Draft decisions superseded by the charter

- Ready check of **30 s** with only the other members prompted → **15 s**, everyone sees the same popup, the leader's press counts as acceptance (charter default 5, Nick).
- "Party pod" → **the leader's pod** (ADR-0036).
