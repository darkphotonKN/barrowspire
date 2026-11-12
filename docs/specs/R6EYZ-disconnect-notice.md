# FS-R6EYZ: Lost-connection notice

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Transport" → "Lost-connection notice" → this FS · Related ADRs: none · Builds on: [FS-ZPX58](ZPX58-access-token-renewal.md) (R21 a `4001` renews and reconnects), [FS-MCYWK](MCYWK-reconnect-to-the-holding-pod.md) (the holding pod puts a returning player back; R18 one try at the default address), [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) (R29 a reconnect goes to the server the player moved to)

Promoted 2026-11-12 from the same day's draft, under the owner's approved charter "斷線通知"
("核准"). The owner's words: "斷線時目前前端不會顯示通知 可以在斷線時跳窗顯示斷線通知
然後按了就回到能重連的畫面讓他重新連線嗎" (today the client shows nothing when the connection
drops; pop up a disconnect notice, and pressing it goes back to a screen where the player can
reconnect). Decisions are marked **[charter]** (the owner's approved charter), **[code]** (forced
by what the code does, read on main 321d2b23), or **[fix in client]** (the charter's "if the
menu's flow cannot reconnect cleanly, fix that within the client").

**Lane.** game-client only (the agent lane). No server, proto, gateway or manifest change.

**Words.** A **lost connection** and the **disconnect notice** are in game-client `CONTEXT.md`.
A **world scene** here is one of `HubScene`, `FieldScene`, `BarrowspireScene` (town, field, run).

**Why a new FS.** No thin line owns what the player sees when the game socket dies. FS-MCYWK owns
the server's redirect at the handshake and the client following it; FS-ZPX58 owns a `4001` and its
recovery, which this notice leaves alone. Today an ordinary close only sets the connection status
to `disconnected`, behaviour no line claims, so the notice is a capability of its own under
"### Transport", the socket's lifecycle.

## Summary

When the game socket closes and the client did not let it go (a server restart or rollout, a
network loss, the browser closing it after sleep) while the player is in the town, a field or a
run, a carved notice says "Disconnected" over the dimmed, still world. Its one button, **Return to
menu**, takes the player to the main menu, which reconnects: a player the server still holds goes
straight back where they stood, a run included; anyone else enters the town from the menu as on
any visit. While the server cannot be reached the menu says so and offers a reconnect.

## Requirements

### A. The socket says when the connection is lost (`SocketManager`)

1. **The signal.** `SocketManager.onConnectionLost(listener)` adds a listener and returns its
   removal. Each lost connection tells every listener once. **[charter]**
2. **What is lost.** The game's current socket closing (`onclose` while it is still
   `this.socket`), except when:
   - the client let it go: `disconnect()` (it drops the socket before the browser reports the
     close), or a handoff's promote or a redirect (the socket is detached before it is closed);
   - it closed with `4001`: recovered by `recoverAuth` (FS-ZPX58 R21), or the auth error when no
     renewer is set; a recovery that finally fails runs the existing auth-error path;
   - a redirected socket closed before it ever opened and the one try at the default address is
     still to come (FS-MCYWK R18, `closedUnopened`);
   - a run or hub handoff is pending: the move decides. If it lands the player is connected; if it
     fails, `reconnectIfGone` opens a socket to the server they were on, and that socket's own
     close is a lost connection like any other. **[charter; code]**
3. **A socket that never opened counts** (a reconnect that could not reach the server). Whoever
   listens decides whether a notice is wanted. **[code]**
4. **Nothing else in the close changes.** The status still goes `disconnected` and the status line
   is still told; nothing is retried. **[charter: no silent auto-retry]**
5. **A lost connection forgets the run last handed off to** (`handoffSessionId`), so a later
   handoff to that run is followed rather than ignored as a repeat. **[fix in client]**

### B. The disconnect notice

6. **When it is raised.** On a lost connection while a world scene is starting or running. Never
   on the main menu, character creation, boot or preload (the menu shows the loss itself, §C), and
   never after the player left /game: the watch on the socket is bound to the game and let go with
   it. **[charter]**
7. **One at a time.** A lost connection while the notice is up raises nothing more. **[charter]**
8. **What it says.** Title **"Disconnected"**, one line **"The connection to the server was
   lost."**, one button **"Return to menu"**. **[charter]**
9. **How it looks** (design guideline "Panels in the world"; game palette, tokens only). The
   carved panel (`carvedPanel`: dark vellum on carved stone, brass rule and studs), centred in the
   view, about 380 × 170. The title in `hudText` at 18 px and the line in `hudLabel` at 14 px, both
   the body serif, centred. The button brass-outlined (`frame`) with its label in the
   interactable amber (`interactable`), its outline brightening (`frameBright`) under the pointer,
   with the hand cursor. Behind the panel, the whole view dimmed with `inkDeep` at 0.6. Laid out
   again, still centred, when the logical view changes (FS-ZAJMH R13). **[charter]**
10. **The world takes no input.** While the notice is up every world scene that is running is
    paused: no keys, clicks or wheel reach it and it does not update, though it is still drawn
    under the dim. A world scene that comes up while the notice is up is paused as it comes. The
    page's DOM layer over the canvas (the chat input, the party invite field) is hidden and a
    field that had focus loses it; the layer comes back when the notice goes. **[charter; code:
    Phaser's `canInput()` is false for a paused scene]**
11. **It survives scene changes.** The notice is its own scene, drawn over every other, and not
    one of the scenes a world switch replaces (`WORLD_SCENES`). **[charter]**
12. **Return to menu.** Pressing it takes the notice down, stops every world scene and the menu
    that is starting, running or paused (a world switch does not stop a paused scene, so the
    button does), and starts the main menu, which reconnects (§C). It closes no socket: game-service
    ends a player's stay at once on a client's normal close (`handleReadError`), which would throw
    away the run it holds. **[charter; code]**
13. **Only the button takes it down**: no key, no click outside it, no timeout. **[charter]**

### C. The main menu reconnects

14. **On arrival.** The main menu, coming up with the socket `disconnected` or in `error`,
    reconnects at once. A socket still open or connecting is left alone. **[fix in client: today
    only `BootScene` connects, once per page]**
15. **While the socket is down** the menu's primary button reads **"RECONNECT"**, is pressable,
    and reconnects. Connected, it reads "ENTER THE TOWN" as today; connecting, "CONNECTING...",
    disabled, as today. The status line under it is unchanged ("The torch gutters // Connection
    lost" while down). **[fix in client: a server still restarting would otherwise leave a dead
    button]**
16. **Where the menu reconnects.** To the server the player was last on (`serverAddr`, FS-K2HKP
    R29), as the same player, on a plain connection (no `redirected=1`). If that socket closes
    without ever opening and that server is not the default address, the menu tries **once** more
    at `DEFAULT_SERVER_ADDR`, which becomes `serverAddr`; the default's landing pod sends the
    player on to a holding pod that still holds them (FS-MCYWK R5). If that also closes unopened,
    or the server was already the default, it is an ordinary lost connection and the menu shows
    the loss again. **[fix in client: a rollout leaves the run's host address dead]**
17. **What the server sends is dispatched as on any connection.** A player the server still holds
    gets `reconnected` and `world_entered`, and the world switch puts them back (the run
    included); one it does not hold is seated fresh and enters the town from the menu. **[code]**

## User Stories

1. As a player in the town when the server restarts, I want to be told the connection was lost, so that I am not left walking a frozen town wondering why nothing answers.
2. As a player in a run when my network drops, I want a notice at once, so that I know to go back and reconnect before my hold runs out.
3. As a player in a field, I want the same notice, so that every world tells me the same way.
4. As a player whose laptop slept, I want the notice waiting when I open it, so that I see what happened.
5. As a player, I want one button that takes me back, so that I never have to reload the page to play again.
6. As a player held in a run by the server, I want Return to menu to put me back in that run, so that a dropped connection does not cost me my delve.
7. As a player the server no longer holds, I want to land on the menu connected and enter the town, so that coming back is an ordinary visit.
8. As a player when the server is still down, I want the menu to say the connection is lost and let me try again, so that I am not stuck on a dead button.
9. As a player, I want the world dimmed and still under the notice, so that I do not keep pressing keys into a game that no longer hears me.
10. As a player typing in chat when the connection drops, I want the chat field put away, so that my typing does not go into a dead socket.
11. As a player, I want only one notice however many times the connection fails, so that I press one button, not a stack.
12. As a player whose notice is up while a scene changes underneath, I want it to stay, so that I still see why I am stuck.
13. As a player travelling to my party leader's town or being handed off to a run, I want no notice for the socket the move lets go, so that a move never reads as a disconnect.
14. As a player whose token expired, I want the client to renew and reconnect quietly as it does today, so that a renewal never shows a disconnect.
15. As a player who signed out or left /game, I want no notice later, so that a page I have left does not pop up.
16. As a player on the main menu or making a character, I want the menu's own status to show a loss, not a popup, so that the menu stays the menu.
17. As a player whose run host was rolled away, I want the menu's reconnect to find a server through the shared address, so that a dead pod address does not strand me.
18. As a player with two tabs, I want the tab that lost its connection to the other to say so, so that I know which tab is live.
19. As a developer, I want the socket's lost signal tested for every kind of close, so that a later change to the close handling cannot silently raise or drop notices.

## Acceptance Criteria

### The signal (A)

- [ ] An ordinary close of the open game socket (`1006`, `1001`, `1012`, a server's `1000`) tells the lost listeners once; a removed listener is not told.
- [ ] A socket that never opened and closes (a reconnect that cannot reach the server) tells them.
- [ ] `disconnect()` followed by the browser's close tells nothing.
- [ ] A `4001` close tells nothing, with a renewer (recovery runs) and without one (the auth error runs).
- [ ] A redirect: the landing socket's close tells nothing; the redirected socket closing unopened tells nothing while the default-address try is to come; that try closing unopened too tells them.
- [ ] A promoted handoff: the old socket's close tells nothing.
- [ ] A close of the game socket while a run handoff or a hub handoff is pending tells nothing; a failed handoff's reconnect that then closes tells them.
- [ ] After a lost connection, a `world_handoff` to the run last handed off to is followed.
- [ ] The status still goes `disconnected` on a lost connection.

### The notice (B)

- [ ] A lost connection with a world scene starting or running raises the notice; with only the menu, character creation, boot or preload up, it does not.
- [ ] A second lost connection while the notice is up raises no second one.
- [ ] After the game's watch is let go (leaving /game), a lost connection raises nothing.
- [ ] The notice shows "Disconnected", "The connection to the server was lost." and "Return to menu", centred in the view at 1080 and 1280 wide, laid out again on a view change.
- [ ] While up: every running world scene is paused, one that comes up later is paused too; the DOM layer is hidden and a focused field blurred; the layer comes back when the notice goes.
- [ ] Return to menu takes the notice down, stops every world scene and menu started, running or paused, starts the main menu, and closes no socket.
- [ ] No key, outside click or timer takes the notice down.

### The menu (C)

- [ ] The menu coming up with the socket disconnected or in error reconnects once; open or connecting, it does nothing.
- [ ] While down the primary button reads "RECONNECT" and pressing it reconnects; connected it reads "ENTER THE TOWN" and enters; connecting it reads "CONNECTING..." and does nothing.
- [ ] The menu's reconnect goes to `serverAddr` without `redirected=1`; if that closes unopened and is not the default, one more at `DEFAULT_SERVER_ADDR`, which is then `serverAddr`; at the default already, no second try.
- [ ] Whole client suite, `tsc --noEmit` and lint green.

### Live (owner's browser check)

- [ ] In the town, a field and a run: stopping game-service raises the notice; the world is dimmed and still, and keys, clicks, wheel and the chat field do nothing.
- [ ] Return to menu with game-service still down: the menu shows the loss and RECONNECT; starting game-service and pressing RECONNECT connects, and ENTER THE TOWN enters.
- [ ] A held run: the tab that lost its socket (to a second tab of the same player) shows the notice; Return to menu puts it back in the run.
- [ ] No notice on a travel to a leader's town, on entering a run, on leaving /game, or on the menu.

## Edge States

- **Two tabs of one player:** the server keeps one live connection and closes the older one
  without a close frame (`1006`), so the older tab gets the notice. Pressing Return to menu takes
  the connection back, and the other tab gets the notice in turn. Accepted: it was taken over.
- **Server still down when the button is pressed:** the menu's reconnect fails, the menu shows
  the loss and RECONNECT (R15).
- **Server restarted (nothing held), or the grace ran out first** (30 s, 10 s after a going-away
  close): the menu connects fresh; ENTER THE TOWN as on any visit (R17).
- **Dropped in a field:** the server waits out the grace with the player in the town (FS-X2F2H
  R17), so the menu's reconnect lands in the town.
- **A lost connection during a run or hub handoff:** the handoff decides (R2); only if it fails
  and the reconnect to the old server closes too is the notice raised.
- **A lost connection while a world scene is still loading its art:** the notice is raised (the
  scene is starting); the scene is paused once it is running.
- **A socket reconnected under the notice** (a world scene coming up reconnects in its create):
  the notice stays until pressed (R13); the button still closes nothing (R12).
- **The menu or character creation up when the connection is lost:** no notice; the menu shows the
  loss and RECONNECT (R6, R15). Character creation shows nothing new; back on the menu, it
  reconnects (R14).
- **The settlement record holding the town behind it** (FS-GV8WN R23) when the connection is lost:
  the run scene is paused under the notice; Return to menu stops it with its record.
- **Signed out elsewhere (a refused renewal):** the existing auth error sends the player to /login;
  no notice.
- **Leaving /game, then the socket closes:** nothing (R6).

## Out of Scope

- Retrying on its own before or instead of the notice (charter: v1 shows it at once).
- Any server, proto, gateway or manifest change, and the server's reconnect grace.
- A notice on the main menu, character creation or the web pages outside /game.
- Keeping the world live under the notice, or resuming it in place without the menu.
- Telling why the connection was lost (restart, network, two tabs): one line for every loss.
- A keyboard shortcut for the button.
