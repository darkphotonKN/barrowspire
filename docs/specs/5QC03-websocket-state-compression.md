# FS-5QC03: WebSocket game-state compression

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Transport" (compressed game-state broadcast), `game-client/SPECIFICATION.md` "### Transport" (read the compressed game-state broadcast) → this FS · Related ADRs: none yet; the chosen option gets one · **Before production (GKE): must ship before the GKE launch.** Nick, 2026-11-06: "壓縮的事情儲存到文件 正式前要做" (record the compression work; it must be done before production). The owner has approved only *that* it happens before production, not *how*. No design is chosen. Listed in [`docs/refactor_plan.md`](../refactor_plan.md) § Current Status → "Before production (GKE)".

## Scoping notes (raw)

Residue from the 2026-11-06 scoping session. Every measurement and verification below was made
on 2026-11-06. Nothing here is decided except "before production". The options are listed, not ranked.

### Why: what the server sends today

- **Rate.** game-service broadcasts a **full state snapshot to every recipient every tick at
  30 Hz.** `const GameFrameRate int = 30` in
  `game-server/game-service/common/constants/game.go:382`. The tick loop is
  `(*Session).manageGameLoop` (`internal/game/session.go:679`, ticker at :680), which calls
  `broadcastFullState` (`internal/game/session.go:1655`).
  - Root `CLAUDE.md` says "Fixed timestep (60 ticks/second)". **That is stale.** The code is 30.
    (Not corrected here; it is outside this FS.)
- **Encoding.** JSON text frames over `github.com/gorilla/websocket v1.5.3` (game-service
  `go.mod`). The per-connection writer goroutine calls `conn.WriteJSON(msg)`
  (`internal/gameserver/handler.go:439`). **No compression.** `EnableCompression` appears nowhere
  in the repo.
- **Client decode.** Native `WebSocket`, `JSON.parse(event.data)` in two handlers:
  `game-client/src/utils/class/SocketManager.ts:323-325` (the live socket) and `:593-596`
  (the handoff socket, which is promoted on a pod move). Any client-side inflater must exist
  per socket, so both handlers need one.

### Measured snapshot sizes (2026-11-06)

Measured on branch `feat/run-floor1-dungeon` (FS-KE075, with interest cut and teammate kit
removed, so main without those cuts is likely larger). Real floor-1 population over 20
maps, party in the most crowded room, 30 consecutive ticks, 600 frames.

| Encoding | Bytes per recipient per tick | vs raw |
|---|---|---|
| Raw JSON (today) | **14,800 B** mean | 100% |
| Deflate per message, no context takeover (what gorilla `EnableCompression` does) | **4,069 B** | 27.5% |
| Deflate with a shared window across messages (context takeover, simulated with Go `compress/flate`, one `Flush` per message) | **820 B** | 5.5% |

- The 820 B figure is an **ideal case**: the party was standing still, so consecutive snapshots
  were nearly identical. **A realistic context-takeover estimate is about 1–2 KB.**
- Other raw figures from the same branch: **hub at 40 players 17.7 KB**, **floor 2 14.3 KB**.

### Per-hour data and cost (estimates)

- **Uncompressed: about 1.1–1.7 GB per player-hour.** Check: 14,800 B × 30/s × 3,600 s ≈ 1.6 GB
  (≈ 1.49 GiB).
- For comparison, typical online games use **about 40–175 MB per hour**. Those figures are ISP and
  blog estimates (finder.com.au, whistleout, timeslive, mein-mmo), **not authoritative**.
- **GCP egress price.** Premium Tier internet egress to Asia (excluding Indonesia and Korea):
  **$0.12/GiB for 0–1 TiB, $0.11/GiB for 1–10 TiB, $0.085/GiB above 10 TiB.** Source:
  <https://cloud.google.com/vpc/pricing-announce> (Feb 2024 announcement). **Check the current
  rate page before relying on it.**
- **Uncompressed ≈ $0.18 per player-hour** (1.49 GiB × $0.12).
- **100 concurrent players × 4 h/day ≈ $1,800/month in egress** (estimate). 12,000 player-hours
  × 1.49 GiB ≈ 17.5 TiB/month, tiered: 1 TiB × 0.12 + 9 TiB × 0.11 + 7.5 TiB × 0.085.
  - Same load, per-message deflate (4,069 B): ≈ 4.8 TiB → about $550/month (my arithmetic, same
    tiers).
  - Same load, context takeover at 1–2 KB: ≈ 1.2–2.4 TiB → about $140–280/month (my arithmetic).
  - These count only the state broadcast payload. They leave out WebSocket, TCP and TLS framing
    overhead, other message types and ingress.

### Library limit

- **gorilla/websocket v1.5.3 does NOT support context takeover.** `doc.go` (~line 221):
  "Currently this package does not support compression with 'context takeover'". Its writer is
  `compressNoContextTakeover` (`compression.go:44`). Upstream PR **#342** proposes adding it.
  So gorilla tops out at option A's ~27%.

### Options (undecided, not ranked)

- **A. Turn on gorilla `EnableCompression`.** Per-message deflate, about 27.5% of raw (~4 KB per
  tick). The smallest change, server-side only: set it on the `Upgrader`. Browsers negotiate
  `permessage-deflate` themselves, so the client should need no code change **[to verify]**.
  Leaves about $550/month at the load above.
- **B. App-level streaming deflate.** One persistent `flate.Writer` per connection on the
  server, `Flush` per message, sent as **binary** frames. On the client, one persistent inflater
  per socket: browser `DecompressionStream('deflate-raw')` or a library such as pako.
  **Still to verify:** browser support, and whether `DecompressionStream` yields each message's
  output after a sync flush without closing the stream (cross-message streaming). Client needs
  `binaryType = 'arraybuffer'`.
  Hard constraints:
  - **Compress at the actual socket write**, in handler.go's writer goroutine
    (`internal/gameserver/handler.go:439`), never upstream of the queue. Outbound messages are
    **dropped non-blockingly on a full queue** (`internal/gameserver/server.go:1418-1424`,
    `select { case ch <- msg: … default: "message channel full" }`). A message dropped after
    compressing it would desync the shared window, and every later frame would fail to inflate.
  - **Reset both ends on reconnect**: a new connection gets a new writer and a new inflater.
    That includes the handoff socket (SocketManager.ts:593).
  - **CPU:** 30 compressions per second per player.
  - **Memory:** a Go flate writer per connection, hundreds of KB each.
  - Edge case: other code writes to the conn directly, outside the writer goroutine
    (`handler.go:281` error reply, `reconnect_redirect.go:167` redirect). Under B those either
    go through the same stream or stay uncompressed **text** frames that the client tells apart
    by frame type.
- **C. Switch to a WebSocket library that supports context takeover.** Standards-based
  `permessage-deflate` with a shared window, so roughly B's ratio with no custom client inflater
  (the browser does it). **Which Go libraries really support it is unverified.** Check before
  choosing. Cost: replacing gorilla across game-service's socket layer.
- **D. Delta snapshots.** Send only what changed since the last snapshot the client has. The
  **biggest win and the biggest change**, because it touches the state protocol and the client
  state model. It also suffers from B's drop problem (a dropped delta breaks the baseline) and
  needs periodic full keyframes or acks. It can stack with A, B or C.
- **Also possible: lower the broadcast rate** (for example 30 → 20 Hz, −33%) with client
  interpolation between snapshots. Orthogonal to A–D.

### Open questions

- **Which option** (or combination)? Undecided. The owner has not approved a design.
- **Measure CPU and memory per connection** for the chosen option at realistic player counts
  (per-player flate state for B/C, 30 compressions/s/player).
- **Is the hub included?** The hub's 40-player snapshot is the largest measured (17.7 KB).
  Whether the hub's broadcast goes through the same path and gets the same treatment is not
  settled.
- **How does the client detect a desync** (B, D) and recover? For example: inflate error →
  close and reconnect, which resets both ends.
- Re-measure on main once FS-KE075's interest cut lands. The numbers above come from that
  branch.
- Re-check the GCP egress rate against the current pricing page before using the cost figures
  in any decision.
