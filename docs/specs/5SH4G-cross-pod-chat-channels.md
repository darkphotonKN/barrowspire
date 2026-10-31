# FS-5SH4G: Cross-pod chat channels — world chat and whisper

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Chat" (world chat across pods · whisper a player on any pod) → this FS · Related ADRs: [ADR-0032](../adr/0032-area-chat-is-scoped-to-the-pod-not-the-session.md), [ADR-0033](../adr/0033-chat-is-never-stored-a-report-carries-its-own-evidence.md) · Builds on: [FS-WJGFJ](WJGFJ-in-game-chat.md) (envelope, notices, channel types, the chat window) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) § Chat (world chat, whisper, relay, scope key), [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) § Chat terms · Split out of the FS-WJGFJ draft on 2026-10-31 so each channel is specced when it is built (user's instruction)

## Scoping notes (raw)

Residue from the 2026-10-31 chat scoping session that concerns the two channels crossing pods.
Everything shared with area chat (envelope, stamping, 200 code points, 2 s flood window,
`chat_notice`, the window, colours) is already a requirement in FS-WJGFJ and is not repeated.

### Decisions carried over

- **World chat = every player on every pod.** [user] The user's "多個村莊可以跨越交談". Scope key
  is a fixed constant. Colour: light blue → `necrotic` (FS-WJGFJ R30; orange went to trade).
- **Whisper = one-to-one, cross-pod, by target player id.** [user] PoE2 style on the client:
  `@name message` in the input sends a whisper; clicking a sender's name pre-fills `@name`.
  Colour: purple → `umbraLight`, with the guideline widening noted in FS-WJGFJ R30.
- **Offline target:** the sender gets one system notice ("that player is not online"); the
  message is not stored, queued or retried (ADR-0033). [user]
- **Transport:** Redis pub/sub on the already-wired `redis.UniversalClient` (handoff's
  `Publish`/`Subscribe` in `internal/handoff/redis.go` is the in-repo precedent). Candidate
  channel names `chat:world`, `chat:whisper`; not fixed.
- **Single delivery path. [user, option A]** For every cross-pod channel the sender's pod only
  publishes; it delivers when the message comes back from Redis, exactly like every other pod.
  No local short-cut, no own-pod-id filter. Consequences: zero dedupe logic server-side,
  identical order on every pod, one Redis round-trip before the sender sees their own line.
  Rejected (B): deliver locally and drop own messages by pod id on receipt (the FS-JEAVX R12
  pattern); saves the round-trip, adds a branch, and order can differ between pods.
- **Client dedupe on `message_id`** stays the second line of defence (FS-WJGFJ R23), covering a
  reconnect window where an old and a new connection coexist on two pods, which could otherwise
  deliver a whisper twice.
- **Ordering:** Redis pub/sub delivers in publish order to each subscriber; all pods see one
  sequence; "first to Redis wins", no global clock. Enough for chat.
- **At-most-once:** messages published while a pod's subscriber is down are lost. Accepted under
  ADR-0033.
- **Only the holding pod delivers a whisper.** Every pod receives the publish; a pod that does
  not hold the target's connection ignores it.

### Open questions (to settle in write-a-spec)

- **Offline detection mechanism** for whisper. Options raised: (a) a Redis presence key per
  player (`chat:presence:<playerID>` → pod id) set on seat and deleted on disconnect, the
  sender's pod checks it before publishing; stale after a pod crash unless given a TTL refreshed
  like `pod:alive`; (b) publish first and wait a bounded time (e.g. 500 ms) for a `delivered` ack
  on Redis from the holding pod, notice on timeout; no presence state, one more round-trip and a
  timer per whisper. Not decided. (a) is the simpler read path; (b) has no state to go stale.
- Whisper by **name** on the client vs by **id** on the wire: the client must resolve `@name` to
  a player id. Only players whose name it has seen (in the window, or on a name plate) are
  resolvable client-side; a name lookup service would be new surface. Not decided.
- Whether a whisper is also delivered back to the sender's own window (as "To Name: …") through
  the same single path, so both parties see the exchange. Likely yes; the envelope would need
  the target's name as well as id.
- Rate limit shared with area (2 s across all channels, FS-WJGFJ R6) or separate for world chat
  (MMOs often throttle world harder). Not decided.
- Whether world chat is gated (character level, time since account creation) against spam.
  Not discussed.
- Redis channel names, one channel per type vs one `chat:*` channel with the type inside.
- Is a whisper to oneself refused or delivered?

### Edge cases raised

- Target on the same pod as the sender: still goes through Redis (single path), so the same
  code path; a few ms slower than it could be. Accepted for uniformity.
- Target in the main menu (connected, in no world): FS-WJGFJ R10 says such a player receives
  nothing; a whisper to them is "offline" from the sender's point of view, or is it delivered?
  Open.
- Two whispers to the same target from two pods at once: order is Redis arrival order.

### Parking lot

- Party channel (needs a party feature; scope key = party id, same Redis path).
- Trade channel (fixed scope like world; probably its own throttle).
- Whisper history, "reply to last whisper" key.
- **A separate chat service / chat socket** (raised by the user 2026-10-31 during I-WJGFJ-1, kept
  on the shared game socket for now). Not a bandwidth concern: chat is ≤1 msg / 2 s / player
  against a 60 Hz state broadcast. The real triggers would be history, moderation pipeline, or
  chat surviving a pod handoff. Separating would supersede ADR-0015 (one connection per pod)
  and break "area = pod" (ADR-0032) unless the chat socket is pinned to the game pod or area
  moves to Redis. What would move: the relay (kept in `gameserver/chat.go` behind two small
  interfaces, audience and sender) and the audience source (a `player → pod` presence record
  instead of the pod's own connection table). What would not: the envelope, notices, channel
  types, text rules, the client store and window.
