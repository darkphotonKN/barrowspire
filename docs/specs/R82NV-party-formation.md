# FS-R82NV: Party formation

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Party" → "Form a party across pods", "Player presence index across pods", "Joining a party moves the player to the party's pod"; `game-client/SPECIFICATION.md` "### Party" → "Party panel", "Party invites", "Follow a handoff into the hub" → this FS · Siblings (same scoping session, 2026-11-01): [FS-BJNYC](BJNYC-party-instance-entry.md) (enter an instance as a party), [FS-XGW7H](XGW7H-party-chat.md) (party channel), [FS-V780R](V780R-party-loot-rule.md) (loot rule) · Builds on: [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) (the handoff, reused with the hub as destination), [FS-JEAVX](JEAVX-hub-shared-across-replicas.md) (hub occupancy cap per pod), [FS-5SH4G](5SH4G-world-chat.md) (the Redis subscriber → hub-loop path, reused for the pod inbox) · Related ADRs: [ADR-0030](../adr/0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md) (its parked "join a friend's channel" is what this FS builds; amendment pending via `record-decision`), [ADR-0033](../adr/0033-chat-is-never-stored-a-report-carries-its-own-evidence.md) (same ephemerality stance) · Shares with: [FS-KCQ06](KCQ06-whisper.md) (the presence index is the name → pod lookup whisper needs) · Vocabulary: *party*, *leader*, *party invite*, *presence index*, *pod inbox*, *party pod* pending via `domain-model`

## Scoping notes (raw)

Scoped 2026-11-01 with Nick. Nothing here is a requirement yet; `write-a-spec` turns it into one.

### What a party is

- A party is the **universal roster for every instance** (the Spire today, every later dungeon). It
  is not Spire-specific. Decided first and everything below hangs off it.
- A party **persists**: it outlives the instance it entered. After a run ends the members come back
  to the hub still grouped, and stay grouped until they leave or the party empties. Random
  matchmaking therefore becomes one way to meet teammates (see FS-BJNYC for the auto-party).
- One party per player at a time.
- **Size** is a config value: 2 today, at most 4 later. The matchmaker's match size reads the same
  value so the random roster and a full party are the same shape. Nick: "目前是2人 但這應該不重要到時再增加就好了最多可能4人".

### Where a party lives

- A party has a **party pod**: the leader's pod at creation. **Every member is on the party pod.**
  Accepting an invite = being handed off to the party pod (the K2HKP reconnect, destination the
  hub instead of a run). Decided by Nick after the cross-pod invite discussion: "加入隊伍後可以移動到
  隊長的pod". This unparks ADR-0030's "join a friend's channel": once on the same pod, members see
  each other in the hub and in the fields.
- Because members share a pod, the full party state (members, leader, loot rule, pending invites,
  ready check) can live **in the party pod's memory**. Redis holds only what other pods must look
  up:
  - `presence:name:<character name>` → `{player_id, pod_id}`, written on hub entry, TTL ~30 s
    refreshed by the pod, deleted on leave. This is the **presence index**; whisper (FS-KCQ06)
    will use the same key.
  - `party:<party_id>` → party pod (so a reconnecting member, or an inviter's pod, can find it).
  - `player:<player_id>:party` → party id.
  - All with TTL; nothing in Postgres. A party is ephemeral like chat (ADR-0033 stance).
- **Pod inbox**: each pod subscribes to `pod:<pod_id>:inbox` on the same Redis subscriber → hub-loop
  path FS-5SH4G built for `chat:world`. Cross-pod messages that target one player (invites, the
  "you were pulled to pod X" instruction) are published to the target pod's inbox; that pod finds
  the socket and delivers. No pod needs another pod's address.
- Concurrent edits: with state on one pod, the hub loop serialises them; only the three Redis
  pointers need atomic writes (Lua, as `Matchmake` already does).

### Invites

- Invite by **typing a character name or player id** on the party panel (Nick: "邀請可以輸入能取得跟代
  表的遊戲id或名稱"). Cross-pod via the presence index + pod inbox. Clicking a visible player was
  offered (option A) and not chosen; it may come later as a convenience.
- Invitee sees the invite (panel or chat-area notice: "X 邀請你入隊") with accept / decline; **60 s**
  timeout.
- Refusals back to the inviter as a notice line (the `chat_notice` shape): name not found / offline,
  already in a party, inside an instance, party full, **party pod at its occupancy cap** (FS-JEAVX
  cap; the pull would exceed it).
- Accept → handoff to the party pod → on arrival the member is added and every member's panel
  refreshes.
- Random-matchmaking auto-party (FS-BJNYC) needs no invite: matched players already hand off to the
  host pod, which becomes the party pod.

### Leadership and membership

- Leader is the creator. Panel shows the leader with one icon; otherwise members look alike.
- Leader may **kick** and **transfer** leadership. Members may **leave**. All three disabled inside
  an instance (FS-BJNYC's lock).
- Leader leaves or disconnects → the **earliest-joined** remaining member becomes leader. Party pod
  unchanged (everyone is already there).
- Member disconnects and reconnects on another pod → automatically pulled back to the party pod.
  (Default proposed by the agent, not challenged.)
- Last member leaves → party is gone; Redis pointers deleted.

### Party panel (client)

- **T** toggles the panel. Lists members, leader icon, invite field (name / id), kick and transfer
  for the leader, leave for a member, the loot rule selector (FS-V780R; leader only).
- Invite prompts and the ready check (FS-BJNYC) surface here too.
- Look: game palette, carved panel like the chat window (`carvedPanel.ts`).

### Alternatives considered

- **Party only for entry + chat, members stay on their own pods** (first option offered). Rejected
  by the move-to-leader's-pod decision; it would have left teammates invisible to each other in
  the hub.
- **Full party state in Redis** (first proposal). Superseded once all members share a pod; kept as
  pointers only.
- **Party chat over Redis**: unnecessary now, pod-local broadcast suffices (FS-XGW7H).

### Open questions

- Exact presence TTL / refresh cadence; whether presence is written in fields and runs too (an
  invite to someone in a run is refused anyway, but "offline" vs "busy" is a nicer notice).
- Whether an invite may be sent from inside a field (sender side). Proposed: hub only, like
  `find_game`.
- Hub handoff arrival: K2HKP seats an expected player in a run; the hub variant needs an "expected
  arrival into the hub" so the receiving pod does not treat it as a fresh login on the wrong pod.
- Name collisions in the presence index (two characters with one name) — depends on whether names
  are unique in character-service; verify before write-a-spec.

### Parking lot

- Invite by clicking a visible player.
- Friends list / offline invites.
