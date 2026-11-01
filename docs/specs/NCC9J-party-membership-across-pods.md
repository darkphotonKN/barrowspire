# FS-NCC9J: Party membership across pods

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Party" → "Party membership across pods", "Player presence index across pods", "Travel to the party leader's village"; `game-client/SPECIFICATION.md` "### Party" → "Travel to the leader's village from the party frames" → this FS · Supersedes the cross-pod parts of [FS-R82NV](R82NV-party-formation.md) (R16's other-pod branch, R17, R18, and R22–R24 as written there) · Related ADRs: [ADR-0036](../adr/0036-party-state-lives-in-redis-membership-spans-pods.md) (party state in Redis, membership spans pods; supersedes [ADR-0034](../adr/0034-a-party-lives-on-one-pod-joining-is-a-hub-handoff.md)), [ADR-0035](../adr/0035-a-party-is-the-universal-instance-roster-ephemeral-and-locked-inside.md), [ADR-0030](../adr/0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md) · Builds on: FS-R82NV (same-pod party, merged first), [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) (handoff), [FS-5SH4G](5SH4G-world-chat.md) (bus path) · Siblings: [FS-BJNYC](BJNYC-party-instance-entry.md), [FS-XGW7H](XGW7H-party-chat.md), [FS-V780R](V780R-party-loot-rule.md), [FS-CH21F](CH21F-party-member-overhead-bars.md), [FS-MCYWK](MCYWK-reconnect-to-the-holding-pod.md)

## Scoping notes (raw)

Captured 2026-11-01 from a challenge-me session with Nick (feat/party-formation thread), after
FS-R82NV slices 1, 2, 6, 7, 9–12 shipped on one pod and slice 3 (presence index, pod inbox,
cross-pod invite and decline) was built but left uncommitted. The design was attacked, not just
scoped; every item below held under questioning.

### The shape

- **Membership is independent of where a player stands.** Members may be on different pods.
  Nobody is moved by joining.
- **Invite anyone, from anywhere.** The inviter may be in the village, a field or a run; the
  target may be anywhere (any world, any pod) and receives the invite there. (FS-R82NV limited
  both to the hub.)
- **Accepting makes the invitee a member where they stand**, on whatever pod, with no handoff.
  (FS-R82NV R16's other-pod branch, R17 expected arrival, R18 missed arrival: gone.)
- **Players in a run already have a party**: a random match forms one (FS-BJNYC's auto-formed
  party), a party entry is that party, and a solo run counts as a party of one (FS-BJNYC). So an
  invite to someone in a run answers `already_in_party` naturally; no "not while delving" rule is
  needed. Until FS-BJNYC lands, runs form no parties, so an accept inside a run is refused
  `locked` ("Not while delving.") to honour ADR-0035.
- **An invite reserves a slot** (Nick chose "rule 2"): members + open invites may not exceed the
  cap; a party with no free slot refuses further invites (`party_full`); an accepted invite is
  guaranteed to fit. Rejected: "rule 1", invites free and fullness checked only at accept (simpler
  concurrency, but an invitee can be told "full" after being invited, and invites can be spammed).
- **Invites expire by Redis TTL (60 s).** An accept after expiry finds no invite and fails. The
  client counts the prompt down on its own clock (as FS-R82NV R14). Open: the inviter's "No answer
  from <name>." notice: either the inviter's client counts down too, or the notice is dropped.

### Travel to the leader

- **A button beside the leader's row in the left-hand party frames** moves the member to **the
  village (hub) of the leader's current pod**, by the existing handoff mechanic (FS-K2HKP; ADR-0030:
  a field is never a handoff destination, so the destination is always the hub).
- **Pressable only from the member's own village.** Greyed in a field (leaving one settles the
  visit) and in a run. Rejected: allowing it from a field with an automatic leave-and-settle
  (interrupts the player unexpectedly).
- **The leader may be anywhere** (village, field, run). Greyed only when the leader is offline.
  Hidden when the member is already on the leader's pod. If the leader is in a field, the member
  arrives in that pod's village and walks into the same field (one channel per pod per field). If
  in a run, the member waits in that village.
- **`pod_full` is checked when the button is pressed** (the destination hub's occupancy cap,
  FS-JEAVX), not at invite time, since accepting moves nobody. Copy: "No room where your party
  stands." (FS-R82NV R36).
- Arrival in the leader's village: the normal spawn point (spawning beside the leader stays out of
  scope, as in FS-R82NV).

### Where the party lives: Redis (constraint → ADR-0036)

- **The party's whole state lives in Redis**; no pod is its home. Nick wanted both: (a) a leader
  on any pod (transfer and succession unrestricted), and (b) a party that survives a pod dying.
- Rejected: **a home pod** (state in the creating pod's memory, ADR-0034) with "only members on the
  home pod may lead" (cheaper, but neither (a) nor (b)); and **the home following the leader** (a
  hand-over protocol for in-flight operations, invites and replies).
- Data per party is small (~1 KB; presence ~300 B per player): even 100 000 online is tens of MB.
  The real load is refresh writes, comfortably within one Redis.
- **Accepted cost: Redis becomes a hard dependency for every party mutation.** Mitigation: Redis
  HA (Sentinel / managed standard tier); the client is already `redis.UniversalClient`. Redis was
  already critical (queue, `pod:alive`, handoff, world chat). A Redis restart without persistence
  loses every party, which is acceptable for ephemeral parties (ADR-0035). A run never reads Redis
  for its party: it snapshots what it needs (e.g. the loot rule) at entry.
- **Atomicity: one small Lua script per mutation** (invite, accept, decline, leave/kick, transfer,
  create): each does only the last atomic check and write (e.g. accept: invite still open → remove
  it, add the member, set their `player:<id>:party` pointer; leave: remove, pass the lead to the
  earliest-joined if needed, delete the party when empty). Refusal order, notice copy and
  permissions stay in Go as pre-checks. Open invites live in a sorted set scored by expiry; a script
  prunes expired entries before counting. Rejected: optimistic WATCH/MULTI (retry loops), and a
  per-party lease lock with Go doing the read-modify-write (workable, but "rule 2" made the atomic
  steps small enough for Lua, and Lua has no lock-holder-crash case).

### Delivery and caching

- **Fan-out by pod inbox letters** (FS-R82NV slice 3's inbox): on each change the pod that made it
  looks each member's pod up in presence and sends a `party_update` letter to that pod's inbox,
  which hands it to the member. Rejected: one Redis channel per party with pods subscribing and
  unsubscribing dynamically as members come, go and move (error-prone). A member arriving on a pod
  (travel, reconnect) gets the full party state read from Redis, so a letter missed mid-move costs
  nothing.
- **Each pod caches the parties of the players connected to it.** Reads (frames, panel, party
  chat audience, field loot allocation) use the cache; writes go to Redis through Lua; letters
  update the cache; every 10 s refresh re-reads from Redis (a dropped letter heals within 10 s).
  The reason is not load: **the hub loop and the world tick must never wait on Redis**, and a
  Redis blip should not stop loot, chat or frames. A stale cache cannot cause a wrong outcome: the
  Lua script decides against Redis; the cache only drives early refusals and display. (Nick noted
  the inversion: Redis is the shared source of truth here, the pod memory is the cache, because
  there is no database behind it.)

### Presence (redefines FS-R82NV R7)

- **Every connected player with a character is in the presence index**, with their pod and world
  (hub / field / run), not only hub-seated players. Name key and id key, Redis hashes, TTL 30 s,
  refreshed every 10 s, sampled on the hub loop's tick (slice 3's design, widened). Whisper
  (FS-KCQ06) can then reach players in fields and runs too.
- `not_found` now means offline; a player in a run answers `already_in_party` (above).

### Members going away

- Each member has a record refreshed every 10 s by **the pod they are on now**, TTL **5 minutes**.
- **`away` after ~30 s without a refresh, for every kind of drop.** Nick kept the buffer even for
  a normal disconnect (where the pod knows at once), so a refresh or a brief network drop never
  flashes "away" to teammates. Cost accepted: a real drop shows "away" up to 30 s late.
- When the record expires (5 min), **the next pod that touches the party** (an operation, or the
  per-tick check each pod runs over its connected members' parties) removes the member by Lua,
  passing the lead to the earliest-joined if they led, and notifies the rest. A dead pod's members
  therefore leave on their own after 5 minutes; one who reconnects anywhere within 5 minutes is
  refreshed by the new pod and stays.
- Reconnecting to the pod still holding a player is FS-MCYWK's (not party-specific).

### What players see

- **Party frames:** a teammate in the viewer's world shows bars (as FS-R82NV R34); any other
  teammate shows **only name and class bust, no location label**: missing bars already say "not
  here". Offline members are greyed. The location (`where`, pod) is still stored, for later.
- **A reserved slot shows in the party frames as a skeleton row** (Nick, 2026-11-01): while an
  invite is open, **every member** sees a row for it carrying the invitee's **name**, with a grey
  pulsing placeholder where the bust and the bars go, and **no countdown**. Accepted → it becomes
  the real frame (bust, name, bars when in the viewer's world). Declined or expired → it goes and
  the slot frees. Rejected: leader-only visibility (the slot is the whole party's), a bare pulse
  with no name, a draining 60 s bar. Needs the server to carry open invites (name, expiry) in
  `party_update`, and to send an update to every member when an invite is sent, declined or
  expires: today only the inviter knows an invite is open.
- **The invite prompt** shows in every scene (FS-R82NV R33 limited it to the hub); Accept follows
  the accept rules above.

### Knock-on for sibling specs

- **FS-V780R:** loot is allocated only among members in the same world as the pickup (same run;
  same field channel on the same pod). Recorded in its notes.
- **FS-XGW7H:** party chat must cross pods, by the same inbox fan-out. Implied by this design, not
  discussed in the session: confirm when that spec is written.
- **FS-BJNYC:** a solo run is a party of one; gathering for a party entry now happens by the travel
  button.

### What carries over from FS-R82NV

- Same-pod party (slices 1, 2, 6, 7, 9–12) merges to main first; this FS rebuilds the server side
  on Redis afterwards.
- Slice 3 (uncommitted on feat/party-formation): the presence keeper, the pod inbox, the ordered
  Redis writer, `partypresence` and `partypointer.PartyPodOf` carry into this FS. Its code review
  (2026-11-01) left open: the same-pod path ignored pointers (closes once state is in Redis), the
  `partyRegistry` god-object split, writer drain at shutdown, and the deviations to record.

### Open questions

- The inviter's expiry notice: client-side countdown, or dropped?
- Offline members greyed only, or also labelled? (kept: greyed)
- Does the leader's record also drive the travel button's "offline" state, or presence?
- Party chat across pods: confirm the inbox fan-out in FS-XGW7H.
