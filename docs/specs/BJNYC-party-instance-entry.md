# FS-BJNYC: Enter an instance as a party

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Party" → "Enter an instance as a party from its gate", "Matched players form a party on entry"; `game-client/SPECIFICATION.md` "### Party" → "Enter the Spire as a party" → this FS · Depends on: [FS-R82NV](R82NV-party-formation.md) (the party, its pod, the invite/ready-check shape) · Siblings: [FS-XGW7H](XGW7H-party-chat.md), [FS-V780R](V780R-party-loot-rule.md) · Builds on: [FS-NSV3D](NSV3D-solo-delve-entry.md) (`start_solo`: build a run for a given roster without the queue — party entry is its N-player form), [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) (random matchmaking; the host pod becomes the party pod), [FS-0XMCP](0XMCP-hub-destination-gates.md) (the Spire gate, where entry actions live) · Related: [FS-BDA7X](BDA7X-character-leveling.md) (kill XP already goes to every living, un-escaped member in full — no change) · Vocabulary: *party entry*, *ready check* pending via `domain-model`

## Scoping notes (raw)

Scoped 2026-11-01 with Nick.

### Two doors, one roster

- **Party entry.** The leader at the gate chooses *enter as a party*. The run's roster is the party.
- **Random matchmaking auto-party.** Players matched by the K2HKP queue are put into a party when
  they enter the run (Nick: "如果是隨機配對 入塔後也要自動幫進入的組隊"). The host pod is the party
  pod; after the run they return to the hub still grouped, and may leave the party there.
  - **Leader chosen at random** among the matched players (Nick: "可能隨機選一個當隊長"). Not
    "the first popped" — the host pod is picked that way already and the two need not coincide.
  - Created by the host pod at run creation from the same roster it seats; the party pod is the
    host pod, which every matched player hands off to anyway. Small addition to the existing
    start-a-delve path, no new coordination.
  - A matched player who never arrives (K2HKP's 15 s no-show, left out of the run) is left out of
    the party too. If the random leader is the no-show, the earliest arrival takes over
    (FS-R82NV's succession rule).
- Either way: **the people in the instance == the party members**, so the party channel is the
  instance's chat.
- The Spire is the first instance to use this; every later instance (deeper fields, other
  dungeons) uses the same module. "塔只是一個範例 之後所有副本都通用這個模組".

### Entry rules

- Leader must be at the instance's gate (the Spire gate zone, FS-0XMCP). The other members need not
  be at the gate but must be **in the same world as the leader** on the party pod (for the Spire:
  the hub). Nick revised from "everyone at the gate" to "everyone in the same place, e.g. the
  village".
- Someone in another world (a field, another instance), queued, or disconnected → refused with a
  notice naming them ("X 不在村莊").
- **Ready check (option B, chosen).** On the leader's choice every other member gets a prompt
  ("隊長要出發，準備好了嗎？") accept / decline, **30 s**. All accept → the run starts; any decline or
  timeout → cancelled, everyone told who. The prompt also shows each member's presence state. A
  member leaving the world or disconnecting during the check cancels it. Same pending-request shape
  as the invite (FS-R82NV), so one mechanism serves both.
- Because all members are already on the party pod, **no handoff at entry**: the run is built like
  `start_solo` for N players and every member is world-switched in from wherever they stand.
- A party of 1 entering = solo (FS-NSV3D) — same path, size 1.
- A party choosing *wait for company* (the queue) is **out of scope** for now: parties enter as
  parties. Filling a partial party from the queue is parked.

### Inside the instance

- **Locked**: leave party, kick, transfer, loot-rule change are all refused while the party is in
  an instance. Nick, restated 2026-11-01: "在副本不能退出 除非斷線脫離就當他死了 隊長也不能踢人".
- **Disconnecting inside the instance: the existing reconnect grace stays.** A dropped player keeps
  their seat for the grace the run already gives (client "Reconnect into an in-progress run",
  FS-QPDKN settle rules); only when the grace runs out do they count as dead for this run. Nick:
  "沒有立即生效 就照之前的設計會有一段時間會保持 過久才會真離開". They stay a party member either way
  (the party persists). The loot rule's candidate set follows the run's view: a player in grace is
  still "alive and un-escaped".
- **Leader disconnects inside the instance → a member inherits leadership** at once (earliest-
  joined, FS-R82NV's rule), not after the grace: a leader who reconnects within the grace comes
  back as a member. (Agent's proposal, so the run never waits on a missing leader; not challenged.) Leadership succession is the one party change that is *not* locked
  in an instance, because the run must keep a leader for the loot rule and the next entry.
- Leaving the run itself (die, escape, leave early) keeps the player in the party; they stay a
  member after the run resolves.
- XP: unchanged, FS-BDA7X already grants full kill XP to every living, un-escaped member.
- Loot: FS-V780R.

### After the instance

- Party persists. Members return to the hub on the party pod (K2HKP: hub return needs no reconnect).
- Random-matched strangers who dislike each other simply leave the party in the hub.

### Alternatives considered

- Auto-party dissolves after the run → rejected ("退出塔副本後隊伍會繼續存在").
- Everyone at the gate → relaxed to same world.
- Leader-only confirmation popup (option A) → superseded by the ready check, which shows the
  same information and does not yank a member out of a shop or dialogue.

### Open questions

- Match size vs party size: the queue should read the party size config so a random roster and a
  full party are the same size; decide where the config lives (one env var for both).
- Whether a member mid-field-visit should be pulled out automatically (no: refused, decided above)
  — but should the refusal offer "recall them"? Parked.

### Parking lot

- Queue as a party and fill the rest from the queue.
- Instances entered from a field gate (rule generalises: same world as the leader).
