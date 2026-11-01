# FS-KCQ06: Whisper a player on any pod

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Chat" (whisper a player on any pod) → this FS · Related ADRs: [ADR-0032](../adr/0032-area-chat-is-scoped-to-the-pod-not-the-session.md), [ADR-0033](../adr/0033-chat-is-never-stored-a-report-carries-its-own-evidence.md) · Builds on: [FS-WJGFJ](WJGFJ-in-game-chat.md) (envelope, notices, picker, prefixes, the window), [FS-5SH4G](5SH4G-world-chat.md) (the Redis relay path every cross-pod channel rides) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) § Chat (whisper), [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) § Chat terms · Split out of the FS-5SH4G draft on 2026-10-31 when the user deferred whisper and promoted world chat alone

## Scoping notes (raw)

Residue from the 2026-10-31 chat scoping session concerning whisper, parked by the user the same
day ("私訊先暫時不做"). Everything shared with world chat (Redis channel, single delivery path,
at-most-once, ordering) is a requirement in FS-5SH4G; everything shared with area chat is in
FS-WJGFJ. Neither is repeated here.

### Decisions carried over

- **Whisper = one-to-one, cross-pod, by target.** [user] PoE2 style on the client: `@name
  message` in the input sends a whisper; clicking a sender's name pre-fills `@name`. The `@`
  prefix is already reserved and parsed as a prefix by the client (FS-WJGFJ Amendment); today it
  is sent as plain text on Area because the channel is closed (`CHAT_OPEN_CHANNELS`).
- **Offline target:** the sender gets one system notice ("that player is not online"); the
  message is not stored, queued or retried (ADR-0033). [user]
- **Only the holding pod delivers.** Every pod receives the publish; a pod that does not hold
  the target's connection ignores it. Colour: purple → `umbraLight` (FS-WJGFJ R30).

### Open questions (not settled; the user deferred the feature before answering)

- **Offline detection.** (a) A presence record per seated player in Redis (`player → pod id`),
  written on seat and deleted on leave/disconnect, checked together with the pod's liveness key
  `pod:alive:<podID>` (matchmaker) so a crashed pod's stale records read as offline: two reads,
  no waiting. Claude's recommendation. (b) Publish first and wait a bounded time (~500 ms) for a
  `delivered` ack from the holding pod; no state, one more round-trip and a timer per whisper.
- **Addressing by name.** (a) The client sends the name; the server resolves it through a Redis
  `name → player id` index written alongside the presence record (character names are unique in
  this project), so anyone online can be whispered. Claude's recommendation. (b) The client
  resolves names it has seen (window lines, name plates) and refuses the rest.
- **Echo to the sender** as "To Name: …" through the same single path (both parties see the
  exchange; the envelope would carry `target_id`, `target_name`). Claude's recommendation: yes.
- A whisper to oneself: refuse or deliver.
- A target connected but in no world (main menu): offline from the sender's view (presence is
  written on seat only), or delivered.
- Whether whisper shares the 2 s flood window with the other channels (FS-WJGFJ R6).
- Click-to-whisper needs a hit area over the name in a drawn line; names are part of the line's
  text, so the area is measured from the name's width.

### Parking lot

- Whisper history, "reply to last whisper" key.
- Blocking a player from whispering you (belongs with mute, FS-4HEG7).
