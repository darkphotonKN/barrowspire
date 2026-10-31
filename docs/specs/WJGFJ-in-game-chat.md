# FS-WJGFJ: In-game chat — area chat and the chat window

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Chat" (area chat across the pod), `game-client/SPECIFICATION.md` "### Chat" (in-game chat window · channel filters on one chat stream) → this FS · Related ADRs: [ADR-0032](../adr/0032-area-chat-is-scoped-to-the-pod-not-the-session.md) (area scope is the pod), [ADR-0033](../adr/0033-chat-is-never-stored-a-report-carries-its-own-evidence.md) (chat is never stored), [ADR-0004](../adr/0004-game-traffic-bypasses-the-application-gateway.md) (chat rides the game WebSocket), [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (one connection per pod across worlds), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) / [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (canvas chrome on the game palette, tokens only) · Followed by: [FS-5SH4G](5SH4G-cross-pod-chat-channels.md) (world chat, whisper; draft), [FS-4HEG7](4HEG7-chat-moderation.md) (mute, report; draft) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) § Chat, [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) § Chat terms · Scoped 2026-10-31, promoted 2026-10-31. Decisions marked **[user]** were the user's; **[charter default]** were proposed by Claude and approved without objection.

## Summary

Players in Barrowspire can talk. A chat window sits at the bottom-left of the game canvas in
town, in the fields and inside the Spire, showing one stream of messages coloured by channel,
with a row of toggles to hide the channels a player does not want to read. This feature ships
the first channel, **area chat**: everyone connected to the same game-service pod hears it,
wherever on that pod they stand. It also fixes the message envelope and the five channel types
(area, world, party, whisper, trade) so the later channels add behaviour, not shape.

The server is a relay: it stamps, addresses and forwards a message, and keeps nothing.

**Lane.** game-service is the human lane (root `CLAUDE.md`): the server slices here are
hand-coded unless the user says otherwise; agent help is tests. The client is the agent lane.

## Requirements

### A. Message model (shared by every channel, now and later)

1. A chat message belongs to exactly one **chat channel** from the closed set
   `area | world | party | whisper | trade`, and has a **scope key** naming its audience. For
   `area` the scope key is the pod id. This FS implements `area` only. **[user]**
2. **Inbound** is the existing WebSocket action `chat` with payload `{ channel, text }`.
   `target` is reserved for whisper (FS-5SH4G) and ignored here. SocketManager keeps injecting
   `player_id` and `session_id` as today, but the server identifies the sender **from the
   connection**, never from the payload. **[charter default]**
3. The receiving pod **stamps** the message before anything else happens: `message_id` (uuid v4,
   minted by the pod), `sender_id`, `sender_name` (the name of the character in play, the same
   string the name plate shows), `channel`, `scope` (the pod id for area), `sent_at` (UTC,
   RFC 3339 with milliseconds). The client never supplies any of these. **[charter default]**
4. **Outbound** is the action `chat` with the stamped message as payload. A recipient's client
   renders what the server sent and nothing else; the sender hears their own line through the
   same delivery, not a local echo. **[charter default]**
5. **Text rules.** Text is trimmed; line breaks and other control characters become single
   spaces. Empty after trimming: dropped with no notice. Longer than **200 characters** (counted
   in Unicode code points, not bytes): refused with a notice. **[user: 200]**
6. **Flood control.** One message per player per **2 seconds**, across all channels, measured
   on the pod the player is connected to. A message inside the window is refused with a notice.
   No queueing, no later delivery. **[user]**
7. **Notices.** A refusal or any other system line is the outbound action `chat_notice` with
   payload `{ code, text }`. Codes in this FS: `too_long`, `too_fast`, `channel_closed` (a
   channel the server does not relay yet, R8), `not_in_world` (R10). `text` is lore-voiced copy
   the client may show verbatim; the client keys behaviour on `code`. **[charter default]**
8. A `chat` whose `channel` is one of the four not yet implemented is refused with
   `channel_closed`. A `channel` outside the five is refused the same way. Nothing about the
   envelope changes when a later FS opens a channel. **[charter default]**

### B. Area relay (game-service)

9. **The audience of an area message is every player seated in any world on this pod** at the
   moment of relay: the union of the players of every session the message hub holds (hub, each
   field channel, each run). Not one session, not one world type (ADR-0032). **[user]**
10. A connected player who is in no world (main menu, between worlds) can neither send area chat
    (refused, `not_in_world`) nor receive it. **[charter default]**
11. Chat is handled **on the message hub**, like the menu actions. It is never forwarded to a
    session's message channel and never touches an ECS world or a system. **[charter default]**
12. Delivery uses the existing per-connection writer queue with its existing non-blocking send:
    a recipient whose queue is full misses the line, and nobody else waits. A recipient who
    disconnected between audience resolution and delivery is skipped without error.
13. **Order.** Messages are relayed in the order the hub receives them, and every recipient on
    the pod receives them in that same order.
14. **Nothing is kept** (ADR-0033): no buffer, no history, no replay on reconnect. The relay does
    not log message text at any level; a Debug line may carry the sender id, channel and length.
15. Area chat behaves identically in hub, field and run worlds. A world switch on the same pod
    does not interrupt it. After a handoff to another pod (FS-K2HKP), the player's area is the
    new pod's population; no notice is sent about the change (ADR-0032).
16. A player whose character is renamed or swapped mid-session (FS-G4VMQ re-seat) sends under
    the name in play at stamping time; earlier lines keep their earlier name.

### C. The chat window (game-client)

17. The chat window appears in every canvas world view (HubScene, FieldScene, BarrowspireScene)
    and in no menu scene. It is camera-fixed, at HUD depth (1000), below popups and overlays
    (2000). **[charter default]**
18. **Position.** Bottom-left of the canvas. Where the ResourceHud (health and class resource
    bars, FS-8AY7S) is present, the window sits **directly above it**, flush to its top edge; in
    worlds without a ResourceHud it sits flush to the bottom edge. The ResourceHud does not move.
    **[user]**
19. **Shape.** Width 360 px. The message area shows the newest 8 lines, newest at the bottom, in
    a dark-vellum, carved-stone panel per the guideline's "Panels in the world"; lines wrap
    inside the width. Above it, the filter row (R24); below it, the input (R26). Every colour is
    a `BARROW_HEX` token (ADR-0013, ADR-0025). **[charter default: sizes]**
20. **Buffer.** The window holds the newest **100 lines** across all channels, hidden ones
    included; the 101st drops the oldest. The buffer lives in a store, not in a scene, so a scene
    change (town → field → the Spire and back) never clears it. Only a page reload empties it.
    **[user]**
21. **Scrolling.** The mouse wheel over the message area scrolls the buffer. While scrolled up,
    new lines do not pull the view down; returning to the bottom resumes following. A line that
    arrives while the window is following appears at once.
22. **Line format.** `HH:MM  Name: text`, the time from `sent_at` in the player's local zone, the
    name and text in the channel's colour. Text is rendered as text, never as markup.
23. **Dedupe.** A line is keyed by `message_id`; a second arrival of the same id is ignored.
24. **Channel filter.** A row of five toggles, `Area · World · Party · Whisper · Trade`, all on by
    default. A toggled-off channel is hidden, not muted: its lines keep entering the buffer and
    reappear when toggled on. The toggle state persists in this browser (localStorage) and is
    restored on load; a storage failure falls back to all-on. Channels this FS does not relay
    still appear as toggles, so the row's shape never changes later. **[user: PoE2 model]**
25. **Area label.** The filter row ends with where the player is, from the state broadcast's
    world identity, in the client's lore words: `Area: Town`, `Area: Gentle Meadows`,
    `Area: Forlorn Forest`, `Area: the Spire`. It describes the player's place; it does not
    narrow who hears them (ADR-0032). **[charter default]**
26. **Input.** Pressing **Enter** with no overlay, dialogue or other input owning the key opens
    the input line and gives it focus. While it is open, the scene's keyboard input is disabled
    (as the end-of-run overlay does), so WASD, E and ESC reach the input only. **Enter** sends the
    text and closes the input; **Esc** closes it and discards the draft; Enter on an empty input
    closes it. Clicking the input line also opens it. The input stops accepting characters at
    200. **[user: PoE style]**
27. When NPC dialogue, the gear overlay, a container view or any other owner of Enter/Esc is
    open, Enter does not open chat; when chat is open, those owners do not react to Enter/Esc.
    Exactly one thing owns the keys at a time.
28. **Channel of a sent message.** In this FS the input always sends `area`. An `@` prefix is
    reserved for whisper (FS-5SH4G) and is sent as plain text for now.
29. **Notices** (R7) render as system lines in the stream, prefixed `—`, in the system colour,
    with no name and no time. System lines are never filtered out and count toward the 100.
30. **Colours**, the user's choice mapped onto the game palette: **[user: hues; charter: tokens]**

    | Channel | User's word | Token (`BARROW_HEX`) | Note |
    |---------|-------------|----------------------|------|
    | Area | white | `vellum` | the guideline's neutral HUD text; pure white is forbidden |
    | World | light blue | `necrotic` | the palette's only blue (necrotic teal `#688b8f`); it also colours the Rare rarity badge, which is a badge, not running text, so no clash. If it reads too grey in place, the implementing slice adds a lifted `necroticLight` token rather than a literal |
    | Party | green | `arcane` | |
    | Whisper | purple | `umbraLight` | the guideline keeps umbra for Shadow Shot only; the implementing slice **widens that rule by one line** in `design-guideline.md` to admit whisper text, or the user picks another hue |
    | Trade | orange | `ember` | **not** `amber`: amber means *interactable* on the canvas and chat text is not |
    | System line | — | `vellumDark` | |

    Every channel colour must clear 4.5:1 against the panel. Where a token fails (ember,
    necrotic and umbraLight are the risks), the implementing slice adds a lifted token to `theme.ts` rather
    than using a literal (ADR-0013). Party and Trade colours ship in the filter row now even
    though no message can carry them yet.
31. The window never claims pointer events outside its own panel; clicking the world beside it
    still moves, attacks or interacts as before.

### D. Type skeleton

32. The client defines the chat channel type as the closed union of the five names and the
    filter state as a record over them; the server defines the same five as constants. Adding a
    sixth channel later is a type change on both sides, never an envelope change.

## Amendment 2026-10-31 (R20: a buffer per channel)

Decided with the user while building I-WJGFJ-5, because a channel filter makes the shared cap
visible: with 90 world lines in 100, a player who hides World is left with 10 area lines. **R20
now reads: the window holds the newest 100 lines per channel, and system lines keep their own
100.** A loud channel only ever pushes out its own old lines. The stream is still one, in
arrival order; with every channel shown, scrolling far back reaches only the quieter channels'
older lines. 100 per channel was chosen over 1000: the window shows 8 lines and the wheel moves
one line per notch, so lines past a few hundred are unreachable in practice, and the cap is one
constant to raise later. The acceptance criterion "101 messages leave 100 in the store" holds
per channel.

## Amendment 2026-10-31 (the window's look, a channel picker, collapsing)

Decided with the user after seeing the window running locally. Each item replaces or extends
the requirement named. Built as I-WJGFJ-6.

- **R22 (line format):** no time. A line reads `Name: text`. `sent_at` stays on the wire.
- **R25 (area label):** removed. The window no longer says where the player is.
- **R24 (filter row):** behaviour unchanged (five independent toggles, any combination shown);
  drawn as joined, separated tab segments, a hidden channel's segment dim.
- **R19 (shape):** a divider line between the lines and the input row; the input row has a
  near-black ground (the darkest ramp token, never `#000`); the panel gets a finer frame.
- **R28 (channel of a sent message), replaced:** a channel picker sits at the input row's left
  and lists all five channels; only the channels the server relays are selectable, the rest
  are shown disabled (today only Area). Each channel has a prefix, PoE style: Area none, World
  `#`, Trade `$`, Party `%`, Whisper `@` (followed by a name, FS-5SH4G). Picking a channel puts
  its prefix at the start of the input; typing a prefix at the start picks its channel; removing
  it goes back to Area. A prefix of a channel that is not open yet is plain text. A sent line
  carries the picked channel and its text without the prefix.
- **New (collapse):** a button folds the window down to its input row and unfolds it again. It
  stays as the player leaves it, kept in this browser like the filter. Arriving lines do not
  unfold it. *Revised the same day by the user:* opening the input in a folded window (Enter or
  a click) unfolds it, so the player sees what they are answering.
- **R26 (input), revised the same day by the user:** Enter on a typed line sends it and the input
  **stays open** for the next line, its channel and prefix ready. Enter on nothing closes it (two
  Enters after a line return to the game, as in PoE); Esc closes and drops the draft; a press in
  the world closes it and keeps the draft.
- **New (recall), asked by the user the same day:** in the open input, ArrowUp walks back through
  the lines this player sent and ArrowDown forward, as a terminal's history; past the newest, the
  half-typed draft comes back. The newest 50 sent lines are kept (Claude's call, the user left
  the depth open: chat recall reaches a few lines back, rarely dozens), the same line twice in a
  row once, prefix included so the channel follows. Held for the page's life only, like the
  stream, and never written to browser storage. While an input method composes, the arrows are
  its own. Typing still needs the input focused
  (R26), and an open window never holds the keys while the player plays.

## User Stories

1. As a player in town, I want to type a line and have everyone in town on my server see it, so
   that the town feels inhabited.
2. As a player inside the Spire, I want to keep reading and writing in the same chat window I
   had in town, so that a run does not cut me off from the people I was talking to.
3. As a player in a field, I want to hear players in town and in the Spire on my server, so that
   I know others are around even when my field is empty.
4. As a player, I want to press Enter, type, and press Enter again, so that chatting does not
   take my hands off movement for longer than a sentence.
5. As a player with the input open, I want W/A/S/D to type letters and not move my character, so
   that I do not walk into a monster mid-sentence.
6. As a player, I want Esc to drop what I was typing, so that I can bail out quickly when
   something happens on screen.
7. As a player, I want my own line to appear in the window, so that I know it went through.
8. As a player, I want each line to carry the character's name and a time, so that I can follow
   a conversation.
9. As a player, I want to scroll back up to read what I missed during a fight, and not be yanked
   down by every new line, so that reading is possible.
10. As a player, I want to hide a channel I do not care about and show it again later without
    losing what was said, so that the window stays readable.
11. As a player, I want my hidden channels to stay hidden when I come back tomorrow, so that I do
    not reset the filters every session.
12. As a player, I want to know whether the window is telling me about town, a field or the
    Spire, so that I can picture where I am.
13. As a player, I want a clear line in the window when my message was too long or too fast, so
    that I know why it did not appear.
14. As a player who was handed off to another server for a run, I want chat to simply keep
    working, so that infrastructure stays invisible.
15. As a player, I want the window and its colours to look like the rest of the barrow-deep HUD,
    so that it does not read as a web widget pasted on the game.
16. As the server, I want to stamp every message myself, so that no client can speak as someone
    else or forge a time.
17. As the server, I want to relay without storing, so that chat adds no database, no retention
    job and no data to protect (ADR-0033).
18. As the server, I want chat handled on the message hub and not in a world, so that an ECS tick
    never waits on a text message.
19. As a later feature (world chat, whisper), I want the envelope, the notice action and the
    channel type to already exist, so that I add a route and a colour, not a protocol.
20. As a reviewer, I want flood control and length limits enforced server-side, so that a
    modified client cannot spam the pod.

## Acceptance Criteria

### Server

- [ ] `chat {channel:"area", text}` from a player seated in the hub is delivered as `chat` to
      every player in the hub, every field channel and every run on the pod, including the
      sender, and to no one on another pod.
- [ ] The delivered payload carries `message_id` (uuid v4), `sender_id`, `sender_name` (the
      character's name), `channel:"area"`, `scope` (the pod id), `sent_at` (UTC RFC 3339 ms),
      `text`; any of these present in the inbound payload are ignored.
- [ ] A `player_id` in the inbound payload that differs from the connection's player does not
      change the stamped `sender_id`.
- [ ] Text of 200 code points is delivered; 201 is refused with `chat_notice {code:"too_long"}`
      and delivered to nobody. A 201-byte, 100-code-point text is delivered.
- [ ] `"  \n "` is dropped with no notice and no delivery. `"a\nb"` is delivered as `"a b"`.
- [ ] Two messages 1.9 s apart from one player: the second is refused with `too_fast` and the
      first is unaffected; 2.1 s apart both are delivered. Two different players 0 s apart are
      both delivered.
- [ ] A connected player who has not entered a world sends `chat`: refused with `not_in_world`.
      While they are in no world they receive no `chat` from others.
- [ ] `channel:"world"`, `"party"`, `"whisper"`, `"trade"` and `"shout"` are each refused with
      `channel_closed`.
- [ ] Ten messages from the hub in order A..J arrive at a recipient in a run on the same pod in
      order A..J.
- [ ] A recipient whose writer queue is full misses the line; delivery to the others completes.
- [ ] A recipient who disconnects between audience resolution and delivery causes no error and
      no retry.
- [ ] No `chat` handling path writes to Redis, Postgres or any in-memory history; after a relay
      the pod holds no reference to the text.
- [ ] Logs produced by a relay contain no message text.
- [ ] A world switch (hub → field → hub) on one pod does not change what the player receives.
- [ ] Table-driven tests cover: audience across world types, length boundary, flood boundary,
      not-in-world, closed channels, ordering.

### Client

- [ ] The window is present in HubScene, FieldScene and BarrowspireScene and absent in
      MainMenuScene, CharacterCreationScene and GameOverScene.
- [ ] In a run with a ResourceHud the window's bottom edge equals the ResourceHud's top edge; in
      the hub and fields the window's bottom edge is the canvas bottom.
- [ ] Width is 360 px; 8 lines visible; panel and text colours resolve to `BARROW_HEX` tokens and
      the lint fence passes.
- [ ] 101 messages leave 100 in the store, the oldest gone; hidden-channel lines count.
- [ ] A scene change hub → field → run → hub keeps the buffer; a page reload empties it.
- [ ] A second `chat` with an already-seen `message_id` adds no line.
- [ ] Each line shows `HH:MM  Name: text` with `HH:MM` from `sent_at` in local time; text
      containing `<b>x</b>` renders those characters literally.
- [ ] Scrolled up by one or more lines, a new message does not move the view; at the bottom it
      does.
- [ ] Toggling Area off hides existing and new area lines; toggling it on shows them all again.
      The toggle state is read back from localStorage on the next load; with storage throwing,
      all toggles are on.
- [ ] System lines show while every toggle is off.
- [ ] The area label reads `Area: Town` in the hub, `Area: Gentle Meadows` / `Area: Forlorn
      Forest` in those fields, `Area: the Spire` in a run.
- [ ] With nothing else open, Enter opens the input; W then types `w` and the character does not
      move; Enter sends `chat {channel:"area", text}` and closes; the scene's keyboard is
      re-enabled.
- [ ] Esc with a draft closes the input and sends nothing; Enter on an empty input closes it and
      sends nothing.
- [ ] With NPC dialogue open, Enter advances dialogue and does not open chat; with chat open, E
      does not interact and Esc does not dismiss dialogue.
- [ ] The input refuses the 201st character.
- [ ] `chat_notice` renders a `—`-prefixed system line in `vellumDark`, no name, no time.
- [ ] A click on the world beside the window still produces the scene's normal click behaviour.
- [ ] Unit tests cover the store (cap, dedupe, filter, persistence fallback) and the key
      ownership rules.

## Edge States

- **Empty / whitespace text** — dropped silently (R5). Nothing to tell the player.
- **Exactly 200 vs 201 code points; emoji and CJK** — counted as code points, so a 200-character
  Chinese line is fine and a single emoji counts as one (or two, for a surrogate pair the client
  must count the same way the server does: code points, not UTF-16 units).
- **Two messages inside 2 s** — second refused with `too_fast`; the window shows the notice; the
  first stands.
- **Player in the main menu** — cannot send (`not_in_world`), receives nothing. The window is not
  rendered there anyway.
- **Player disconnects during relay** — skipped; no error.
- **Writer queue full** — that player misses the line, as they miss a state tick today.
- **Reconnect within the 30 s window** — nothing is replayed (ADR-0033); the client buffer is
  still there because the page did not reload.
- **World switch on the same pod** — buffer intact, area unchanged, label updates.
- **Handoff to another pod** — buffer intact; the area is now the new pod; no notice.
- **Pod restart** — every player on it reconnects elsewhere or waits; no chat is lost that was
  ever stored, because none is.
- **NPC dialogue / gear overlay / container view open** — Enter belongs to them; chat does not
  open (R27).
- **Chat input open when the run ends** — the end-of-run overlay takes over; the input closes
  and its draft is discarded.
- **Unknown channel string** — `channel_closed`.
- **Forged `player_id` / `sender_name` in payload** — ignored; stamped from the connection.
- **Markup in text** — rendered as characters; Phaser text objects do not interpret HTML, and
  the input never injects into the DOM as HTML.
- **localStorage unavailable** — filters default to all on; toggles still work for the session.
- **Narrow canvas** — the window may overlap the AbilityHud at widths under ~800 px; accepted,
  the game targets desktop.
- **Many players on one pod** — audience is the pod's whole population (ADR-0015's ceiling bounds
  it); one relay is one loop over that list.

## Out of Scope

- **World chat and whisper** → [FS-5SH4G](5SH4G-cross-pod-chat-channels.md) (draft). Redis pub/sub,
  the single delivery path (ADR-0033 context), offline detection, `@name`.
- **Mute and report** → [FS-4HEG7](4HEG7-chat-moderation.md) (draft). The report HTTP endpoint and
  its `## API surface` live there.
- **Party and trade channels** — types only; behaviour waits for party formation and for the
  trade channel's own scoping.
- **History, catch-up on reload, offline delivery** — excluded by ADR-0033.
- **Profanity filtering, links, emotes, name click-to-whisper** — not discussed; whisper's click
  belongs to FS-5SH4G.
- **Session-scoped (village/tower isolated) area chat** — rejected by ADR-0032; would be a new
  scope type if ever wanted.
- **Mobile / narrow layouts.**
- **Moving the ResourceHud** — rejected during promotion; the window stacks above it.
