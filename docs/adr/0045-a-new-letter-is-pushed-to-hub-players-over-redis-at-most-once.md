# ADR-0045 — A new letter is pushed to players in the HUB world over Redis `mail:arrived`, at most once; the client never polls

Status: accepted
Date: 2026-11-04
Scope: `game-server/notification-service`, `game-server/game-service`, `game-client`
Amends: [ADR-0044](0044-the-mailbox-lives-in-notification-and-a-claim-is-idempotent-by-caller-keys.md)
— §Decision 1's list of the only wire names that use "mail" for the in-game mailbox, and its
consequence that notification-service's new dependencies are items and wallet. The rest of
ADR-0044 (the mailbox's home, the claim protocol) stands.
Realized by: [FS-1GZGD](../specs/1GZGD-in-game-mailbox.md) amendment 2026-11-04 (A4, which
replaces D13; R34, R41–R44)
Builds on: [ADR-0004](0004-game-traffic-bypasses-the-application-gateway.md) (game traffic rides
the game WebSocket), [ADR-0015](0015-hub-and-runs-share-one-process-and-one-connection.md) (one
connection per pod across worlds), [FS-5SH4G](../specs/5SH4G-world-chat.md) (world
chat: the Redis subscriber → message hub shape game-service already runs)

## Context

FS-1GZGD's envelope must light when a letter waits. As promoted, the client polled
`GET /api/mail/summary` every 60 s in the town (D13), because push "through game-service" was out
of scope. On 2026-11-04 the user replaced that with push.

The forces:

- **The players to tell are on the game WebSocket, not on HTTP.** The town is the HUB world,
  served by whichever game-service pod holds the player. Only that pod can reach them. The
  gateway has no connection to the client to push on.
- **notification-service does not know where a player is.** It stores letters; it has no
  presence index and should not get one. game-service already has one (each pod knows who stands
  in its HUB world).
- **game-service already relays cross-pod messages over Redis pub/sub.** World chat
  (`chat:world`, FS-5SH4G) is one channel every pod subscribes to, a subscriber goroutine feeding
  the message hub loop, at most once. A letter arrival is the same shape: one message, every pod
  checks its own players.
- **The mailbox's state is safe without the push.** The summary is the truth; the push only says
  "look now". A lost push costs a late envelope, never a letter or an enclosure.
- **Polling costs a request per player per minute** for something that changes rarely, and still
  lags up to a minute.

Recorded without adversarial review: the user decided this in the `/charter` run's amendment and
it went through no `/challenge-me`.

## Decision

1. **notification-service publishes, after commit, on the Redis pub/sub channel
   `mail:arrived`:** `{"member_id": "<uuid>"}` for a letter to one member, `{"broadcast": true}`
   for a broadcast. One message per stored letter, from both entry points (admin send and letter
   request). The publish runs outside the transaction, under a short deadline; a failure is
   logged and **never fails or undoes the send**. A redelivered letter request that stores
   nothing publishes nothing. notification-service gains a Redis client (`REDIS_ADDR`) for this
   alone.
2. **Every game-service pod subscribes to `mail:arrived` for its whole life**, resubscribing after
   a drop, in world chat's subscriber → message hub shape. For a member id it sends the WebSocket
   message `mail_arrived` (the existing envelope, `{"action": "mail_arrived", "payload": {}}`) to
   that member if they stand in the HUB world on this pod; for a broadcast, to every player in the
   HUB world on this pod. A player in a run or a field gets nothing. The message carries no letter
   content.
3. **At most once, no store, no retry.** Nothing in Redis, game-service or the client keeps an
   undelivered arrival. The client recovers by fetching the summary on **town entry** and on
   **opening the panel**, besides on `mail_arrived`; it never fetches on a timer.
4. **game-service learns nothing else of the mailbox.** It neither reads nor stores letters and
   calls no mailbox API; this subscriber and its forwarding are its whole share.
5. **Wire names.** `mail:arrived` (Redis channel) and `mail_arrived` (WebSocket action) join
   `/api/mail/*`, `/api/admin/mail` and `mail.letter.requested` as the only places "mail" names
   the in-game mailbox (amending ADR-0044 §Decision 1's list). In Go identifiers the concept stays
   Mailbox / Letter; "mail" still means email in notification-service (ADR-0043).

## Consequences

- **The envelope lights within moments of a send** for players in the town, and no player costs
  a request a minute.
- **A push can be lost** (Redis down, a dropped subscription, a full queue, the player in a run or
  on their way between pods). The envelope then lights at the next town entry or panel open. This
  is accepted: the push is a hint, the summary is the truth.
- **notification-service now depends on Redis** for this hint (amending ADR-0044's consequence
  that its new dependencies are items and wallet). Redis being down never blocks a send; it
  only silences the hint. Its deploy config gains `REDIS_ADDR`, pointing at the Redis
  game-service already uses.
- **A second producer writes into game-service's Redis.** The channel is the contract: its
  name and its two payload forms. A pod skips any other payload. Changing either form is a
  change on both services.
- **A broadcast fans out once per pod**, and each HUB-world player fetches the summary once.
  With the deployment's player ceiling (ADR-0015) that is bounded; a much larger population would
  want the fetch spread out.
- **game-service gains a narrowly bounded mailbox concern.** A later wish to push other mailbox
  events (a letter expiring, a claim finishing elsewhere) is a new decision, not an extension of
  this one.
- **Collision to watch:** in game-service a "letter" already means a pod-inbox letter (party
  courier, whisper). The mailbox's letters are written "mailbox letter" there
  (`game-service/CONTEXT.md`).
