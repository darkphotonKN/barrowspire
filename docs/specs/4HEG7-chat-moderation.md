# FS-4HEG7: Chat moderation — mute and report

> Status: draft · SPECIFICATION.md: `game-server/api-gateway/SPECIFICATION.md` "### Chat" (report a chat message), `game-client/SPECIFICATION.md` "### Chat" (mute a player · report a chat message) → this FS · Related ADRs: [ADR-0033](../adr/0033-chat-is-never-stored-a-report-carries-its-own-evidence.md) (chat is never stored; a report carries its own evidence) · Builds on: [FS-WJGFJ](WJGFJ-in-game-chat.md) (the chat window and its buffer, the evidence source) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) § Chat (mute, report), [`api-gateway/CONTEXT.md`](../../game-server/api-gateway/CONTEXT.md) (chat report), [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) § Chat terms · Split out of the FS-WJGFJ draft on 2026-10-31 so each capability is specced when it is built (user's instruction)

## Scoping notes (raw)

Residue from the 2026-10-31 chat scoping session that concerns mute and report. The window,
buffer and `message_id` they rely on are FS-WJGFJ requirements.

### Decisions carried over

- **Mute is client-side only. [charter default, not objected to]** Muting a player adds them to
  a local ignore list (browser storage); their lines on every channel are still received and not
  rendered. Lost on device or browser change. Rejected for now: an account-level ignore list via
  a REST endpoint and a table (parked). game-service has no notion of a muted player and keeps
  relaying to them.
- **Report carries its own evidence. [user]** The client sends the reported message, the few
  neighbouring lines its window still holds, reporter id, reported player id, channel and
  `sent_at`. The server stores no chat and looks nothing up (ADR-0033).
- **Report lands as one structured `slog` line. [user: option 1 of 3]** No table, no moderation
  UI, no external sink. Rejected for now: (2) a `report` domain with a table and an admin UI;
  (3) Discord webhook / email. Both parked. "Filing" a report means the line was written.
- **Report is an HTTP endpoint through api-gateway, not a WS action.** Per the repo's contract
  rule it ships as a typed, serialized handler and regenerates `openapi.yaml` and the generated
  client with `make openapi && make client`; the FS must carry an `## API surface` table.
  Nothing exists today, so no serialize-on-touch slice ⓪.
- **Evidence is client-asserted.** A modified client can fabricate it. Acceptable while a human
  reads a log line; the day reports drive automatic action, a server-side signature or buffer is
  needed and ADR-0033 is superseded.

### Open questions (to settle in write-a-spec)

- **Which service owns the endpoint.** The gateway logging it itself is the smallest change but
  puts behaviour in the gateway, which the repo treats as edge-only; forwarding to game-service
  over gRPC gives it a home but game-service has no chat state to add. A tiny `moderation`
  domain in an existing DDD service is the third option. Not decided.
- **How many neighbouring lines** the client attaches (3 before and after? all 100?). Not
  decided; bounded by the window.
- **Mute scope:** does muting hide whispers from that player (assumed yes) and world lines
  (assumed yes)? Does it hide their name plate or only chat? Assumed chat only.
- **Mute UI:** click a name in the window → context menu with Mute / Report? Or `/ignore name`?
  PoE2 uses a right-click menu on the name. Not decided.
- **Report UI:** same menu; a reason picker (spam, harassment, other) or free text? Not decided.
- **Report rate limit** (a report endpoint can itself be spammed). Not discussed.
- **Auth:** the reporter is the bearer of the JWT; the reported id comes from the message's
  `sender_id`, which the client has because the server stamped it.
- Whether a report acknowledges to the player ("Report sent") in the window as a system line.

### Edge cases raised

- Reported message already scrolled out of the 100-line window: the client cannot report what it
  no longer holds. Accepted (ADR-0033 consequences).
- Reporting one's own message: refuse client-side.
- Muted player's `chat_notice`s: notices have no sender, so they are never hidden.
- Storage unavailable: mute works for the session and is forgotten on reload.

### Parking lot

- Account-level ignore list.
- Report table + moderation UI; external sink.
- Automatic actions on repeat reports.
