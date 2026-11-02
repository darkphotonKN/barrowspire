# FS-XGW7H: Party chat

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Chat" → "Party chat across pods"; `game-client/SPECIFICATION.md` "### Chat" → "Send to the party channel from the chat window" → this FS · Related ADRs: [ADR-0036](../adr/0036-party-state-lives-in-redis-membership-spans-pods.md) (party state in Redis, membership spans pods, each pod caches its players' parties; supersedes [ADR-0034](../adr/0034-a-party-lives-on-one-pod-joining-is-a-hub-handoff.md), whose "party chat is delivered in-process" no longer holds), [ADR-0033](../adr/0033-chat-is-never-stored-a-report-carries-its-own-evidence.md) (nothing stored, at-most-once), [ADR-0032](../adr/0032-area-chat-is-scoped-to-the-pod-not-the-session.md) (area is the pod; party is not) · Depends on: [FS-NCC9J](NCC9J-party-membership-across-pods.md) (party cache, presence index, pod inbox, party courier and its `party_update` fan-out), [FS-R82NV](R82NV-party-formation.md) (the party) · Builds on: [FS-WJGFJ](WJGFJ-in-game-chat.md) (the envelope, `chat_notice`, the chat window, the reserved `party` chat channel, `%` prefix, arcane colour), [FS-5SH4G](5SH4G-world-chat.md) (relay rules shared by every chat channel: 200 code points, the shared 2 s flood window) · Siblings: [FS-BJNYC](BJNYC-party-instance-entry.md), [FS-V780R](V780R-party-loot-rule.md), [FS-CH21F](CH21F-party-member-overhead-bars.md) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) § Chat (*party chat*, *system line*), § Party (*pod inbox*: the *party chat letter*); [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) § Chat terms (*Party*) · Scoped 2026-11-01, promoted 2026-11-02 under Nick's charter. Decisions marked **[Nick]** are his words; **[charter default]** were proposed by Claude and approved in the charter without objection.

**Supersedes the draft's premise.** The draft (2026-11-01) assumed every member stands on one
party pod, so party chat would be a pod-local broadcast like area chat, closed and greyed for a
player with no party, and would also carry system lines for party events and loot. ADR-0036 and
FS-NCC9J retired the party pod: members are on any pod. This FS crosses pods by the existing pod
inbox, keeps the channel always open, and leaves system lines out (Out of Scope). The draft's two
open questions (party events as toasts; a system line's scope) were about system lines and are
moot.

## Summary

A party can talk among itself. A player picks Party in the chat window (or types `%`) and the line
reaches every member of their party wherever each stands: in town, in a field, inside the Spire,
on this server or another. The line shows in each member's chat window in the party colour, the
sender's included. A player in no party who tries is told "You are not in a party."

The server is still a relay: the sender's pod stamps the line, delivers it to the members it holds,
and sends one letter to each other pod that holds a member, which hands it to them. Nothing is
kept.

**Lane.** game-service is the human lane (root `CLAUDE.md`); the server slice is HITL, authorised
by Nick's charter on 2026-11-02. The client is the agent lane.

## Requirements

### A. Accepting a party line (game-service)

1. **The `party` chat channel opens.** An inbound `chat` with `channel: "party"` is no longer
   refused `channel_closed`. The envelope (FS-WJGFJ R2–R4) is unchanged. **[charter default]**
   Reason: the channel type was reserved for exactly this.
2. **Relay rules are every channel's** (FS-WJGFJ R5–R6, FS-5SH4G): the text is normalised; empty
   after normalising is dropped with no notice; more than **200 code points** is refused
   `too_long`; the shared per-player **2 s flood window** across all chat channels applies,
   refused `too_fast`. Nothing here is party-specific. **[charter default]** Reason: one set of
   rules for every channel.
3. **A sender in no party is refused.** If the sender's pod's party cache holds no party for the
   sender, the line is refused with the new `chat_notice` code **`no_party`**, copy **"You are not
   in a party."** The channel is never "closed" for such a player; the refusal is the only signal.
   **[Nick: "不用特別變灰"; copy charter default]**
4. **Order of refusals** for a party line: `not_in_world` (sender in no world, FS-WJGFJ R10),
   then `no_party`, then the empty-text drop, `too_long`, `too_fast`. A line refused `no_party`
   does not start the sender's flood window. **[charter default]** Reason: `no_party` sits where
   `channel_closed` sits for a closed channel; a line that can go nowhere should not cost the
   player their next two seconds.
5. **Who counts as a member is the sender's pod's party cache.** Whether the line may be sent,
   and who receives it, are both read from the party the sender's pod caches for the sender at the
   moment of acceptance, on the hub loop, with no Redis call. A member who joined moments ago may
   miss a line before the cache catches up; a member removed moments ago may still receive one.
   Accepted: at-most-once (ADR-0033). **[charter default]** Reason: the cache is the read model
   FS-NCC9J built for exactly this; reading Redis per line would put Redis on the chat path.
6. **Stamping.** The accepted line is stamped once, on the sender's pod, as every chat line is
   (FS-WJGFJ R3), with `channel: "party"` and **`scope` = the party id** (the uuid string). Every
   recipient on every pod receives the same stamp, the same `message_id` included.
   **[charter default]**

### B. Delivering a party line (game-service)

7. **Recipients** are every member of the sender's party as the sender's pod's cache holds it, in
   any world (hub, field, run), **the sender included**. The sender hears their own line through
   this delivery, as with area and world chat; there is no client-side echo. **[charter default]**
8. **Members this pod seats are told directly**, at once on acceptance, through the existing
   per-connection writer queue (FS-WJGFJ R12): a full queue or a connection gone between
   acceptance and delivery means that member misses the line, and nobody waits. Same-pod delivery
   never waits on Redis. **[charter default]** Reason: the sender's echo and same-pod members
   should not pay for a Redis round-trip, and a failed lookup (R11) then degrades to exactly this
   set.
9. **Members on other pods are found by one presence read.** For the members this pod does not
   seat, the pod makes **one** presence read (`presence.LookupIDs`, FS-NCC9J's presence index),
   **off the hub loop**, through the party runner the same way `party_update`'s `announce` does,
   and handles the answer back on the loop. When every member is seated here, no read is made.
   **[Nick: option b; runner charter default]** Reason: reuses the tested `party_update` path; the
   runner keeps the hub loop from ever waiting on Redis.
10. **One letter per other pod.** Each other pod that the read says holds one or more of the
    members receives **one pod-inbox letter** of the new kind **`party_chat`**, addressed to the
    members it holds, carrying the stamped line, sent through the existing party courier and pod
    inbox (`party_courier.go`, `inbox.go`) beside `party_update`'s letter. A member the read finds
    on *this* pod (they arrived after acceptance) is not sent a letter and misses the line. A
    member the read does not find is offline and hears nothing. **No new Redis channel and no new
    data structure.** **[Nick: option b]** Reason: lines go only where members are.
11. **A presence read that fails** (Redis down, timeout, or the runner has no room) delivers the
    line to this pod's members only (R8 already did), logs one **Warn** with the party id and no
    text, and is **never retried**. A letter that cannot be published is logged at Warn and
    dropped, never retried. **[charter default]** Reason: at-most-once (ADR-0033); a retry could
    deliver a line after later ones.
12. **A pod with no inbox or no presence index** (a single-pod or test boot) delivers to its own
    members only, without a Warn. **[charter default]** Reason: that pod reaches no other pod by
    configuration, not by failure.
13. **The receiving pod hands the line to the named players.** On a `party_chat` letter it sends the
    line, as an outbound `chat`, to each addressed player it seats in a world. It does **not**
    consult its own party cache: the sender's pod decided the audience. An addressed player it does
    not seat (left, mid-handoff) is skipped with at most a Debug line. A letter missing its
    addressees or its line is skipped with a Warn and no text. **[Nick: option b]**
14. **In a run** the channel works as anywhere else: members inside an instance send and receive
    party lines, dead or escaped members included, as long as they are seated in a world.
    **[charter default]** Reason: the run already locks the party (FS-BJNYC); chat needs no rule
    of its own there.
15. **Away, offline, mid-handoff and travelling members** miss lines sent while they are not
    seated anywhere the delivery reaches. No replay, nothing stored (ADR-0033). **[charter
    default]**
16. **Nothing is kept, and text is never logged** (FS-WJGFJ R14, ADR-0033). Every log line about a
    party line or letter carries at most the party id, sender id, message id, pod id and length.
17. **Order.** On one pod, recipients there receive lines in the order that pod delivers them.
    Across pods there is no order guarantee between lines from different senders; one sender's
    lines are at least 2 s apart (R2). **[charter default]**

### C. The client (game-client)

18. **Party is an open channel.** `party` joins `CHAT_OPEN_CHANNELS` (`src/ui/chatInput.ts`):
    the picker's Party option is enabled; picking it writes the reserved **`%`** prefix; typing `%`
    at the start of the input picks Party; removing it returns to Area; a sent line carries
    `channel: "party"` and the text without the prefix (FS-WJGFJ Amendment 2026-10-31).
    **[charter default]**
19. **Never greyed.** Party is pickable whether or not the player is in a party; the client does
    not consult the party store to enable it. A send from a player in no party is answered by the
    server's `no_party` notice (R3), shown as a system line. **[Nick: "不用特別變灰"]**
20. **Shown like world.** A received party line renders in the chat window like any other line, in
    the party colour (`palette.chatParty`, arcane), hides with the Party filter tab, and keeps its
    own 100-line buffer, as FS-WJGFJ built. `scope` (the party id) is carried and unused. The
    client renders every party line it receives; it does not filter by the party store.
    **[charter default]**
21. **`no_party` copy.** The client shows a `chat_notice`'s server-sent `text` verbatim and keys
    behaviour on `code` (FS-WJGFJ R7); it keeps no table of chat notice copy, so `no_party` needs no
    client copy. If a client-side copy table for chat notices exists when this is built, it gains
    `no_party` → "You are not in a party." **[charter default]**

### D. Wire contract (both sides build against this)

| Direction | Action / letter | Shape |
|-----------|-----------------|-------|
| client → pod | `chat` | `{ "channel": "party", "text": "<text>" }` (unchanged envelope) |
| pod → client | `chat` | `{ "message_id", "sender_id", "sender_name", "channel": "party", "scope": "<party id>", "sent_at", "text" }` (FS-WJGFJ R3) |
| pod → client | `chat_notice` | `{ "code": "no_party", "text": "You are not in a party." }` |
| pod → pod inbox | letter `party_chat` | `{ "kind": "party_chat", "payload": { "to": ["<player id>", …], "message": <the pod → client `chat` payload above> } }`; no `to_player_id` |

The letter is internal to game-service; the client never sees it.

## User Stories

1. As a party member, I want to type a line to my party and have every member see it, so that we
   can plan without the whole server reading.
2. As a party member in town, I want my line to reach a member who is on another server, so that
   which server we landed on never splits the party's conversation.
3. As a party member in a field, I want to hear my party in town or inside the Spire, so that I can
   keep up while I am off on my own.
4. As a party member inside the Spire, I want party chat to keep working during the run, so that
   we can call out danger to each other.
5. As a party member who died in the run, I want to keep talking to my party, so that I can still
   help from the sidelines.
6. As a party member who escaped, I want to keep hearing my party still inside, so that I know how
   they are doing.
7. As a sender, I want my own party line to appear in my window, so that I know it went through.
8. As a player, I want to pick Party in the picker or start a line with `%`, so that switching to
   my party is as quick as switching to world.
9. As a player in no party, I want to be told plainly why my party line went nowhere, so that I
   am not left wondering whether anyone heard me.
10. As a player, I want Party to be pickable even before I join a party, so that the picker does
    not change shape under me.
11. As a player, I want party lines in their own colour and behind their own filter tab, so that I
    can tell them from area and world chat and hide them if I want.
12. As a player, I want a too-long or too-fast party line refused the same way as on any other
    channel, so that the rules do not change by channel.
13. As a player who just joined a party, I accept that a line sent in the first moment may not
    reach me, so that chat stays cheap and never waits on the party's store.
14. As a member who was offline, travelling or mid-handoff, I accept that I miss lines sent
    meanwhile, so that the server never stores chat.
15. As a party of one, I want my line echoed back to me, so that the channel behaves the same as
    with company.
16. As the server, I want to stamp a party line once on the sender's pod, so that every member sees
    the same id, name and time.
17. As the server, I want to send one letter per other pod and only to pods that hold a member, so
    that party chat costs nothing on pods with no member.
18. As the server, I want the presence read off the hub loop, so that a slow Redis never stalls the
    world.
19. As the server, I want a failed presence read to still deliver to this pod's members, so that a
    Redis outage silences only the cross-pod part.
20. As the server, I want the receiving pod to trust the sender's pod's addressees, so that a line
    is never lost because two pods' caches disagree for a moment.
21. As an operator, I want no chat text in any log line, so that party chat adds no data to protect
    (ADR-0033).
22. As a later feature (system lines in the party channel, loot notices), I want the party line's
    shape and letter fixed now, so that adding sender-less lines changes the payload, not the path.

## Acceptance Criteria

### Server

- [ ] A `chat` with `channel: "party"` from a seated player in a party is relayed; it is no longer
      refused `channel_closed`.
- [ ] A seated player in no party (as their pod's cache sees it) sending a party line gets exactly
      one `chat_notice` `{ code: "no_party", text: "You are not in a party." }`; nothing is
      delivered and no presence read is made.
- [ ] A `no_party` refusal does not start the flood window: the same player's area line right after
      is relayed.
- [ ] A player in no world sending a party line gets `not_in_world`, not `no_party`.
- [ ] A party line over 200 code points is refused `too_long`; a second accepted line inside 2 s
      of any accepted line on any channel is refused `too_fast`; empty text is dropped silently.
- [ ] The relayed line is `chat` with `channel: "party"`, `scope` = the party id, and the FS-WJGFJ
      stamp; every recipient, on every pod, gets the same `message_id`.
- [ ] With all members seated on the sender's pod, every member (sender included) receives the
      line, in a hub, a field and a run alike; no presence read is made and no letter is sent.
- [ ] With one member on pod B and one on pod C, the sender's pod makes one presence read and sends
      exactly one `party_chat` letter to B and one to C, each addressed to that pod's members only.
- [ ] With two members on pod B, B receives one letter addressed to both.
- [ ] The sender's pod's own members receive the line before the presence read returns.
- [ ] A presence read that fails delivers to the sender's pod's members only, logs one Warn
      without text, and is not retried.
- [ ] A pod with no inbox or no presence index delivers to its own members only, with no Warn.
- [ ] A pod receiving a `party_chat` letter sends the `chat` to each addressed player it seats,
      without consulting its party cache; an addressed player it does not seat is skipped; a letter
      without `to` or `message` is skipped with a Warn.
- [ ] A dead member and an escaped member in a run both send and receive party lines.
- [ ] No log line at any level contains party chat text.
- [ ] `make lint && make test` green in game-service.

### Client

- [ ] Party is enabled in the picker; `pick("party")` writes `%`; typing `%hi` picks Party;
      deleting the `%` returns to Area.
- [ ] Enter on `%on my way` sends `{ channel: "party", text: "on my way" }`.
- [ ] Party stays pickable with no party in the party store.
- [ ] A received party line renders in `palette.chatParty`, is hidden when the Party tab is off,
      and keeps its own 100-line buffer.
- [ ] A `chat_notice` `{ code: "no_party", text: "You are not in a party." }` shows as a system
      line with that text.
- [ ] Whisper and trade stay disabled in the picker; their prefixes stay plain text.
- [ ] Tests pass; typecheck and lint clean.

## Edge States

- **No party.** Refused `no_party` (R3). The picker is unchanged (R19).
- **Party of one.** The line is accepted and echoed to the sender alone; no read, no letter.
- **Just joined.** The sender's pod's cache may not list the newcomer yet: they miss the line
  (R5). If the *sender* just joined and their pod's cache has not caught up, they may be refused
  `no_party` once.
- **Just left or kicked.** The sender's pod's cache may still list a removed member for a moment:
  they may receive one more line. A player who just left and sends at once may still be relayed to
  the old party until their pod's cache catches up.
- **Caches disagree across pods.** The receiving pod delivers to whoever the letter names (R13);
  its own cache never vetoes, never adds.
- **Presence read fails or runner full.** Same-pod members only, one Warn, no retry (R11).
- **Letter cannot be published.** That pod's members miss the line; Warn; no retry (R11).
- **Member mid-handoff or travelling.** Not seated on either pod when the line arrives: misses it
  (R15). A member who reaches the sender's pod between acceptance and the read's answer misses it
  too (R10).
- **Member away or in reconnect grace.** Not connected: misses it (R15).
- **Member in the main menu or between worlds.** Not seated in a world: misses it (R13, FS-WJGFJ
  R10).
- **Recipient's writer queue full.** That recipient misses the line; nobody waits (R8).
- **Sender's character renamed mid-session.** The name in play at stamping (FS-WJGFJ R16).
- **Pod shutting down.** Letters still queued are dropped with the inbox (at-most-once).
- **Duplicate arrival.** Not expected by design; the client already ignores a repeated
  `message_id` (FS-WJGFJ R23).

## Out of Scope

- **System lines in the party channel**: party events (joins, leaves, leader changes, ready-check
  results) and loot allocation notices (FS-V780R). Party events keep arriving as `party_notice`
  (FS-R82NV R31). A later FS adds sender-less party lines; nothing here blocks it. **[charter
  default]**
- **Toasts** for party chat or party events.
- **Greying the Party channel** when the player has no party, or any client-side party check.
  **[Nick]**
- **Replay, history or storage** of party lines; delivery to members who were offline (ADR-0033).
- A **new Redis channel** or data structure for party chat, an **HTTP endpoint**, or any storage.
- **Whisper** (FS-KCQ06), **trade** chat, **mute and report** (FS-4HEG7), and the **party loot
  rule** (FS-V780R).
