# FS-MCYWK: Reconnect returns to the pod still holding the player

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Transport" → "Reconnect returns to the pod still holding the player" → this FS · Related ADRs: [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) · Builds on: [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) (handoff, pod address, `pod:alive`), FS-NCC9J's presence index (every connected player, with their pod)

## Scoping notes (raw)

Captured 2026-11-01 from the challenge-me session on party membership across pods (FS-NCC9J). It
came up there, but **it is not a party feature**: it applies to every player, in a party or not.

### The problem

- game-service already holds a dropped player for a reconnect grace (30 s; `holdForReconnect` in
  `handler.go`): their record, world and queue place are kept, and a reconnect resumes them where
  they stood.
- That record lives in **the holding pod's memory**. A fresh connection is routed by the load
  balancer **before** any pod looks for a record, and the balancer knows nothing of it. So the
  in-place reconnect works only if the new connection happens to land on the same pod.
- The client's `serverAddr` follows handoffs (FS-K2HKP R29), so a player who was handed off
  reconnects to that pod. But a player who never was (most hub players) reconnects through the
  shared entry address, and **any page refresh or new login** resets `serverAddr` to it. No session
  affinity is configured in the deployment manifests. Locally there is one pod, so it always "works".

### The decision

- **The server decides, not the client.** A fresh connection, wherever the balancer put it, looks
  the player up in the presence index: if **another live pod still holds them** (connected or within
  the reconnect grace), the pod replies with `world_handoff` to that pod's address, and the client
  follows it with the handoff it already has. On arrival the existing in-place reconnect applies.
  If no live pod holds them, they are seated where they landed, as today.
- Rejected: **the client remembers its pod** (in `sessionStorage` or similar) and reconnects there
  directly. Nick: it is lost on another computer or browser, or when site data is cleared. Where a
  player is held is server knowledge.
- This generalises FS-R82NV R24's recall (which only pulled party members back) to every player.
  Under FS-NCC9J a party member is no longer pulled to a party pod at all; this FS only returns a
  player to the pod that still holds them.

### Edges raised

- The holding pod dies: `pod:alive` lapses (3 s), its presence keys lapse (30 s); a reconnect in that
  window must not be sent to a dead pod (check `pod:alive`, as FS-R82NV R3 does for pointers).
- A redirect that fails (pod refused or gone): the client's handoff already keeps the old socket or
  falls back to its server, putting the player in a hub.
- The presence entry must exist while the player is in grace, not only while connected: the holding
  pod keeps refreshing it until the grace ends.

### Open questions

- Redirect at the WebSocket handshake (before any `enter_hub`) or at `enter_hub`?
- Does a player in a run on another pod (FS-K2HKP's seats) follow the same path, or keep the
  existing `?session_id=` arrival?
