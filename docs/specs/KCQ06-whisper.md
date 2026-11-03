# FS-KCQ06: Whisper a player on any pod

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Chat" → "Whisper a player on any pod"; `game-client/SPECIFICATION.md` "### Chat" → "Whisper a player from the chat window", "Click a sender's name to whisper them"; `game-client/SPECIFICATION.md` "### Character" → "A character name is one word"; character-service has no SPECIFICATION.md (spec-audit to reconcile) → this FS · Related ADRs: [ADR-0032](../adr/0032-area-chat-is-scoped-to-the-pod-not-the-session.md), [ADR-0033](../adr/0033-chat-is-never-stored-a-report-carries-its-own-evidence.md), [ADR-0037](../adr/0037-party-state-lives-in-redis-membership-spans-pods.md) (presence index and pod inbox) · Builds on: [FS-WJGFJ](WJGFJ-in-game-chat.md) (envelope, notices, picker, prefixes, the window), [FS-5SH4G](5SH4G-world-chat.md) (cross-pod chat, at-most-once), [FS-XGW7H](XGW7H-party-chat.md) (a chat line carried by a pod-inbox letter), [FS-NCC9J](NCC9J-party-membership-across-pods.md) (the presence index)

Promoted 2026-11-03 under Nick's charter "私訊" (defaults #1–#12 approved: "私訊的部分 核准").
The draft (2026-10-31, parked "私訊先暫時不做") left offline detection and addressing open; both
are now answered by infrastructure FS-NCC9J and FS-XGW7H built since: the **presence index**
(`internal/partypresence`, name or id → pod, address, world) and the **pod inbox**
(`pod:<podID>:inbox`). Decisions are marked **[Nick]** (carried over from the draft, the user's
own) or **[charter #N]** (approved default, with its reason).

**Mechanism refined.** The draft carried "every pod receives the publish; a pod that does not hold
the target ignores it" (world-chat style). The user's decision was *only the holding pod
delivers*. This FS keeps that decision and refines the mechanism: the sender's pod finds the
target's pod in the presence index and sends **one whisper letter to that pod's inbox**, as party
chat does. No other pod receives it. **[charter #1: the same path as party chat; no broadcast]**

**Lane.** game-service is the human lane (root `CLAUDE.md`); the server slice is authorised by
Nick's charter of 2026-11-03. The client is the agent lane.

**Charter addendum, 2026-11-03.** Two changes, approved in the same charter:
- R12's name escalation is answered by option (c): a character name is one word ("限制名字不能包含空格",
  then "db創角色的名字條件要調整"). This adds §D (character-service and the client's creation
  scene), which this FS carries because whisper is the feature that drives it.
- The I-KCQ06-2 follow-up: a whisper to a pod nobody is listening on reads `not_online` (R8a).
- Later the same day: no existing character has whitespace in its name, so the database backstop
  is a plain validated table `CHECK` (R19) and the old-names limitation is moot (R20). Nick:
  "目前沒有舊角色名字有空白 就直接check".

## Summary

A player can whisper any other player who is online, on any server and in any world. Typing
`@Name message` in the chat window sends the message to that player alone; clicking a sender's
name in the window fills in `@Name ` ready to type. The target sees "From Name: …" in purple; the
sender sees "To Name: …" once it has gone out. If the target is not online the sender is told
"That player is not online." and nothing is kept, queued or retried.

## Requirements

### A. Accepting a whisper (game-service)

1. **The whisper chat channel opens.** An inbound `chat` with `channel: "whisper"` is relayed when
   the pod has the presence index and the pod inbox configured. A pod without them answers
   `channel_closed`, as world chat does without its bus (FS-5SH4G). The envelope gains one
   inbound field, **`target`**: the target's character name as typed (trimmed, any case). Nothing
   else in the payload names the sender (FS-WJGFJ R2).
2. **Check order.** A whisper is refused in this order, each with a chat notice to the sender
   alone and nothing sent:
   1. `not_in_world`: the sender stands in no world (main menu), unchanged (FS-WJGFJ).
   2. `channel_closed`: per R1.
   3. `whisper_self` "You can't whisper yourself.": `target` equals the sender's own character
      name, compared trimmed and case-insensitively. **[charter #6: the smallest v1]**
   4. Empty `target` or empty text after normalising: dropped silently, as an empty line is
      (FS-WJGFJ R5).
   5. `too_long`: over 200 characters (FS-WJGFJ).
   6. `too_fast`: inside the sender's 2 s flood window, which **whisper shares** with area, world
      and party. An accepted whisper starts the window like any other line, whether or not the
      target turns out to be online. **[charter #9: one window, so a whisper is no way around it]**
3. **Finding the target.** The sender's pod looks the name up in the presence index
   (`partypresence.Redis.Lookup`), case-insensitively, off the hub loop through the runner, as
   party chat reads presence (FS-XGW7H R9). **[charter #2, #3: the index already exists; names
   are unique case-insensitively]**
4. **Offline.** No presence entry, or a lookup that fails, means **offline**: the sender gets one
   chat notice `not_online` "That player is not online.", and nothing is stored, queued or retried
   (ADR-0033). The index cannot tell "offline" from "no such character", and both get the same
   notice. A player on the main menu (no character seated) has no entry, so is offline **[charter
   #7]**. A crashed pod's entries lapse with the presence TTL (30 s), after which its players read
   as offline. **[Nick] [charter #4]** Within that window a whisper to the crashed pod also reads
   offline, through R8a. *(Amended 2026-11-03, charter addendum; Nick: 好 (I-KCQ06-2 follow-up).
   Was: within the TTL a letter to a crashed pod was lost and the sender saw the echo.)*
5. **Any world.** A target found in the index is whispered whatever world they stand in: hub,
   field or run, the Spire included. **[charter #8: presence covers every world]**

### B. Carrying and delivering (game-service)

6. **Stamping.** The sender's pod stamps the line as every chat line is stamped (FS-WJGFJ R3:
   message id, sender id, sender name as the name plate shows it, `sent_at`, text), with
   `channel: "whisper"`, **scope key = the target's player id** (CONTEXT.md "Scope key"), and two
   more outbound fields: `target_id` and `target_name` (the name as the index holds it).
7. **Same pod.** A target seated on the sender's pod gets the line straight through the writer
   queue.
8. **Another pod.** For a target on another pod, the sender's pod sends **one `whisper` letter**
   to that pod's inbox: `{kind: "whisper", to_player_id, payload: <the stamped line>}`. It is a
   new letter kind next to `party_chat`. The receiving pod hands it to that player if they are
   seated there in a world, and drops it with a Debug line otherwise. It doesn't consult anything
   else (as FS-XGW7H R13). At most once, like every letter. **[charter #1]**
8a. **Nobody listening reads as offline.** A whisper letter is published with a receiver count
    (`chatbus.Redis.PublishCount`, new, used for whisper letters only). A count of 0 means no
    pod is subscribed to that inbox, i.e. the target's pod is gone: the sender gets `not_online`
    and no echo, exactly as for a failed send. `chatbus.Redis.Publish` and every other letter kind
    (party chat, invites, updates, notices) are unchanged. The check is the publish itself, with
    no separate liveness read, so there is no window between checking and sending. **[charter #2:
    the target's pod being dead counts as offline]** *(Added 2026-11-03, charter addendum; Nick:
    好 (I-KCQ06-2 follow-up).)*
    This assumes Redis is **not** a Redis Cluster. In Cluster mode `PUBLISH` returns only the
    subscribers on the node that received it, so a live pod subscribed through another node can
    read 0. Every deployment runs `REDIS_MODE: "standalone"`
    (`game-server/deploy/gke/game-config.yaml`, and kind's the same). Moving to Cluster mode needs
    a different liveness check for R8a. *(Added 2026-11-03.)*
9. **Echo to the sender.** The sender gets the same stamped line, so both sides see the exchange
   **[charter #5]**. The echo is sent **only when the line has gone out**: taken by the target's
   writer queue (R7), or the letter published to at least one pod (R8, R8a). A same-pod target
   whose writer queue can't take the line (full, or the connection just gone) has not been handed
   it: no echo, and the sender gets `not_online`. *(Amended 2026-11-03, review: the same-pod
   reading made explicit, and "published to at least one pod" since R8a. Was: "delivered to the
   writer queue (R7), or the letter handed to the inbox publisher (R8)".)* If the inbox can't take
   the letter (its `failed` callback: publisher behind, or the pod reaches no other pod), or no pod
   is subscribed to the target pod's inbox (R8a), there is no echo and the sender gets
   `not_online`, the same "couldn't deliver" notice as R4
   ("送不到就顯示離線通知"). There is no ack from the target's pod: a target who leaves that pod in
   the milliseconds between lookup and arrival misses the line, and the sender has still seen the
   echo (at-most-once, FS-5SH4G). *(Amended 2026-11-03: the R8a cause added to the list.)*
10. **Never stored.** No whisper is kept on any pod or in Redis beyond the letter in flight
    (ADR-0033). The presence index is read, never written, by whisper.

### C. Client (game-client)

11. **The `@` prefix sends a whisper.** `whisper` joins `CHAT_OPEN_CHANNELS`. A line typed as
    `@Name message` is sent with `channel: "whisper"`, `target: "Name"` and `text: "message"`.
    Today's behaviour, sending `@` lines as plain text on Area because whisper was closed
    (FS-WJGFJ Amendment), ends. **[Nick] [charter #10: PoE style]**
    The 200-code-point limit (R2 `too_long`, FS-WJGFJ) applies to the **message text only**, never
    to the `@Name ` prefix: the client measures and clamps what follows the name, and the server
    counts `text`, which never holds the target. *(Amended 2026-11-03, review. Was: silent on
    which part of the line the limit counts.)*
12. **Where the name ends.** The name is the text after `@` up to the first whitespace, and the
    message is the rest. A line with no message after the name is not sent and stays in the input.
    This is final: a character name is one word (§D). *(Amended 2026-11-03, charter addendum; Nick:
    限制名字不能包含空格. Was: written as option (a) pending Nick's answer to the names-with-spaces
    escalation.)* No existing character has whitespace in its name (§D R20), so every name parses
    whole.
13. **Picking Whisper in the picker** puts `@` at the start of the draft, as other channels put
    their prefix (FS-WJGFJ). A recalled whisper line (arrow keys) brings back its `@Name ` and
    so picks whisper.
14. **How a whisper reads.** A received whisper shows as "From Name: text" and the echo as
    "To Name: text", both in the whisper colour `chatWhisper` (`umbraLight` lifted, FS-WJGFJ R30)
    **[Nick]**. Whisper lines obey the window's existing whisper filter toggle.
15. **Click a name to whisper.** Clicking the sender's name in any chat line (any chat channel),
    or the name in a "To Name" echo, puts `@Name ` in the input (replacing the draft's prefix,
    keeping the rest) and focuses it. The hit area is measured from the name's rendered text
    width in the line, not the whole line. Clicking your own name does nothing. **[Nick] [charter
    #11]**
16. **Notices.** `not_online`, `whisper_self` and the existing codes show as chat notices
    (FS-WJGFJ R7). The client keys on the code.

### D. A character name is one word (character-service, game-client)

*(Added 2026-11-03, charter addendum; Nick: 限制名字不能包含空格 / db創角色的名字條件要調整.)*

17. **Creation refuses whitespace.** character-service `CreateCharacter` trims the name as today,
    then refuses it if any rune is Unicode whitespace (Go `unicode.IsSpace`: the ASCII space and
    tab, U+3000 ideographic space, NBSP and the rest), with the existing `ErrInvalidInput` and the
    text "A hero's name is one word." The check runs with the existing length check (1–32 runes);
    nothing else about creation changes. **[charter #13, #14]**
    It also refuses **U+FEFF** (zero-width no-break space), which `unicode.IsSpace` doesn't count
    but the client's `@` parse (JavaScript `\s`) splits on: a name the parse would cut is refused
    here. This service check is the **authority** on what counts as whitespace in a name; the R19
    `CHECK` is a backstop only. *(Amended 2026-11-03, review. Was: `unicode.IsSpace` alone.)*
18. **The client refuses it first.** `CharacterCreationScene` refuses a name containing whitespace
    (after its existing trim) before sending, with the same words. It still shows the server's
    refusal when the server refuses. **[charter #15]**
19. **Database backstop.** Migration `000003` adds a validated table `CHECK` constraint on
    `characters`:
    `CHECK (name !~ '[[:space:]]' AND strpos(name, U&'\3000') = 0)`. It is validated when added
    (no `NOT VALID`), so it holds for every row, old and new, and any INSERT or UPDATE that leaves
    a whitespace name fails with a check violation. Postgres's `[[:space:]]` follows the
    database's ctype and may not cover U+3000 under a C locale, so the ideographic space is
    tested explicitly. `000003.up` adds the constraint and `000003.down` drops it. **[charter
    #18]** `000003` is a **new** numbered migration pair (up and down). Existing migration files,
    `000001` and `000002`, are never edited: a schema change is always a new migration (Nick,
    2026-11-03: "schema有調整要用新的add migration不是改舊檔案"). *(Amended 2026-11-03; Nick:
    目前沒有舊角色名字有空白 就直接check. Was: a `BEFORE INSERT OR UPDATE OF name` trigger, chosen
    so that existing whitespace names could still be updated. There are none, so the plain
    `CHECK` is enough.)*
    **Two notes on the SQL, which stays as written.** (i) `U&'\3000'` is read as a Unicode escape
    only while `standard_conforming_strings` is on (Postgres's default). That matters only when
    `000003.up` runs: Postgres stores the `CHECK` already parsed, so a later change to the setting
    doesn't alter it. `chr(12288)` would remove the dependency. (ii) `[[:space:]]` under a C or
    glibc locale is narrower than R17's check (it can miss NBSP, U+FEFF and other Unicode spaces),
    so the `CHECK` is a backstop against ASCII whitespace and U+3000, and R17's service check is
    the authority. *(Added 2026-11-03, review.)*
20. **No existing name has whitespace.** Nick states that no existing character's name contains
    whitespace, so there is no rename and no data migration **[charter #16]**, and nothing is left
    that the R12 parse can't whisper. *(Amended 2026-11-03; Nick: 目前沒有舊角色名字有空白. Was:
    existing whitespace names were left alone and could not be whispered, a known limitation.
    That limitation is superseded.)*

## User Stories

1. As a player, I want to whisper someone by typing `@Name message`, so that only they read it.
2. As a player, I want to whisper someone on another server, so that it doesn't matter where the game put us.
3. As a player, I want to whisper someone who is inside the Spire or in a field, so that I can reach them mid-run.
4. As a player, I want to be told "That player is not online." when they aren't, so that I know they didn't get it.
5. As a player, I want a whisper to an offline player to be dropped, not saved for later, so that nothing I say is kept.
6. As a player, I want to see "To Name: …" after I whisper, so that I can follow both sides of the conversation.
7. As a player, I want a whisper I receive to read "From Name: …" in purple, so that I can tell it from public talk.
8. As a player, I want to click someone's name in chat and have `@Name ` ready, so that replying takes one click.
9. As a player, I want to click the name in my own "To Name" line, so that I can keep talking to the same person.
10. As a player, I want whispering myself refused, so that I don't think a message went somewhere.
11. As a player, I want the name to match whatever case I type, so that "@alice" reaches Alice.
12. As a player, I want whisper to follow the same speed limit as other chat, so that nobody can flood me by whisper.
13. As a player, I want the whisper filter in the window to hide or show whispers, so that I control my window.
14. As a player, I want picking Whisper in the channel picker to start my line with `@`, so that the picker and the prefix agree.
15. As a player, I want the up-arrow to bring back my last whisper with its name, so that I can whisper again quickly.
16. As a player on the main menu, I want to be shown as offline to whisperers, so that nobody expects a reply from me.
17. As a player, I want a whisper with no text after the name to stay in my input unsent, so that I can finish it.
18. As the owner of game-service, I want only the target's pod to receive a whisper, so that the other pods do no work for it.
19. As the owner of game-service, I want whisper to reuse the presence index and the pod inbox, so that there is no new Redis structure to run.
20. As the owner of game-service, I want the sender identified from the connection, never the payload, so that nobody can whisper as someone else.
21. As the owner of game-service, I want no whisper stored anywhere, so that ADR-0033 holds.
22. As the owner of game-service, I want a pod without Redis to answer `channel_closed`, so that single-pod development behaves predictably.
23. As the owner of game-service, I want the presence lookup off the hub loop, so that a slow Redis never stalls the pod.
24. As a player, I want a whisper to someone whose server just died to tell me they aren't online, so that I don't think it arrived. *(Added 2026-11-03, charter addendum)*
25. As a new player, I want to be told "A hero's name is one word." when I type a name with a space, so that I can pick a name everyone can whisper. *(Added 2026-11-03, charter addendum)*
26. As the owner of character-service, I want the database to refuse a name with whitespace even if a caller skips the service check, so that the rule can't be bypassed. *(Added 2026-11-03, charter addendum)*
27. ~~As a player whose old character has a space in its name, I want to keep playing and levelling it, so that the new rule doesn't break my character.~~ *(Added 2026-11-03, charter addendum. Superseded the same day: no such character exists, R20.)*
28. As the owner of character-service, I want schema changes made only by new migrations, so that a database already migrated is never out of step with its files. *(Added 2026-11-03, charter addendum)*

## Acceptance Criteria

- [ ] A `chat` with `channel: "whisper"` and a `target` naming a player seated on the same pod reaches that player once, as `channel: "whisper"`, scope = their player id, with `target_id` and `target_name`. The sender gets the same line as an echo.
- [ ] A whisper to a player seated on another pod is carried by exactly one `whisper` letter to that pod's inbox, and no other pod receives anything. The target gets the line, and the sender gets the echo.
- [ ] A whisper to a name with no presence entry gets `not_online` "That player is not online." with no echo, and nothing reaches any pod's inbox.
- [ ] A whisper to a player on the main menu (no character seated) gets `not_online`.
- [ ] A whisper to a player inside a run or a field is delivered.
- [ ] `target` is matched case-insensitively and trimmed.
- [ ] A whisper to one's own name, in any case, gets `whisper_self` and touches neither the flood window nor Redis.
- [ ] Check order holds: `not_in_world`, `channel_closed`, `whisper_self`, empty dropped, `too_long`, `too_fast`.
- [ ] A whisper inside 2 s of the sender's previous area, world or party line gets `too_fast`, and vice versa.
- [ ] A pod without the presence index or the pod inbox answers `channel_closed`.
- [ ] An inbox send that fails gives the sender `not_online` and no echo.
- [ ] A `whisper` letter for a player not seated on the receiving pod is dropped with a Debug line, and nothing else happens.
- [ ] The presence lookup runs off the hub loop (through the runner), and the hub loop never waits on Redis for a whisper.
- [ ] No whisper is written to any store, and whisper writes nothing to the presence index.
- [ ] Client: `@Name hello` sends `{channel: "whisper", target: "Name", text: "hello"}`. `@Name` alone is not sent and stays in the input.
- [ ] Client: `@`-prefixed lines are no longer sent on Area.
- [ ] Client: picking Whisper puts `@` at the start of the draft, and a recalled whisper picks whisper.
- [ ] Client: a received whisper reads "From Name: text" and the echo "To Name: text", both in `chatWhisper`. The whisper filter toggle hides and shows them.
- [ ] Client: clicking a sender's name in any line, or the name in a "To" echo, fills `@Name ` and focuses the input. A click elsewhere on the line doesn't, and clicking one's own name does nothing.
- [ ] Client: `not_online` and `whisper_self` show as chat notices.

*(Added 2026-11-03, charter addendum.)*
- [ ] A whisper letter published to an inbox with no subscriber (receiver count 0) gives `not_online` and no echo. A letter to a live pod is delivered as before. The other letter kinds are unaffected by a 0 count, and `chatbus.Redis.Publish` is unchanged.
- [ ] `CreateCharacter` with a name containing a space, a tab, or U+3000 after trimming returns `ErrInvalidInput` with "A hero's name is one word.", and writes no row. Leading or trailing whitespace is still trimmed and accepted.
- [ ] Client: `CharacterCreationScene` refuses such a name before sending, with "A hero's name is one word.", and shows the server's refusal if one arrives.
- [ ] With migration `000003` applied, the `characters` table carries a validated `CHECK` (not `NOT VALID`) on `name`. An INSERT with a name containing a space, a tab or U+3000 fails with a check violation, and so does an UPDATE that sets `name` to one. An UPDATE of `level`/`exp` (`ApplyExperienceGrant`) and a soft delete of a one-word character still succeed. *(Amended 2026-11-03. Was: a trigger, with whitespace-named existing characters still updatable.)*
- [ ] `000003.down` drops the constraint, and `000003` up then down then up applies cleanly on a clean database.
- [ ] Only new migration files: `git diff` shows no change under `game-server/character-service/migrations/` except the new `000003_*.up.sql` / `000003_*.down.sql` pair. `000001` and `000002` are untouched.

## Edge States

- **Target offline / unknown name:** `not_online`. The two can't be told apart (R4).
- **Target's pod crashed:** their entry lives until the presence TTL (30 s). Meanwhile no pod is subscribed to its inbox, so a whisper letter publishes to 0 receivers and the sender gets `not_online` with no echo (R8a). After the TTL the lookup itself reads offline. *(Amended 2026-11-03, charter addendum. Was: the letter was lost and the sender had seen the echo.)*
- **Target's pod hung, connection still open:** Redis still counts it as subscribed (count 1), so the letter is accepted, never handed over, and the sender has seen the echo. This lasts until the connection drops or the pod is restarted by its health checks. Accepted for v1. *(Added 2026-11-03, charter addendum.)*
- **Target changes pod between lookup and arrival** (travel, handoff into a run): the old pod drops the letter (not seated there), and the sender has seen the echo (at-most-once).
- **Target in reconnect grace:** they are present in the index, but not seated, so the letter is dropped on their pod. Accepted for v1.
- **Redis down:** the lookup fails, so `not_online` (R4). The sender is not told "Redis down".
- **Inbox publisher behind:** `not_online` and no echo (R9).
- **Sender and target on the same pod:** no Redis write and no letter; one presence read only.
- **Whisper to someone who whispered you, by clicking their name:** a normal whisper.
- **Name with spaces:** no name can have any: new names are refused (R17–R19), and no existing name has one (R20), so the R12 parse always finds the whole name. *(Amended 2026-11-03. Was first escalated, then a known limitation for old spaced names; both superseded.)*
- **An environment that does hold a whitespace name:** `000003.up` fails loudly when it adds the constraint, because the `CHECK` is validated against existing rows. This is accepted on purpose. The fix is to rename that row and re-run the migration, never to weaken the constraint (no `NOT VALID`, no dropping the U+3000 test). *(Added 2026-11-03.)*
- **Name with only leading or trailing whitespace:** trimmed and accepted, as today (R17).
- **A caller that bypasses `CreateCharacter`'s check** (direct SQL, a future rename path): refused by the 000003 `CHECK` on INSERT or UPDATE (R19).
- **Writer queue full, target on the sender's pod:** the line was not handed over, so no echo and the sender gets `not_online` (R9). *(Amended 2026-11-03, review. Was: "Writer queue full (target or sender): that copy is missed, and nobody waits", which read as an echo with the target's copy missed.)*
- **Writer queue full, target on another pod:** the receiving pod drops the letter's line with a Debug line, and the sender has already seen the echo (at-most-once, as for a target who changed pod).
- **Writer queue full, sender:** the echo is missed, and nobody waits.
- **Whisper by player id:** the presence index's `Lookup` reads any uuid-shaped `target` as a player id, so `@<player-id> text` whispers that player. Whispering yourself by id is still refused with `whisper_self` (the check compares player ids after the lookup). A consequence: a 32-hex-character name fits the 32-rune limit but can't be found by name, because it is looked up as an id. Party invites by name share this behaviour. Accepted, not changed in v1. *(Added 2026-11-03, review.)*
- **Duplicate arrival:** not expected; the client ignores a repeated `message_id` (FS-WJGFJ R23).

## Out of Scope

- **Mute and report** (FS-4HEG7), and **blocking** a player from whispering you.
- **Whisper history**, a "reply to last whisper" key, unread counts, and toasts or sounds for whispers.
- **Any storage or queueing** of whispers, and delivery to players who come online later (ADR-0033). **[Nick]**
- **Any change to how presence is written**, or a new Redis channel or structure. Whisper reads the index and uses the existing pod inbox.
- **An ack** from the target's pod back to the sender. The echo means "gone out", not "read".
- ~~**Names with spaces in the `@` prefix.**~~ Answered 2026-11-03 by option (c): §D. *(Amended, charter addendum.)*
- **Renaming or migrating existing characters**, or any rename feature (R20, charter #16). None has whitespace in its name.
- **A character-service SPECIFICATION.md.** The service has none; §D's capability is recorded here and in game-client's "### Character". spec-audit is to reconcile.
- **Trade** chat.
