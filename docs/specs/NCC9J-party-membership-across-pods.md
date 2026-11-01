# FS-NCC9J: Party membership across pods

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Party" → "Party membership across pods", "Player presence index across pods", "Travel to the party leader's village"; `game-client/SPECIFICATION.md` "### Party" → "Travel to the leader's village from the party frames" → this FS · Related ADRs: [ADR-0036](../adr/0036-party-state-lives-in-redis-membership-spans-pods.md) (party state in Redis, membership spans pods; supersedes [ADR-0034](../adr/0034-a-party-lives-on-one-pod-joining-is-a-hub-handoff.md)), [ADR-0035](../adr/0035-a-party-is-the-universal-instance-roster-ephemeral-and-locked-inside.md) (locked inside an instance), [ADR-0030](../adr/0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md) (a field is never a handoff destination), [ADR-0033](../adr/0033-chat-is-never-stored-a-report-carries-its-own-evidence.md) (nothing stored) · Supersedes in [FS-R82NV](R82NV-party-formation.md): R2, R3, R4 (delivery wording), R7, R9's kind list, R11, R12 (order and `pod_full`), R14 (expiry notice), R16, R17, R18, R23, R24 and R33; its remaining requirements still hold except where this FS restates them · Builds on: FS-R82NV (same-pod party; its slice 3 presence keeper, pod inbox and ordered writer, commit 66d8ee4), [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) (handoff, pod address, `pod:alive`), [FS-JEAVX](JEAVX-hub-shared-across-replicas.md) (hub occupancy cap) · Siblings: [FS-MCYWK](MCYWK-reconnect-to-the-holding-pod.md) (reconnect to the holding pod), [FS-BJNYC](BJNYC-party-instance-entry.md), [FS-XGW7H](XGW7H-party-chat.md), [FS-V780R](V780R-party-loot-rule.md), [FS-CH21F](CH21F-party-member-overhead-bars.md) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) § Party; [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) § Party terms

## Summary

A party's members may stand on different pods. Anyone can invite anyone, wherever either of them
is; accepting makes the invitee a member on the spot, and nobody is moved. A member who wants to
join the others presses **Travel** beside the leader's frame, from their own village, and is taken
to the village of the leader's pod. The party lives in Redis rather than on any one pod, so the
leader can be anywhere and the party outlives any pod; each pod keeps a copy for its own players so
play never waits on Redis. An open invite holds a place in the party and shows to every member as a
skeleton row. *(Amended 2026-11-02, charter; Nick: nobody forms a party inside the tower: a
player in a run cannot invite or create, and an invite to a player in a run is refused when sent
(R9, R10, R15, R23). Charter default (Nick approved 2026-11-02).)*

**Lane:** the server side is **human lane** (Nick hand-codes, or authorises the agent per slice,
as with FS-R82NV); the client side is agent lane.

## Requirements

### Party state (game-service)

1. **A party's state lives in Redis** (ADR-0036): its id, leader, members in join order (player
   id, character name, class, joined at), creation time, settings slot (FS-V780R), and its open
   invites. No pod is its home. Each member's pointer `player:<player_id>:party` → party id. A
   player is in at most one party. Nothing is stored in a database.
2. **Every mutation is one Lua script** doing the final atomic check and write: invite, accept,
   decline, leave, kick, transfer, create, and removing an expired member. Who may act, the refusal
   order and the notice copy are checked in Go before the script runs; the script re-checks what
   could have changed (a slot, a membership, the leader) and returns a refusal code instead of
   writing when it no longer holds. A pod never mutates a party by read-modify-write outside a
   script. *(Amended 2026-11-02, I-NCC9J-4; Nick: the arrival read (R6) and the re-read (R4) are
   scripts that write too: they keep each member's record (R17), and may mark a member away or
   back or remove an expired one, moving the party's version on.)*
3. **Open invites reserve slots.** They live with the party (a sorted set scored by expiry); every
   script prunes expired entries before it counts. Members plus open invites never exceed the party
   size (`PARTY_SIZE`, FS-R82NV R8). An accept therefore never meets a full party.
4. **Party cache.** Each pod keeps an in-memory copy of the parties of the players it holds (any
   world). Reads on the hub loop and in world ticks (frames, panel, party chat audience, field loot
   allocation) use the cache, never Redis. Writes always go to Redis. The cache is updated from
   party letters (R5) and re-read from Redis for each cached party every 10 s; a pod drops a party
   from its cache when it holds none of its members. A stale cache may change what is shown or
   which refusal is noticed early, never an outcome.
5. **Fan-out by party letters.** After a mutation, the pod that made it looks each member's pod up
   in the presence index (R7) and sends a `party_update` letter to that pod's inbox (FS-R82NV R9,
   the inbox kept), which updates its cache and delivers the update to the member. A member with
   no presence entry (offline) gets nothing; they read the party on return (R6).
6. **Arrival read.** When a player is seated on a pod (connect, travel, reconnect), the pod reads
   their party from Redis, caches it, and sends them a full `party_update`, so a letter missed while
   they were moving costs nothing. A player in no party is sent a `party_update` listing no members,
   so a client that kept its party across a reconnect lets it go. A player seen on a new connection
   is read again. *(Amended 2026-11-01, I-NCC9J-3 round 4; Nick.)*
7. **Presence covers every connected player with a character** (redefines FS-R82NV R7): keys
   `presence:name:<lower(name)>` and `presence:id:<player_id>`, Redis hashes `{player_id, name,
   pod_id, world}` where `world` is `hub` | `field` | `run`. Written by the pod that holds the
   player, sampled on the hub loop's tick (seat the new, unseat the gone, refresh all every 10 s,
   TTL 30 s); unseating deletes only keys that still name this pod (compare-and-delete). The pod
   keeps a player's entry while it holds them within the reconnect grace (FS-MCYWK). A name with no
   entry is **offline**. *(Amended 2026-11-02, I-NCC9J-5; Nick: each hash also carries `pod_addr`,
   the holding pod's address, written with every seat, so a travel finds where to send a member
   (R18).)*
8. **Redis HA.** Party mutations depend on Redis (ADR-0036). While Redis is unreachable every
   mutation is refused with `party_notice` `unavailable`; reads keep working from the cache, and
   runs are unaffected.

### Invites (game-service)

9. **Who may invite, and from where:** the leader, or a player in no party, from **any world**
   (hub, field, run). A non-leader member is refused `not_leader`. *(Amended 2026-11-02, charter;
   Nick: "進塔不能組對 … 應該從一開始就不能組 而不是最後不能按". A player in a run cannot invite:
   `party_invite` from them is refused `locked` (copy "Not while delving.", the prompt's own), so
   inviting works from the hub and from a field only. Charter default (Nick approved 2026-11-02);
   reason: block at the source, the client only reflects it early (R23). Fields stay open, inviting
   and accepting there both allowed (charter default, Nick approved 2026-11-02; reason: Nick named
   only the tower).)*
10. **`party_invite {name}`** (name or player id, trimmed, case-insensitive). Refusals, as
    `party_notice`, in this order: `not_leader`, `queued` (the inviter is in the Spire queue),
    `party_full` (members + open invites = size), `self`, `not_found` (no presence entry:
    offline, or no such name), `already_in_party` (the target's pointer names a live party),
    `pending` (this party already has an open invite to them). `pod_full` is no longer checked at
    invite (R18). A player with no party who invites becomes the leader of a party of one only once
    the invite is delivered, as in FS-R82NV. *(Amended 2026-11-02, charter; Nick: two refusals join
    the list, which now reads `locked`, `not_leader`, `queued`, `party_full`, `self`, `not_found`,
    `in_run`, `already_in_party`, `pending`.
    **`locked`** (no name): the inviter is in a run (R9). It heads the list: it is the inviter's
    own world, read from this pod's directory with no Redis read, and the refusal the client
    already shows by greying Invite in a run for everyone. For a target on another pod it is
    checked again with the inviter's other standing when the lookup returns, since the inviter may
    have entered a run meanwhile.
    **`in_run`** with the target's name: the target is in a run, so they are never sent the
    invite, no slot is reserved, and an inviter with no party does not become a leader. It is read
    from what the invite has already: for a target this pod holds, the directory's `InRun`; for one
    on another pod, the `world: run` of the presence entry the lookup just read (R7). It sits after
    `not_found` because it needs the target found, and before `already_in_party` because for a
    target on another pod that refusal is finally decided by the invite script: putting `in_run`
    after it would need a further Redis read or a change to the script, while here it is decided in
    Go before the script runs and the script and the party's Redis structure stay as they are (Nick
    did not specify the place; this one is chosen as needing no extra Redis read). A presence entry
    lags a world change by up to one hub tick; an invite that slips through it meets R24.
    Charter default (Nick approved 2026-11-02); reason: no invite the target cannot accept.)*
    *(Amended 2026-11-02, charter; Nick: the code is in_run, the copy unchanged; reason:
    game-service CONTEXT.md keeps "run" in server code and "delve" in UI copy, as `not_in_hub`
    already does.)*
11. **Delivery anywhere.** The invite goes to the target's pod inbox and is delivered to the target
    in whatever world they stand (FS-R82NV R13's payload, `size` the cap). The inviter gets `sent`
    when the letter is queued, `delivery_failed` if it cannot be published. A letter for a player
    the receiving pod no longer holds is dropped (Debug); the invite expires.
12. **Expiry.** An invite expires 60 s after it is sent, by its expiry in the party's set; an
    accept after that fails (`expired`). The server sends **no** expiry notice: the leader's client
    shows "No answer from <name>." when the reserved slot expires (R27). The slot frees.
13. **`party_decline {invite_id}`** from the target, on any pod: the decline script runs on the
    target's pod (the party is in Redis); the slot frees and whoever leads now gets `declined` with
    the name. Unknown or expired ids are ignored.
14. **`party_accept {invite_id}`** from the target, **where they stand, on any pod; nobody moves.**
    Refusals: `already_in_party`, `queued`, `locked` (the accepter is in a run: until FS-BJNYC
    gives every run a party, accepting inside one is refused, ADR-0035), `party_gone` (the party
    ended), `expired`. On success the invite becomes a membership in one script, the accepter's
    other open invites are voided (their leaders told `already_in_party`, FS-R82NV's voiding kept),
    and every member gets `party_update` reason `joined`. *(Amended 2026-11-02, charter; Nick:
    kept as the safety net. Since an invite to a player in a run is refused when sent (R10
    `in_run`), accepting inside a run is met only by a target who was invited outside one and
    entered a run within the invite's 60 s; they are still refused `locked`. Charter default (Nick
    approved 2026-11-02); reason: the one case left.)*
15. **`party_create`** (FS-R82NV R4a) is allowed **anywhere**, like an invite. Refusals:
    `already_in_party`, `queued`. *(Amended 2026-11-02, charter; Nick: like an invite (R9), creating
    works from the hub and from a field only: `party_create` from a player in a run is refused
    `locked` ("Not while delving."), first, ahead of `already_in_party` and `queued`, read from this
    pod's directory as at invite. Charter default (Nick approved 2026-11-02); reason: block at the
    source, the client only reflects it early.)*

### Membership (game-service)

16. **Leave, kick, transfer and succession** keep FS-R82NV R19–R22's rules (`target_id`; refusals
    `not_leader`, `not_member`, `locked` seam; the removed player's final update; `left` then
    `leader` when the lead passes to the earliest-joined), now from any pod, each one script. The
    leader may be on any pod.
17. **Away and removal.** Each member has a record refreshed every 10 s by the pod holding them,
    TTL **5 minutes**. A member whose record has not been refreshed for about **30 s** is `away`
    (every kind of drop; a refresh or a brief drop never shows "away"). When the record expires,
    the next pod to touch the party removes them by script, with succession if they led, and every
    member gets `party_update` reason `left`. Each pod also checks, every tick, the parties in its
    cache for expired members. A member seated again anywhere within 5 minutes is refreshed by that
    pod and stays. *(Amended 2026-11-02, I-NCC9J-4; Nick: the record is a field per member in a
    hash kept with the party, stamped by the refreshing pod's clock, never moved backwards; its 5
    minutes are enforced by the scripts that keep it, not by a key TTL. Away counts from the last
    refresh, so it is **40 s** (30 s and one refresh interval): a drop under 30 s never shows away
    wherever it falls between refreshes, and a member really gone shows away 30 to 40 s after the
    drop. "The next pod to touch the party" is the next re-read (R4) or arrival read (R6) on any pod
    holding a member, and a tick re-reads any party whose cached copy shows a member due to go away
    or expire; invite, accept and the other changes do not sweep. A member seated again only after
    their record expired is removed by that read.)*

### Travel (game-service)

18. **`party_travel`** (no payload) from a member: they are sent `world_handoff {addr: <the leader's
    pod address>, hub: true}` and follow it to that pod's hub. Refusals, as `party_notice`, in this
    order: `not_member`, `not_in_hub` (the traveller is not in their village: a field or a run),
    `queued`, `leader_away` (the leader's record is away, R17, the same signal the frames grey on),
    `pod_full` (the leader's pod's hub is at its occupancy cap, FS-JEAVX). A member already on the
    leader's pod is answered with nothing (the client never offers it). The leader cannot travel
    (there is no one to travel to). *(Amended 2026-11-02, I-NCC9J-5; Nick: the leader's pod and its
    address come from the leader's presence entry (R7); a leader present on no pod is `leader_away`.
    Each pod publishes its hub's count to `hub:occ:{podID}` on a 3 s TTL, when it changes and at
    least every 2 s (FS-JEAVX R19's
    key; JEAVX's summed cap is not built here), and `pod_full` means the leader's pod's hub is at
    its cap **plus one full party** (`HubTravelMargin`, 4); an unpublished count is not refused, and
    arrival checks again (R20). The refusals are checked on the party, queue, presence and count
    read from Redis, never on the cache, so a stale cache never
    changes the outcome (R4); a press while the last is being read is ignored. A leader whose entry
    names no address yet (a pod from before addresses were kept) is `unavailable`.)*
19. **The old pod lets go at once.** When it sends the travel handoff, the traveller's pod unseats
    their presence and, when their old socket closes, does not hold them for the reconnect grace, so
    FS-MCYWK never returns them to the pod they left. *(Amended 2026-11-02, I-NCC9J-5; Nick: the
    let-go holds for the handoff's own 15 s; a traveller the presence index then finds on another
    pod arrived there and stays let go, however long the old socket takes to close; anyone else
    still there on the same socket was not taken (their arrival refused, R20) and is present there
    again. A new connection to that pod ends the let-go too. While let go they are out of the
    presence index only: the old pod still holds them and reconciles their party (R21a).)*
20. **Arrival** is an ordinary hub entry on the leader's pod (`enter_hub`, normal spawn point). Its
    cap is checked again there; a refused arrival leaves the client on its old socket with the
    notice (FS-K2HKP's make-before-break). *(Amended 2026-11-02, I-NCC9J-5; Nick: a player entering
    the hub of a pod their party's leader stands on (its hub, a field or a run) is admitted up to
    one full party past the cap (`HubTravelMargin`), whether they came by travel or not; the server
    reads who leads their party itself, never trusting the client. The margin is the hub's, shared
    by every party there, first come; a per-leader allowance is left for later. Anyone else is held
    to the cap, and the refusal is enter_hub's own "The hub is full".)*

### What members are told (game-service)

21. **`party_update`** keeps FS-R82NV R21's shape and adds `reserved: [{name, expires_at}]`, one per
    open invite, and for each member `online` (false while `away`), `pod_id` (the pod holding
    them: the sending pod's own id for a member it holds, otherwise the presence index's; empty
    with no presence entry) and `where` (`hub`, `field` or `run`, from the same source; empty
    likewise). `size` is the cap. It is sent to every member present on some pod on every change,
    open invites included; a member present nowhere is offline and reads the party on return (R6).
    Reasons: `joined` when someone comes in (an accept, a `party_create`, and an invite that creates
    the party, which tells its new leader `joined` as FS-R82NV does, the slot already among
    `reserved`); `invited` when a slot is reserved in a party that stood already; `invite_ended`
    when one frees (declined, voided by an accept elsewhere, withdrawn); `left` (then `leader` if
    the lead passed) when a member's record expires (R17). An invite's expiry sends
    nothing: the next update leaves the slot out, and the client drops its row at `expires_at`
    (R26, R27). `sync` when the pod resends the party as it stands, to a player newly seated (R6)
    or whose screen differs from it (R21a). A `sync` listing no members, with `party_id` and
    `leader_id` empty, tells a player they are in no party. *(Amended 2026-11-01: `pod_id` added so
    the client can tell who stands on the leader's pod, R28; `where` values, the invite reasons and
    the silent expiry, I-NCC9J-3 E5, E6; `sync` and the empty update, I-NCC9J-3 round 4; Nick.)*
    *(Amended 2026-11-02, I-NCC9J-4; Nick: a member going away or coming back (R17) is told to every
    member as `sync` about them, the party as it stands; `online` is false while they are away.)*
21a. **Each pod reconciles what its players see.** It records the last `party_update` queued for
    each player it holds, against the connection they are seated on (a party at a version, or
    none), and, after every re-read (R4), sends `sync` to each whose record differs from its
    cache: no record, a newer version, another party, or no party where they were shown one. The
    sync goes out like any update, with each member's pod and world (R21), and is checked again as
    it leaves: one whose party has changed or ended since it was built is not sent (the change
    tells the player, or the next reconcile does), nor one the player's record already shows. This is the only resend: a letter lost
    on its way costs at most one re-read, for a removed player too, who is no longer a member. *(Added 2026-11-01,
    I-NCC9J-3 round 4; Nick.)*
22. **Logs** never carry invite text beyond names; refusals at Debug, delivery and Redis failures at
    Warn (FS-R82NV R25).

### Party panel and prompt (game-client)

23. **Invite and Create** are usable in every world: the Invite field and button and the Create
    party button are no longer greyed outside the town (FS-R82NV R29, R30 amended). *(Amended
    2026-11-02, charter; Nick: usable in the town and in a field; in a run the Invite field, its
    button and the Create party button are greyed, as the server refuses them there (R9, R15).
    Charter default (Nick approved 2026-11-02); reason: block at the source, the client only
    reflects it early.)*
24. **The invite prompt shows in every scene** (supersedes FS-R82NV R33), hidden only under the
    end-of-run overlay. In a run its Accept is greyed with "Not while delving." until FS-BJNYC.
    *(Amended 2026-11-02, charter; Nick: kept as the safety net. No invite reaches a player already
    in a run (R10 `in_run`); a target who received one in the village or a field and entered a run
    within its 60 s still sees the prompt, Accept greyed. Charter default (Nick approved
    2026-11-02); reason: the one case left.)*

### Party frames (game-client)

25. **Frames** (FS-R82NV R34 as amended): the player first, then members in join order. A teammate
    whose health is in the player's own world's state shows bars; any other teammate shows **name
    and class bust only**, no state word; an away member is greyed.
26. **Skeleton rows.** After the members, one row per entry in `reserved`: the invitee's name and a
    grey pulse where the bust and bars go, no countdown, seen by every member. It becomes a real
    frame when the invitee joins and goes when the invite is declined or expires.
27. **Expiry line.** When a reserved slot's `expires_at` passes without a join, the **leader's**
    client writes "No answer from <name>." as a system line; other members see the row go.
28. **Travel button.** Beside the leader's frame, labelled **Travel**: shown to every member who is
    not on the leader's pod (their own `pod_id` differs from the leader's, R21); pressable only in the player's own town; greyed in a field, in a run,
    and while the leader is away. Pressing sends `party_travel`; the client follows the
    `world_handoff` as it follows any (FS-K2HKP), keeping its old socket if the move is refused.
    *(Amended 2026-11-02, I-NCC9J-8; Nick: the button sits on the leader's frame, at the right end
    of the name line (past the frame's edge the T panel would cover it), and a long name is
    shortened short of it. A missing or empty `pod_id`, the player's or the leader's (a leader on
    no pod is offline), hides it. The hub handoff connects to `addr` and enters its hub as the
    player's character; a refused entry or an unreachable server keeps the old socket and says why
    as a system line.)*

### Notice copy (game-client)

29. New and changed `party_notice` codes (FS-R82NV R36's table otherwise holds):

| code | copy |
|---|---|
| `leader_away` | "Your leader cannot be reached." |
| `unavailable` | "The party cannot be changed right now." |
| `expired` | "That invitation has lapsed." (the accepter's view; the leader's line is R27's) |
| `pod_full` | "No room where your party stands." (now at travel) |
| `not_in_hub` | "Only from the village." (now: travel only) |
| `in_run` | "<name> is in a delve." (the invite's target is in a run, R10) |
| `locked` | "Not while delving." (now also at invite and create from a run, R9, R15; the prompt's Accept keeps the same words, R24) |

*(Amended 2026-11-02, charter; Nick: `in_run` added and `locked` extended. Charter default (Nick
approved 2026-11-02); reason: `locked` reuses the words the prompt already shows; `in_run`
names the target so the inviter knows whom to ask later.)*
*(Amended 2026-11-02, charter; Nick: the code is in_run, the copy unchanged)*

## User Stories

1. As a player, I want to invite a friend wherever they are, so that I need not wait for them to come back to town. *(Amended 2026-11-02, charter: wherever they are outside the tower; see story 25.)*
2. As a player in a field, I want to invite someone without walking home first, so that grouping never interrupts what I am doing.
3. As an invitee, I want to accept and stay where I am, so that joining a party never pulls me out of a field or across servers.
4. As an invitee inside a delve, I want to be told I cannot accept there, so that I know to answer once I am out. *(Amended 2026-11-02, charter: now only an invite received before entering, R24.)*
5. As a leader, I want an open invite to hold a place, so that whoever accepts is sure to fit.
6. As a member, I want to see a placeholder for each invite still open, so that I know someone is on the way and how many places are left.
7. As a leader, I want a line when an invite lapses unanswered, so that I know to ask someone else.
8. As a member on another server, I want a Travel button beside my leader, so that I can join the others when I choose.
9. As a member in a field or a delve, I want Travel greyed with a reason, so that I never lose a field's haul or a delve by pressing it.
10. As a member, I want Travel to take me wherever my leader is now, so that I land where the party is gathering.
11. As a member, I want Travel greyed while my leader is away, so that I am not sent to an empty village.
12. As a member, I want to be told when my leader's village is full, so that I know why I did not move.
13. As a leader on any server, I want to keep leading, so that where I connected does not decide whether I can lead.
14. As a member, I want leadership to pass to a teammate on another server if I leave, so that the party keeps working.
15. As a member, I want my party to survive one server going down, so that my teammates elsewhere stay grouped.
16. As a member, I want a short drop not to show me as away, so that my teammates are not alarmed by a page refresh.
17. As a member, I want a teammate gone five minutes to leave the party on their own, so that their place frees without anyone acting.
18. As a member, I want bars for teammates in my world and just a name and portrait for the rest, so that the frames say at a glance who is with me.
19. As a player, I want to create a party anywhere, so that creating and inviting follow one rule. *(Amended 2026-11-02, charter: anywhere outside the tower, still one rule with inviting.)*
20. As a member who reconnects or travels, I want my party shown at once on arrival, so that I never see a stale party.
21. As an operator, I want a party to need no hand-over when its leader moves or a pod dies, so that there is no migration to get wrong.
22. As an operator, I want game ticks never to wait on Redis, so that a slow Redis cannot stall play.
23. As a developer, I want each party change to be one atomic script, so that concurrent actions on different pods can never overfill a party or double-book a player.
24. As a developer, I want the party rules in Go and only the last check in Lua, so that the rules stay readable and testable.
25. As a player, I want an invite to someone in a delve refused when I send it, naming them, so that I never send an invite that can only lapse. *(Added 2026-11-02, charter.)*
26. As a player in a delve, I want Invite and Create party greyed, so that I see at once that parties form outside the tower. *(Added 2026-11-02, charter.)*

## Acceptance Criteria

- [ ] A player on pod A invites a player in a field on pod B; the prompt shows on B; accepting there makes them a member with no `world_handoff`, and both get `party_update` with two members.
- [ ] An accept inside a run is refused `locked`; an invite to a player already in a party is refused `already_in_party`, from any pod. *(Amended 2026-11-02, charter: the accept case is now a target invited outside a run who entered one within the 60 s, R14.)*
- [ ] `party_invite` and `party_create` from a player in a run are refused `locked`, first in their lists; a cross-pod invite whose inviter entered a run while the lookup was out is refused `locked` when it returns. *(Added 2026-11-02, charter; R9, R10, R15.)*
- [ ] An invite to a player in a run is refused `in_run` with their name, for a target on the same pod (directory `InRun`) and on another pod (presence `world: run`); the target gets no `party_invite`, no slot is reserved, an inviter with no party is left in none, and the invite script is not run. *(Added 2026-11-02, charter; R10.)* *(Amended 2026-11-02, charter; Nick: the code is in_run, the copy unchanged)*
- [ ] Inviting and accepting in a field work as before. *(Added 2026-11-02, charter; R9.)*
- [ ] Refusals of an invite fire in R10's order under a table-driven test, cross-pod rows included. *(Amended 2026-11-02, charter: R10's amended order, `locked` and `in_run` rows included.)* *(Amended 2026-11-02, charter; Nick: the code is in_run, the copy unchanged)*
- [ ] With size 2 and one open invite, a second invite is refused `party_full`; two accepts racing for one party on two pods never exceed the size (concurrent script test on miniredis).
- [ ] Every member gets `reserved` entries for open invites; a decline or expiry removes the entry and frees the place.
- [ ] Leave, kick, transfer and succession work across pods: a leader on pod B transfers to a member on pod A; the leader leaving promotes the earliest-joined wherever they are.
- [ ] A member whose pod stops refreshing shows `online: false` after ~30 s and is removed after 5 minutes, with succession if they led.
- [ ] `party_travel` from a member in their village sends `world_handoff {hub: true}` to the leader's pod address; refused `not_in_hub` in a field or run, `queued`, `leader_away`, `pod_full`, in that order.
- [ ] After a travel handoff the old pod no longer holds the player in presence nor in the reconnect grace.
- [ ] A player seated on a pod receives a full `party_update` read from Redis.
- [ ] With Redis unreachable, a mutation is refused `unavailable`; the frames still render from the cache.
- [ ] Presence holds players in fields and runs, with `world`; keys vanish on leaving and lapse within 30 s of a pod stopping.
- [ ] No party read happens on the hub loop or in a world tick (reads come from the party cache).
- [ ] Client: Invite and Create party work in every world; the prompt shows in every scene, Accept greyed in a run. *(Amended 2026-11-02, charter: Invite and Create party work in the town and a field and are greyed in a run (R23); the prompt keeps showing, Accept greyed, for an invite received before the run (R24); `in_run` reads "<name> is in a delve." (R29).)* *(Amended 2026-11-02, charter; Nick: the code is in_run, the copy unchanged)*
- [ ] Client: frames show the player first, bars only for teammates in the player's world, name and bust otherwise, skeleton rows for `reserved`, and a Travel button beside the leader per R28.
- [ ] Client: the leader's client writes "No answer from <name>." when a reserved slot expires.
- [ ] `go test ./... -race` on the touched packages (Lua scripts tested on miniredis) and `vitest` green; lint fence passes.

## Edge States

- **Concurrent accepts on two pods:** each accept consumes its own reservation, so both fit; two accepts of the *same* invite: the first script consumes it, the second finds no invite and is ignored.
- **Concurrent kick and leave of one member, on two pods:** the first script removes them; the second finds no such member → `not_member`.
- **Invitee joins another party first:** their pointer is set and their other invites are voided by the accept script; a stale accept of a voided invite finds nothing.
- **Leader on a pod that dies:** the leader's record stops refreshing; after ~30 s the leader is away (Travel greys); after 5 minutes succession passes the lead. Members elsewhere stay a party throughout.
- **Every member away:** the party persists until the last record expires, then ends and its keys go.
- **Travel while the leader is mid-handoff:** the leader's pod is read from presence at press time; a refused arrival on a pod the leader just left keeps the traveller where they were.
- **Travel and reconnect:** the old pod has let go (R19), so FS-MCYWK does not bounce the traveller back.
- **Redis restart without persistence:** every party is gone; caches empty on the next re-read; members see their party leave the panel. Accepted (ADR-0035).
- **Redis unreachable:** mutations refused `unavailable`; caches keep serving reads; runs unaffected.
- **A letter dropped:** the 10 s re-read or the next arrival corrects the cache, and the reconcile after the re-read (R21a) corrects every screen here, a removed player's included.
- **Unauthorized:** every action is keyed by the connection's player; a decline or accept of an invite addressed to someone else is ignored; nothing trusts a client-supplied party id.
- **Empty:** a player in no party sees no frames; Travel is never shown; `party_travel` → `not_member`.
- **Target enters a run as the invite is sent:** the presence entry lags a world change by up to one hub tick, so a target on another pod may be found `hub` or `field` and sent the invite; the prompt shows in the run with Accept greyed (R24), an accept is refused `locked` (R14), and the invite expires. *(Added 2026-11-02, charter.)*
- **Invited in the village, then into a run within 60 s:** the prompt stays, Accept greyed; declining still works. *(Added 2026-11-02, charter; R14, R24.)*
- **Inviter enters a run while a cross-pod lookup is out:** the inviter's standing is checked again when the lookup returns, and the invite is refused `locked`. *(Added 2026-11-02, charter; R10.)*
- **A party member in a run:** leave, kick and transfer keep FS-R82NV's rules there; only inviting and creating are closed. *(Added 2026-11-02, charter default (Nick approved 2026-11-02); reason: not asked.)*

## Out of Scope

- Party chat across pods (FS-XGW7H: it must cross pods; the inbox fan-out here is the likely path, decided there).
- The loot rule and its same-world allocation (FS-V780R).
- Auto-formed parties, solo runs as parties of one, party entry and the instance lock (FS-BJNYC); until then, R14's `locked` stands in.
- Reconnecting to the pod still holding a player (FS-MCYWK), except R19's let-go on travel.
- Teammates' health and resource beyond the player's own world (FS-CH21F); a location label on frames (data kept, not shown).
- Spawning the traveller beside the leader (normal spawn point).
- Moving a party's state when Redis fails over (Redis HA's concern).
- Closing party-forming in fields (inviting and accepting there stay allowed), and any change to leave, kick or transfer inside a run. *(Added 2026-11-02, charter defaults (Nick approved 2026-11-02); reasons: Nick named only the tower; not asked.)*
