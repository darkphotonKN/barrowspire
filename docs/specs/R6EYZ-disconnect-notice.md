# FS-R6EYZ: Lost-connection notice

> Status: draft · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Transport" → "Lost-connection notice" → this FS · Related ADRs: none · Builds on: [FS-ZPX58](ZPX58-access-token-renewal.md) (R21 a `4001` renews and reconnects), [FS-MCYWK](MCYWK-reconnect-to-the-holding-pod.md) (the holding pod puts a returning player back), [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) (R29 a reconnect goes to the server the player moved to)

## Scoping notes (raw)

Charter "斷線通知", approved by the owner (Nick) on 2026-11-12 ("核准"). The owner's words:
"斷線時目前前端不會顯示通知 可以在斷線時跳窗顯示斷線通知 然後按了就回到能重連的畫面讓他重新連線嗎"
(today the client shows nothing when the connection drops; pop up a disconnect notice, and
pressing it goes back to a screen where the player can reconnect). Scope-it was pre-answered by
the charter; these notes are its residue plus what reading the code found.

**Anchor: a new FS, not a `## Change:`.** No thin line owns what the player sees when the game
socket dies. FS-MCYWK owns the server's redirect to the holding pod at the handshake and the
client following it; FS-ZPX58 owns a `4001` close and its recovery, which this notice explicitly
leaves alone. Today an ordinary close only sets the connection status to `disconnected`
(`SocketManager` `onclose`), behaviour no line or FS claims. The notice is a capability of its
own, game-client only, under "### Transport" (the socket's lifecycle). One line; no brownfield
second line, because the pre-existing behaviour (a status change no one shows in a world) is not a
capability anyone claims.

### Decisions (charter, owner approved)

- **When.** An unexpected close of the game socket while the player is playing (town, field, run):
  a server restart or rollout, a network loss, the OS or browser closing it after sleep.
- **Not when.** The player leaving /game; a world handoff or redirect (the old socket let go on
  purpose); a `4001` being recovered by `recoverAuth` (it heals itself; if recovery finally fails,
  the existing auth-error path runs).
- **No silent auto-retry first.** The notice shows at once (v1 simple, state clear).
- **The notice.** Title "Disconnected", one line "The connection to the server was lost.", one
  button "Return to menu". In-game panel style (dark vellum, brass frame, tokens only), the world
  dimmed behind it and taking no input (keys, clicks, wheel).
- **The button** returns to the main menu, whose flow reconnects; a player disconnected in a run
  lands back in the run the server holds (FS-MCYWK), if it still holds them. If the menu's flow
  cannot reconnect cleanly, fix that within the client; anything needing the server is escalated.
- **One notice.** A second close while it is up does not stack a second one; the notice survives
  scene changes until pressed.
- **Bounds.** game-client only; no server, proto or gateway; tokens only.

### Found in the code (2026-11-12, main 321d2b23)

- `SocketManager.attach` `onclose`: `current` (the closing socket is still the game's) is false
  for a socket `disconnect()` let go (it nulls `this.socket` before the browser fires the close),
  and a handed-off or redirected socket is detached before it is closed, so its close reaches no
  handler. A `4001` with a renewer goes to `recoverAuth`, without one to `authFailed`. A socket a
  redirect opened that closes before opening takes `closedUnopened` (one more try at the default
  address, FS-MCYWK R18). Everything else falls through to `setConnectionStatus("disconnected")`:
  that fall-through is the unexpected close.
- **A close while a run or hub handoff is pending** is the old socket dying with the move still
  open: the move may yet land (`promote`), and if it fails `reconnectIfGone` opens a socket to the
  old server, whose own close is then the unexpected one. So a close with a handoff pending raises
  nothing; the handoff decides.
- **The menu does not reconnect today.** `BootScene` connects once per page. `MainMenuScene` only
  shows the status: with the socket down its primary button reads "LOST", disabled, for good. Only
  `BarrowspireScene.connectToServer` calls `reconnect()`. So "the menu's existing flow reconnects"
  is false and is fixed here (charter: fix within the client): the menu reconnects when it comes up
  with the socket down, and while the socket stays down its primary button offers a reconnect, so
  a server still restarting does not strand the player on a dead button.
- **A pinned address that is gone.** After a handoff `serverAddr` is the run's host (FS-K2HKP R29).
  A rollout that killed that pod leaves the menu reconnecting to a dead address for ever (FS-MCYWK
  "a later reconnect to a holding pod that has since died … not changed here"). The menu's
  reconnect therefore tries the pinned address and, if that socket closes without ever opening,
  once at the default address (as FS-MCYWK R18 does for a redirect). The default's landing pod then
  redirects to a live holding pod if one still holds the player (FS-MCYWK R5).
- **A normal close from the client ends the player's stay at once** on game-service
  (`handleReadError`: `CloseNormalClosure` → `cleanUpClient`, no grace). So "Return to menu" must
  never call `disconnect()` on a live socket: it would throw away the run the server holds. After a
  loss the socket is already gone; the button closes nothing.
- **Leftover state.** `handoffSessionId` (the last run handed off to) stays after a loss and would
  make a later handoff to that run be ignored; a loss forgets it.
- **Input.** Phaser's `Systems.canInput()` is false for a paused scene, so pausing every world
  scene under the notice stops its keys, clicks and wheel, and its update (the world freezes
  under the dim; the socket is dead anyway). A paused scene still renders. The chat input and the
  party invite field are real DOM fields in Phaser's DOM container, above the canvas: the notice
  hides that container and blurs any focused field while it is up, and gives it back after.
- **Where it lives.** A world switch replaces only `WORLD_SCENES`, so a scene of its own, last in
  the game's scene list (drawn over everything), survives scene changes; while up it pauses any
  world scene that comes up under it. The watch on the socket is bound per game (the game bridge,
  `PhaserGame`), so a close after leaving /game reaches no notice.
- `bootGate.inFlight` counts INIT..RUNNING, not PAUSED, so `switchWorld` would not stop a paused
  world scene: the button's route stops the paused ones itself.

### Edge cases raised

- Two tabs: the server supersedes the older socket (closed without a close frame, `1006`), so the
  older tab gets the notice. Acceptable: it was taken over; pressing the button takes it back.
- A close while the menu or character creation is up: no notice (not playing); the menu's own
  status shows the loss and offers the reconnect.
- The server still down when the button is pressed: the menu's reconnect fails, the menu shows the
  loss and its reconnect button.
- The server restarted (nothing held): the menu connects fresh; "ENTER THE TOWN" as on any visit.
- A grace that ran out (30 s, 10 s for a going-away close) before the button is pressed: fresh, as
  above.
- A dropped field visit waits out the grace in the town (server, FS-X2F2H R17): the menu's
  reconnect lands in the town.

### Rejected

- A DOM (React) overlay: the charter wants the in-game panel look, which is canvas chrome; and a
  DOM overlay would not stop Phaser's window key listener.
- Calling `disconnect()` on the button: ends the server-side stay (above).
- Retrying silently before showing the notice: the charter's "no silent auto-retry first".

### Open questions

None the charter left open. The menu's reconnect button and the default-address fallback are the
"fix within the client" the charter allows; they are reported to the owner as decisions taken.
