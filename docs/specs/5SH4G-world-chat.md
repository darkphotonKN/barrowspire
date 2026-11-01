# FS-5SH4G: World chat across pods

> Status: shipped · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Chat" (world chat across pods), `game-client/SPECIFICATION.md` "### Chat" (send to the world channel from the chat window) → this FS · Related ADRs: [ADR-0032](../adr/0032-area-chat-is-scoped-to-the-pod-not-the-session.md) (area is the pod; world is every pod), [ADR-0033](../adr/0033-chat-is-never-stored-a-report-carries-its-own-evidence.md) (nothing stored; Redis pub/sub is at-most-once and that is accepted), [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (one connection per pod), [ADR-0030](../adr/0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md) (pods are channels of one game) · Builds on: [FS-WJGFJ](WJGFJ-in-game-chat.md) (envelope, stamping, notices, text rules, flood window, the window, the picker and prefixes) · Followed by: [FS-KCQ06](KCQ06-whisper.md) (whisper; draft, split from this FS when the user deferred it) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) § Chat (world chat, relay, scope key), [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) § Chat terms · Scoped 2026-10-31, promoted 2026-10-31 for world chat alone. Decisions marked **[user]** were the user's; **[charter default]** were proposed by Claude and approved without objection.

## Summary

The world channel is heard by every player on every game-service pod: the user's "多個村莊可以
跨越交談". A world line is stamped by the sender's pod exactly as an area line is, published
once to Redis, and delivered by every pod, the sender's included, to the players it holds. The
client opens the `World` channel in the picker, with its `#` prefix and light-blue colour that
FS-WJGFJ already drew. Nothing is stored, nothing is replayed, and the relay stays a relay.

**Lane.** game-service is the human lane (root `CLAUDE.md`); the user authorised the agent for the
area relay slices and may again. The client is the agent lane.

## Requirements

### A. The channel

1. The `world` chat channel is **open**: a `chat { channel: "world", text }` from a seated player is
   relayed, no longer refused with `channel_closed` (FS-WJGFJ R8). **[user]**
2. Its scope key is the fixed constant `world`: the stamped line carries `scope: "world"`
   (FS-WJGFJ R3). **[charter default]**
3. Everything FS-WJGFJ requires of a line applies unchanged: the sender from the connection (R2),
   the stamp (R3), `not_in_world` for a player in no world (R10), the text rules (R5), the flood
   window (R6), nothing stored or logged in full (R14). **[user]**
4. The flood window is **shared across channels**: one accepted line per player per 2 s, world
   and area together (FS-WJGFJ R6 as built). Tightening world alone is deferred. **[charter
   default, the user left it open]**

### B. One path through Redis

5. The sender's pod stamps the line and **publishes it to one Redis channel** (`chat:world`) as
   JSON, the stamped line as the client will receive it. **[user]**
6. **The sender's pod does not deliver locally.** Every pod, the sender's included, subscribes to
   `chat:world` and delivers a line only when it arrives from Redis. One path, so no pod needs to
   recognise its own lines and every pod sees one order (the user's option A, 2026-10-31).
   **[user]**
7. On arrival, a pod delivers the line, as action `chat`, to **every player seated in any world on
   that pod** (its `SeatedPlayerIDs`, FS-WJGFJ R9), through the existing writer queues with their
   existing non-blocking send (R12). A pod with nobody seated delivers nothing and errs nothing.
8. **Publishing never runs on the hub loop.** The relay hands stamped world lines to one
   publisher goroutine through a buffered channel, in order; that goroutine publishes each with
   a bounded timeout (as `handoffAnnounceTimeout`). One publisher per pod, so lines from one pod
   reach Redis in the order they were accepted. A publish that fails is logged (without the
   text) and dropped: the sender's line is lost, with no notice (at-most-once, ADR-0033).
   **[charter default]**
9. **Subscribing runs in its own goroutine** (as `handoff.Listen`), started with the pod and
   stopped with its context. It decodes each message and hands it to the hub loop on a channel
   the loop selects on, so delivery happens on the loop like area delivery does and the loop
   never blocks on Redis. A message that fails to decode is logged (without the text) and
   skipped. **[charter default]**
10. **Ordering.** Lines are delivered in Redis's publish order; every pod sees the same sequence.
    Two pods publishing at once are ordered by arrival at Redis; there is no global clock. The
    client's `message_id` dedupe (FS-WJGFJ R23) stays as the second line of defence.
11. **At-most-once.** A line published while a pod's subscriber is down, or while Redis is
    unreachable, is lost for that pod. Accepted under ADR-0033; no replay. The subscriber relies on
    go-redis to reconnect its pub/sub; the game logs a Warn when the subscription channel closes
    and resubscribes.
12. The area relay is untouched: an area line never touches Redis (FS-WJGFJ R9–R11).
13. The Redis client is the one game-service already holds (`redis.UniversalClient` from
    `config.InitRedis`), constructor-injected as the handoff announcer's is; no new client, no
    wrapper layer. **[charter default; ADR-0022 style]**

### C. The client

14. `World` is selectable in the channel picker (FS-WJGFJ Amendment: `CHAT_OPEN_CHANNELS` gains
    `world`); its `#` prefix picks it and is written when it is picked, as the input already does
    for open channels. A sent line carries `channel: "world"` and the text without the prefix.
    **[user]**
15. World lines draw in the world colour (`palette.chatWorld`, light blue), the `World` tab shows
    and hides them, and they keep their own 100-line buffer, all as FS-WJGFJ built. Nothing
    visual is added.
16. The client does not care which pod a world line came from; `scope: "world"` is carried and
    unused.

## User Stories

1. As a player in one pod's town, I want to say something every player on every pod can read, so
   that the villages are not islands.
2. As a player inside the Spire, I want to hear the world while I delve, so that I can arrange
   the next run before this one ends.
3. As a player, I want to pick World in the picker, or type `#` first, so that I choose the
   audience without leaving the keyboard.
4. As a player, I want world lines in a colour of their own and a tab that hides them, so that
   the world's noise never buries my town's talk.
5. As a player on the same pod as the speaker, I want their world line to appear once, not twice,
   so that nothing looks like an echo.
6. As a player, I want everyone to see world lines in the same order, so that a reply reads as a
   reply everywhere.
7. As a player, I want my own world line back in my window, so that I know it went out.
8. As a player who was handed off to another pod, I want world chat to keep working without
   doing anything, so that the pods stay invisible.
9. As a player, I want a line I send while Redis is down to simply vanish rather than arrive
   minutes later out of order, so that chat never shows stale lines.
10. As the server, I want a single publisher per pod, so that one pod's lines reach Redis in the
    order it accepted them and the hub loop never waits on the network.
11. As the server, I want delivery to run on the hub loop like area delivery, so that the writer
    queues are touched from one goroutine.
12. As the server, I want to reuse the Redis client and the publish/subscribe shape handoff
    already has, so that chat adds no new infrastructure.
13. As a reviewer, I want the area relay untouched and the world path tested with a fake Redis
    between two servers, so that the cross-pod claim is proven, not assumed.
14. As a later feature (whisper, party, trade), I want the same publisher and subscriber with a
    different scope key, so that the next channel is a routing rule, not a new path.

## Acceptance Criteria

### Server

- [ ] Two servers built on one fake Redis (two pods): a world line from a player seated on pod A
      reaches every seated player on pod A and on pod B, the sender included, each exactly once,
      stamped with `channel:"world"`, `scope:"world"` and the sender's id and name.
- [ ] A player seated on pod B who hears the line sees the same `message_id` pod A's players see.
- [ ] A world line from a player in no world is refused with `not_in_world` and published nowhere.
- [ ] An area line is never published (the fake Redis sees no publish).
- [ ] Ten world lines accepted in order on pod A arrive on pod B in that order.
- [ ] A pod whose subscriber has not yet received a line delivers nothing locally for it: the
      sender's own window gets the line only via Redis (the fake Redis can hold a publish; while
      held, nobody has it; released, everybody has it).
- [ ] A publish that fails (the fake Redis errors) drops the line, logs a Warn without the text,
      and the next line still goes through.
- [ ] A message on `chat:world` that does not decode is skipped with a Warn (no text) and the
      subscriber keeps running.
- [ ] The subscriber's goroutine stops with the server's context.
- [ ] The 2 s flood window counts a world line and an area line from one player together.
- [ ] No Redis key is written; only `PUBLISH`/`SUBSCRIBE` on `chat:world`.
- [ ] Logs on the world path carry no message text.
- [ ] Tests pass; `golangci-lint` clean.

### Client

- [ ] `World` can be picked; picking it writes `#`; typing `#` first picks World; deleting it
      returns to Area.
- [ ] Enter sends `{ channel: "world", text }` with the prefix stripped.
- [ ] A received world line draws in `palette.chatWorld` and hides with the World tab.
- [ ] Tests pass; typecheck and lint clean.

## Edge States

- **Redis unreachable when publishing** — the line is dropped with a Warn; the sender sees
  nothing arrive. No retry, no notice (ADR-0033). The next line is attempted afresh.
- **Subscriber down for a pod** — that pod's players miss the lines published meanwhile; other
  pods are unaffected. When the subscription channel closes, the pod logs and resubscribes.
- **Sender's own pod** — hears the line only when Redis returns it; on a slow Redis the sender's
  line appears a few ms after Enter. Accepted (user's option A).
- **Nobody seated on a pod** — the pod receives the line and delivers to no one.
- **Player handed off mid-conversation** — seated on the new pod, they hear the world through it;
  nothing is replayed from before the move.
- **A player seated in a run** — hears the world; a party mid-escape sees world lines (the
  filter hides them; ADR-0032's trade-off applies to area, not here).
- **Flood** — a world line inside the player's 2 s window is refused with `too_fast` before it is
  published.
- **Duplicate delivery** — not expected on a single path; a client that somehow receives one
  `message_id` twice draws it once (FS-WJGFJ R23).
- **Decoding** — a malformed message on the channel (another version of the service, a stray
  publisher) is skipped; the client's `isChatLine` guard (FS-WJGFJ, review) is the last gate.
- **Pod start** — the subscriber starts with the pod; lines published before it subscribed are
  not seen (at-most-once).
- **Local dev with one pod** — the single pod publishes and receives its own lines through a
  local Redis; behaviour is identical to the multi-pod case.

## Out of Scope

- **Whisper** → [FS-KCQ06](KCQ06-whisper.md) (draft): presence, name lookup, echo to sender.
- **Party and trade channels** — the same path with a party id or the trade constant as scope
  key; each waits for its own scoping.
- **A separate flood window for world chat**, level or account-age gates against spam.
- **History, catch-up, replay** — excluded by ADR-0033.
- **A separate chat service or socket** — parked (FS-5SH4G draft parking lot, now below).
- **Cross-pod presence** of any kind; nothing in this FS writes a Redis key.

## Parking lot (carried from the draft)

- **A separate chat service / chat socket** (raised by the user 2026-10-31). Not a bandwidth
  concern (chat is ≤1 msg / 2 s / player against a 60 Hz state broadcast). Triggers would be
  history, a moderation pipeline, or chat surviving a pod handoff. Separating would supersede
  ADR-0015 and break "area = pod" (ADR-0032) unless the chat socket is pinned to the game pod.
  What would move: the relay (behind its two interfaces) and the audience source. What would
  not: the envelope, notices, channel types, text rules, the client store and window.
