# FS-R82NV: Party formation

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Party" → "Form a party across pods", "Player presence index across pods", "Joining a party moves the player to the party's pod"; `game-client/SPECIFICATION.md` "### Party" → "Party panel", "Party invites", "Follow a handoff into the hub", "Party frames" → this FS · Related ADRs: [ADR-0034](../adr/0034-a-party-lives-on-one-pod-joining-is-a-hub-handoff.md) (a party lives on one pod; joining is a hub handoff), [ADR-0035](../adr/0035-a-party-is-the-universal-instance-roster-ephemeral-and-locked-inside.md) (ephemeral, locked inside an instance), [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (per-pod ceiling), [ADR-0033](../adr/0033-chat-is-never-stored-a-report-carries-its-own-evidence.md) (nothing stored) · Siblings (scoped 2026-11-01): [FS-BJNYC](BJNYC-party-instance-entry.md) (party entry, auto-formed party, instance lock), [FS-XGW7H](XGW7H-party-chat.md) (party chat, system lines), [FS-V780R](V780R-party-loot-rule.md) (loot rule, a party setting), [FS-CH21F](CH21F-party-member-overhead-bars.md) (health and resource for members) · Builds on: [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) (the handoff mechanic, `world_handoff`, pod address, pod liveness), [FS-JEAVX](JEAVX-hub-shared-across-replicas.md) (hub occupancy cap per pod), [FS-5SH4G](5SH4G-world-chat.md) (Redis subscriber → hub-loop path, reused for the pod inbox), [FS-WJGFJ](WJGFJ-in-game-chat.md) (`chat_notice`, carved panel) · Shares with: [FS-KCQ06](KCQ06-whisper.md) (the presence index) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) § Party (party, leader, party pod, hub handoff, presence index, pod inbox, party invite)

## Summary

A player forms a **party** by inviting others by character name, from any pod. Accepting an
invite moves the invitee to the leader's pod, so the party stands in one village, walks the
same fields, and later enters instances together (FS-BJNYC). A **T** panel lists the party and
holds its actions (invite, kick, transfer, leave); a persistent **party frame** on the left of
the screen shows each teammate's name, health and resource. The party outlives any instance and
ends when its last member leaves; nothing about it is stored.

**Lane:** the server side is **human lane** (Nick hand-codes, or authorises the agent per
slice as with chat); the client side is agent lane.

## Requirements

### The party and its pod (game-service)

1. **A party** has an id (UUID, minted by the pod that creates it), one **leader**, an ordered
   member list (join order), a creation time, and the settings later specs add (FS-V780R's loot
   rule). Its size cap is `PARTY_SIZE` (R8). A player is in at most one party.
2. **The party pod** is the pod that created the party. The party's full state lives in that
   pod's memory, owned by the message hub's goroutine like the chat relay is (ADR-0034). Every
   member is connected to the party pod; a member is counted as a member only once seated there.
3. **Redis holds pointers only**, each with a TTL the party pod refreshes every 10 s and deletes
   when the party ends:
   - `party:<party_id>` → the party pod's id (TTL 30 s);
   - `player:<player_id>:party` → the party id (TTL 30 s), one per member.
   A pointer whose pod is not alive (`pod:alive:<podID>`, FS-K2HKP) means the party is gone.
4. **A party is created** the first time a leader-less player sends a party invite (R12): the
   inviter becomes leader of a new party of one on their own pod. There is no separate "create
   party" action. (FS-BJNYC adds the auto-formed party on a random match.)
5. **A party ends** when its last member leaves (R20), when its pod shuts down gracefully (all
   members told with `party_update` reason `dissolved`), or silently when its pod dies (pointers
   expire; members reconnect party-less).
6. **Nothing is persisted.** No table, no event to other services. A party is state like a chat
   line (ADR-0033 stance).

### Presence index (game-service)

7. **Presence** is a Redis key `presence:name:<lower(name)>` → `{player_id, pod_id}`, written
   when a player is seated in the hub (`enter_hub` succeeds, or a hub arrival), refreshed by the
   pod every 10 s with a 30 s TTL, and deleted when the player leaves the hub for any reason
   (field, run, `leave_hub`, disconnect). Only hub-seated players are present; a player in a
   field or run is **busy**, a player with no key is **offline**. Character names are unique
   case-insensitively (character-service's `lower(name)` index), so the key is unambiguous.

### Size (game-service)

8. **`PARTY_SIZE`** (env, default 2, max 4) is the party cap **and** the matchmaker's match size:
   `NewMatchmaker` reads it instead of the literal 2. An invalid value fails startup with a clear
   error.

### Pod inbox (game-service)

9. Each pod subscribes at boot to `pod:<podID>:inbox` on the chat bus's subscriber path
   (FS-5SH4G: one goroutine, buffered channel into the hub loop, resubscribe after 1 s). Messages
   are JSON `{kind, to_player_id, payload}`; the hub loop delivers them to that player's
   connection if it holds one, otherwise drops them with a Debug log. Kinds in this FS:
   `party_invite` (R13) and `party_recall` (R24). Never chat lines; those stay on their own
   channels.
10. Publishing to another pod's inbox uses the same publisher goroutine and 2 s timeout as world
    chat; a failed publish is a Warn log and, for an invite, a `party_notice` `delivery_failed`
    to the inviter.

### Invites (game-service)

11. **Who may invite:** the leader, or any player not yet in a party (who becomes one, R4). A
    non-leader member's invite is refused with `party_notice` `not_leader`.
12. **`party_invite` action** `{name}`: `name` is a character name (case-insensitive) or a player
    UUID. The sender must be seated in the hub; otherwise `party_notice` `not_in_hub`.
    Refusals, each a `party_notice` with that code, checked in this order:
    `party_full` (members + pending accepts ≥ `PARTY_SIZE`), `self` (naming yourself),
    `not_found` (no presence key — offline, or busy per R7, or no such name; one code, the client
    says "not here right now"), `already_in_party` (the target's `player:<id>:party` pointer
    exists), `pod_full` (the party pod's hub occupancy is at FS-JEAVX's cap, counting pending
    accepts), `pending` (an invite to that player from this party is still open).
13. **Delivery:** the party pod publishes `party_invite` to the target's pod inbox with
    `{invite_id, party_id, party_pod_addr, leader_name, member_count, expires_at}`. The target's
    pod delivers it to the player as a `party_invite` message. The inviter gets `party_notice`
    `sent` with the target's name.
14. **Pending invites** live on the party pod: `{invite_id, target player id, target pod, sent
    at}`, expiring after **60 s** (`party_notice` `expired` to the inviter; the target's client
    hides the prompt on its own clock). A target may hold several invites from different parties;
    accepting one voids the others on acceptance arrival (R17).
15. **`party_decline` action** `{invite_id}` from the target: their pod publishes `party_reply`
    `{invite_id, declined: true}` to the party pod's inbox; the inviter gets `party_notice`
    `declined` with the name. Unknown or expired ids are ignored.
16. **`party_accept` action** `{invite_id}` from the target, who must be seated in the hub and in
    no party (else `party_notice` `not_in_hub` / `already_in_party`). The target's pod checks
    `party:<party_id>` still points at an alive pod (else `party_notice` `party_gone`), then:
    - **same pod:** seats nothing new; sends `party_reply` `{invite_id, accepted: true}` to the
      party (in-process) and the player is added at once (R17).
    - **other pod:** sends the player `world_handoff` `{addr: party_pod_addr, hub: true,
      invite_id}` and publishes `party_reply` `{invite_id, accepted: true, arriving: true}` to the
      party pod's inbox. The player's old socket is dropped by the client once the new one is up
      (R23); the old pod treats the close like any disconnect.

### Arrival and membership (game-service)

17. **Expected arrival.** On an accepted `party_reply` with `arriving`, the party pod records an
    expected arrival `{player_id, invite_id, deadline: now + 15 s}` and tells the party
    `party_notice` `accepted` (name). When that player connects to the party pod and succeeds at
    `enter_hub` (a plain connect, FS-K2HKP's `?session_id=` is **not** used for a hub arrival —
    the invite id travels in the `enter_hub` payload as `invite_id`), the pod matches the id,
    adds them as the last member, voids their other pending invites, writes their pointer (R3),
    and broadcasts `party_update` (R21). A same-pod accept skips the arrival and adds at once.
18. **Missed arrival.** If the deadline passes, the expectation is dropped and the party gets
    `party_notice` `no_show` (name). A later `enter_hub` carrying that invite id is an ordinary
    hub entry on that pod, party-less; the player gets `party_notice` `expired`.
19. **Leader actions**, each a `party_notice` refusal when not the leader (`not_leader`), when
    the target is not a member (`not_member`), or while the party is inside an instance
    (`locked`, FS-BJNYC):
    - `party_kick` `{player_id}`: the member is removed, told `party_update` reason `kicked`, and
      stays on the pod where they stand.
    - `party_transfer` `{player_id}`: the target becomes leader; everyone gets `party_update`.
20. **`party_leave`** (any member, refused with `locked` inside an instance): the member is
    removed and stays where they stand; if they were leader, R22 applies; if they were the last
    member, the party ends (R5).
21. **`party_update`** is sent to every member on every change: `{party_id, leader_id,
    members: [{player_id, name, class, joined_at, where, online}], size, reason, subject_id}`
    where `where` is `hub` | `field:<place>` | `run` | `away` (disconnected within R24's grace)
    and `reason` ∈ `joined` | `left` | `kicked` | `leader` | `dissolved` | `away` | `back` |
    `settings`. A player being removed receives the update that removes them (their final one)
    with their own id as `subject_id`.
22. **Succession.** When the leader leaves, is dropped (R24), or disconnects inside an instance
    (FS-BJNYC), the **earliest-joined** remaining member becomes leader at once; `party_update`
    reason `leader`.
23. **Where members are** is tracked on the party pod from its own world switches (hub, field
    place, run); `party_update` reason `away`/`back` and the `where` field change on each.
24. **Disconnect grace and recall.** A member who disconnects while not in an instance stays a
    member for **5 minutes** (`where: away`). If they reconnect to **another** pod in that time
    and send `enter_hub`, that pod reads `player:<id>:party` → party pod and, if alive, replies
    with `world_handoff` `{addr, hub: true, recall: true}` instead of seating them; the party
    pod expects the arrival (R17 shape, kind `recall`) and marks them `back`. Reconnecting to the
    party pod itself marks them `back` directly. After 5 minutes the party pod removes them
    (`party_update` reason `left`) and deletes their pointer. Inside an instance the run's own
    grace applies (FS-BJNYC).
25. **Logs** never carry invite text beyond names; party ids and player ids are fine. Every
    refusal is Debug, every delivery failure Warn.

### Following a hub handoff (game-client)

26. `world_handoff` gains `hub: true` (+ `invite_id` or `recall: true`). The client follows it
    exactly as it follows a run handoff (make-before-break, K2HKP R31): opens a socket to `addr`,
    and on open sends `enter_hub` with the current character and the `invite_id` if any, then
    closes the old socket. On refusal or failure it keeps the old socket, stays where it is, and
    shows a notice "Could not reach your party". The transition screen is the existing one.
27. The hub arrival spawns at the village's normal spawn point.

### Party panel (game-client)

28. **T** toggles the party panel in the hub, fields and runs (not while a text input has focus).
    A carved panel (`carvedPanel.ts`), game palette, right of the party frames.
29. Contents: the member list (name, class, leader icon on the leader, `where`, away/offline
    greyed), and the actions the viewer may use: **Invite** (a DOM `<input>` like chat's, name or
    id, Enter sends `party_invite`; usable only in the hub, greyed elsewhere), **Kick** and
    **Transfer** on each other member (leader only), **Leave** (any member), and the loot-rule
    selector (FS-V780R, leader only). Actions that the server would refuse as `locked` are
    greyed inside an instance.
30. A player in no party sees only the Invite field and one line: "Invite someone by name to
    form a party."
31. Every `party_notice` shows as a system line in the chat window (FS-XGW7H's system-line
    shape, channel `party`), with the copy in the notice table (R34).

### Invite prompt (game-client)

32. An incoming `party_invite` shows a small prompt (panel-styled, top centre, under the queue
    panel's spot): "<leader> invites you to their party (<n>/<size>)" with **Accept** / **Decline**
    buttons and a 60 s countdown; several prompts stack. Accept sends `party_accept`, Decline
    sends `party_decline`; the prompt also closes itself when the countdown ends or a
    `party_update` makes the player a member.
33. The prompt is not shown in a run or a field (the server never delivers there, R7), and is
    hidden by the end-of-run overlay like the chat input.

### Party frames (game-client)

34. **Party frames** sit on the left edge below the level/XP bar, shown whenever the player is in
    a party, one row per **other** member in join order: name (leader icon first on the leader),
    then a health bar and a resource bar in the HUD's own-bar style, half scale. Bars fill from
    the member's `current_health`/`max_health` and `resource` in the state broadcast when
    present (FS-CH21F; runs and fields); when absent (hub, or member elsewhere) the bar slot
    shows a short state word instead: "village", "afield", "delving", "away".
35. Frames and panel update from `party_update` and each state tick; nothing is requested.

### Notice copy (game-client)

36. `party_notice` codes and copy (lore voice, terse):

| code | copy |
|---|---|
| `sent` | "Word sent to <name>." |
| `accepted` | "<name> answers the call." |
| `no_show` | "<name> did not arrive." |
| `declined` | "<name> declines." |
| `expired` | "No answer from <name>." |
| `not_found` | "<name> is not here right now." |
| `already_in_party` | "<name> walks with another party." |
| `party_full` | "Your party is full." |
| `pod_full` | "No room where your party stands." |
| `pending` | "<name> has already been asked." |
| `self` | "You cannot invite yourself." |
| `not_leader` | "Only the leader may do that." |
| `not_member` | "They are not in your party." |
| `not_in_hub` | "Only from the village." |
| `locked` | "Not while delving." |
| `party_gone` | "That party is no more." |
| `delivery_failed` | "Word could not be sent." |

## User Stories

1. As a player, I want to invite a friend by typing their character name, so that I need not find them on screen.
2. As a player, I want the invite to reach my friend wherever they are connected, so that which server we landed on does not matter.
3. As an invitee, I want a clear prompt with accept and decline, so that I am never pulled anywhere without agreeing.
4. As an invitee, I want accepting to put me in my friend's village, so that we can stand together, walk the same fields and enter the Spire together.
5. As an invitee on the same server as the leader, I want no transition at all, so that joining feels instant.
6. As an invitee, I want a failed move to leave me where I was with a short notice, so that a hiccup costs nothing.
7. As a leader, I want to know when an invitee accepted, arrived, declined, timed out or never arrived, so that I know whom I am waiting for.
8. As a leader, I want to be told why an invite could not be sent (not here, already grouped, full), so that I can act on it.
9. As a player, I want to press T and see my party with the leader marked, so that I know who decides.
10. As a leader, I want to kick a member, so that a bad fit does not spoil the group.
11. As a leader, I want to hand leadership to someone else, so that I can step back without dissolving the party.
12. As a member, I want to leave the party from the panel, so that I am never trapped in one.
13. As a member, I want leadership to pass automatically when the leader drops, so that the party keeps working without a vote.
14. As a member, I want a short disconnect to keep my place in the party and bring me back to its village, so that a flaky connection does not cost the group.
15. As a member, I want party frames on the left showing each teammate's name, health and resource, so that I can see at a glance that everyone is here and how they fare.
16. As a member, I want the frames to say where a teammate is when I cannot see their bars, so that "away" and "afield" are not confused with "dead".
17. As a player with no party, I want no frames and a one-line hint in the panel, so that the screen stays clean.
18. As a player, I want party actions refused with a short line rather than silently, so that I know the rule I hit.
19. As a member, I want party events (joined, left, kicked, new leader) in the chat window, so that the panel and the chat agree.
20. As an operator, I want party size and match size to be one setting, so that a full party and a random roster are the same shape.
21. As an operator, I want nothing party-related in a database, so that there is nothing to migrate or clean up.
22. As a developer, I want the hub arrival to be the ordinary connect + `enter_hub` path with one extra id, so that the handoff code stays one mechanism.
23. As a developer, I want the pod inbox to ride the chat bus's subscriber path, so that cross-pod delivery has one implementation.
24. As a developer, I want the presence index shaped so whisper can use it unchanged, so that FS-KCQ06 adds no second index.

## Acceptance Criteria

- [ ] An invite by name from pod A to a player seated in pod B's hub shows the prompt on B within a second (two-pod miniredis test, as world chat's).
- [ ] Accepting on B sends `world_handoff` with `hub: true` and A's pod address; a connect to A followed by `enter_hub` with the invite id adds the player and broadcasts `party_update` to both.
- [ ] Accepting on the same pod adds the player with no `world_handoff`.
- [ ] A missed arrival (15 s) drops the expectation and notices `no_show`; a later `enter_hub` with that invite id seats a party-less player.
- [ ] Each refusal code in R12 fires in the stated order under a table-driven test.
- [ ] An invite expires at 60 s with `expired` to the inviter; the client prompt closes on its own at 60 s.
- [ ] Kick, transfer and leave update every member's `party_update`; leave by the leader promotes the earliest-joined member; the last leave ends the party and deletes both pointers.
- [ ] A member disconnected in the hub is `away` for up to 5 minutes; reconnecting to another pod yields a `world_handoff` recall; after 5 minutes they are removed.
- [ ] `PARTY_SIZE` feeds both the party cap and `NewMatchmaker`; an invalid value fails startup.
- [ ] Presence keys appear on hub seating, vanish on leaving the hub, and expire within 30 s of a pod dying.
- [ ] Pod inbox messages for a player not on this pod are dropped and logged at Debug; a publish failure notices `delivery_failed`.
- [ ] Client: T toggles the panel in hub, field and run; actions grey per role and lock; invite field only usable in the hub.
- [ ] Client: party frames render one row per other member with bars when health/resource is present and a state word otherwise; none when not in a party.
- [ ] Client: a refused or failed hub handoff keeps the old socket and shows the notice.
- [ ] `go test ./... -race` on the touched packages and `vitest` green; no raw hex in client code (lint fence).

## Edge States

- **Empty:** no party → no frames, panel shows the hint; `party_leave` with no party → `not_member`.
- **Concurrent:** two invites to the same player from two parties — both delivered; the first accept wins, the second accept gets `already_in_party` (on arrival or at accept). Two accepts of the same invite — the second is ignored (invite consumed). Kick and leave of the same member at once — first wins, second `not_member`.
- **Party pod full:** checked at invite and again at accept (`pod_full` at accept too, the inviter told); the pending-accept count reserves room between the two.
- **Party pod dies:** pointers expire; the invitee's accept finds no alive pod → `party_gone`; members on the dead pod reconnect wherever, party-less; the recall (R24) does nothing because `party:<id>` is gone.
- **Target pod dies after delivery:** the prompt vanishes with the connection; the invite expires at 60 s on the party pod.
- **Invitee is in a field or run:** no presence key → `not_found` to the inviter ("not here right now").
- **Invitee is queued for the Spire:** presence exists (they are in the hub); accept is refused with `not_in_hub`? No — queued players are in the hub. Decision: accept is **refused** for a queued player with a new code `queued` ("Leave the queue first."), since a handoff mid-queue would strand their queue entry; added to R36's table at write time.
- **Inviter leaves the hub before the reply:** the party pod still processes the reply; the party exists independently of where the leader stands.
- **Leader disconnects in the hub:** succession at once (R22) — the 5-minute grace keeps them a member, not leader; on return they are a member.
- **All members away:** the party persists until the grace removes the last one.
- **Pod graceful shutdown:** every party on it is dissolved with `party_update` `dissolved`; players reconnect elsewhere party-less.
- **Unauthorized:** every action is keyed by the connection's member id; a `party_kick` naming a non-member or sent by a non-leader is refused; nothing trusts a client-supplied party id.
- **Expired invite id on accept/decline:** ignored on the target side; the party pod never sees it.
- **Name with different case or trailing spaces:** trimmed and lowercased before lookup.

## Out of Scope

- Entering an instance as a party, the ready check, the auto-formed party and the instance lock
  (FS-BJNYC).
- Party chat lines and the chat-window rendering of system lines (FS-XGW7H); this FS only
  emits `party_notice` and `party_update`.
- The loot rule's semantics (FS-V780R); this FS only reserves the setting on the party and the
  selector's place on the panel.
- Health and resource in the broadcast for members (FS-CH21F); the frames draw what is there.
- Inviting by clicking a visible player, friends lists, offline invites, guilds.
- Spawning the arrival beside the leader (normal spawn point for now).
- Whisper (FS-KCQ06), which will reuse the presence index.
