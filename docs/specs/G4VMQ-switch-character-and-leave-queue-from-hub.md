# FS-G4VMQ: Switch character and leave the queue from the hub

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Hub" (switch character from the hub · leave the queue from the hub) → this FS · Related ADRs: [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (one connection across worlds), [ADR-0004](../adr/0004-game-traffic-bypasses-the-application-gateway.md) (game-service owns the WebSocket contract; nothing on it changes here), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (the hub menu is canvas chrome on the game palette) · Builds on: [FS-29KSH](29KSH-hub-world-and-delve-entry.md) R8 (hub never persists position), R36 (one place switches scenes), [FS-BDA7X](BDA7X-character-leveling.md) R5/R7 (`enter_hub` carries `characterId`; the server re-seats a hub member who enters as another character), R41 (an `enter_hub` refusal shows on the main menu), [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) R7 (`leave_queue` removes the entry and replies after removal), R7a (`enter_hub` as another character is refused while queued), R25 (seat release), [FS-QPDKN](QPDKN-resolved-delver-spectate-and-leave.md) (precedent: the body stays in a world the client has left the view of) · Closes the gap recorded in I-29KSH-6 (a queued hub delver could not cancel) · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (no new terms; "hub" stays an engineering word per its § Open) · Charter: approved 2026-10-28; decisions marked **[charter default]** were taken by the charter with the reason given, **[user]** by the delver

## Summary

A delver standing in the hub today has no way back to the main menu: the hub's only ESC
binding dismisses NPC dialogue, so changing to another character means a page refresh. A delver
who has queued for a delve cannot cancel either; the hub never sends `leave_queue`. This feature
adds a small ESC menu to the hub with two ways out, *Change who you are* (back to the existing
main menu, whose roster and DELVE button already re-enter the hub as the chosen character) and,
while queued, *Leave the queue*, plus a *Leave* button on the queue panel itself for the delver
who does not want to open a menu. The server already supports all of it; nothing on the wire
changes.

**Lane:** agent lane, game-client only. No server change, no new WebSocket message.

## Requirements

### The hub menu (ESC)

1. **ESC opens the hub menu.** Pressing ESC in `HubScene` while no NPC dialogue is open shows a
   small menu overlay. **[charter default]** Reason: the delver asked for ESC, and the run already
   uses ESC as its way out.
2. **Dialogue keeps ESC.** While an NPC dialogue is open, ESC dismisses the dialogue as today
   (the existing `dismissKey` path in `offerConversation`) and does not open the menu. The menu
   opens only when no dialogue is open. **[charter default]** Reason: the hub's existing ESC
   binding must keep working.
3. **The menu has two choices, three while queued.** *Change who you are* (R6), *Back* (closes
   the menu), and, only while the client is queued (R11), *Leave the queue* (R12). Pressing ESC
   again while the menu is open closes it, as *Back* does. **[user]** for the queue choice;
   **[charter default]** for the other two and the copy register.
4. **The menu is chrome, not a world object.** A small dark vellum panel with a 1px brass
   hairline; choices in amber (actionable), *Back* in the cancel register; copy terse and grim;
   drawn camera-fixed in the popup depth band (2000, with the NPC dialogue), above the HUD band
   (1000, the queue panel). Per `game-client/docs/design-guideline.md` Part I and
   `game-client/CONTEXT.md`. The menu never names the hub ("hub" has no lore name; the copy says
   "who you are", not where). **[charter default]**
5. **The menu does not pause the world.** State keeps arriving and rendering behind it; the
   delver's body stays where it is. Movement keys are not sent while the menu is open (the menu
   owns the keyboard the way the dialogue does). **[charter default]** Reason: one keyboard owner
   at a time, as the dialogue already does.

### Changing character

6. **Change who you are returns to the main menu.** It calls `scene.start("MainMenuScene")`
   from the hub, exactly as the run's ESC does; `HubScene` shuts down and its `release()` runs.
   No message is sent. **[charter default]** Reason: the pick screen is the existing
   `MainMenuScene` (roster + DELVE); no new screen.
7. **Picking and entering is the existing flow, unchanged.** On the main menu the delver picks a
   character (the roster's existing `activate`, which persists `activeCharacterId`) and presses
   DELVE, which sends `enter_hub(characterId)`. The server answers `world_entered(hub)` and
   `PhaserGame.tsx`'s handler stops `MainMenuScene` and starts `HubScene`, as on every entry.
   `MainMenuScene`'s roster and DELVE logic are not changed by this feature. **[charter default]**
   Reason: one path for entering the hub.
8. **Another character: the server re-seats.** `Session.Admit` removes the old body and places
   the new one at the hub spawn (FS-BDA7X R5/R7). The client does nothing special. After a
   switch the delver stands at the spawn, never where they left (FS-29KSH R8). **[charter default]**
9. **The same character: nothing special.** The server answers `world_entered` as it is; the
   client re-enters `HubScene` by the same handler and the delver stands at the spawn. The client
   sends nothing beyond the ordinary `enter_hub`. **[charter default]** Reason: one path.
10. **Queued is not blocked on the client.** A queued delver may go to the main menu. Entering as
    another character is refused by the server (FS-K2HKP R7a, "Leave the queue before changing
    character.") and the refusal shows on the main menu (FS-BDA7X R41, already built). Entering
    as the same character is accepted and returns the delver to the hub still queued; the queue
    panel reappears on the next `queue_status`. **[charter default]** Reason: server state is the
    truth; the client does not second-guess it.

### Leaving the queue

11. **The client knows it is queued by a flag on `HubScene`.** `queued` is set when `find_game`'s
    success reply arrives (the `joinQueue` path) or when any `queue_status` arrives (it only ever
    reaches queued players), and cleared on a `leave_queue` success reply, on "The delve could
    not be joined." (`world_handoff_failed`: the seat is released, FS-K2HKP R25, and the entry is
    gone), and on scene shutdown. No new message carries it. **[charter default]** Reason: no new
    wire surface.
12. **Leave the queue sends `leave_queue` once.** The ESC menu's *Leave the queue* and the queue
    panel's *Leave* button (R15) both call one `HubScene.leaveQueue()`, which sends `leave_queue`
    (no payload) and sets one pending flag; while pending, both entry points are disabled and a
    second press sends nothing. **[user]** that both exist; **[charter default]** that they share
    one path, one pending flag and one reply handling. Reason: one truth, no duplicated send or
    reply logic.
13. **The success reply is the truth.** On a non-error reply on the `leave_queue` action: the
    queue panel and its *Leave* button come down, `queued` and the pending flag clear, the
    *Leave the queue* choice disappears, and the menu closes if it was open. **[charter default]**
    Reason: FS-K2HKP R7 replies only after removal, so the reply is the fact.
14. **The error reply keeps everything.** On an error reply on `leave_queue` (the server's
    "Could not leave the queue, please try again."), the server's message is shown as a passing
    notice in the hub (neutral HUD register, vellum), the panel stays, `queued` stays, the pending
    flag clears so the delver can try again, and the choice and button stay. **[charter default]**
15. **A Leave button on the queue panel.** While queued, a small amber button labelled *Leave*
    sits immediately to the right of the queue progress panel (`queuePanel`, bottom-left at
    x 24, y height-44), the same height as the panel, in the HUD depth band (1000). It appears
    with the panel (first `queue_status` or `find_game` success) and goes down with it
    (`leave_queue` success, `world_handoff_failed`, scene shutdown). It does exactly what the menu
    choice does (R12). **[user]**
16. **The button yields to the handoff.** While the panel shows "Joining the delve…"
    (`world_handoff` received: the delver is being moved and leaving is too late) the button is
    hidden or disabled. After "The delve could not be joined." the delver is no longer queued
    (R11) and the button is down. **[charter default]**
17. **Reply routing uses the per-action listeners.** `SocketManager.dispatch` routes a message
    with top-level `error` to the `onError(action, cb)` listener for that action if registered,
    else to the global handler; a plain reply goes to `on(action, cb)`. `HubScene` registers
    `socketManager.onError("leave_queue", …)` and `socketManager.on("leave_queue", …)` on create
    and removes both (`offError`, `off`) in `release()`. **[charter default]**
18. **Type-only additions.** `ActionType` gains `LeaveQueue: "leave_queue"` and `ActionMap` gains
    `leave_queue: Record<string, never>` in `src/assets/types/client.ts`. `MainMenuScene.ts`'s
    existing `sendMessage("leave_queue" as any, {})` may switch to the constant; its behaviour
    does not change. **[charter default]**

### Restart hygiene

19. **Everything this feature adds is torn down in `release()`.** The ESC key, the menu
    overlay, the queue-panel button, the `leave_queue` listeners, the `queued` and pending flags.
    `HubScene` is restarted on every `world_entered(hub)`, and the pattern is commit 0a35e36's
    `queuePanel` fix: a reference from an earlier visit is forgotten on shutdown and only reused
    while `.active`. **[charter default]**
20. **Keyboard captures.** ESC is already captured by `dismissKey` (`keyboard.addKey(ESC)`); the
    menu reuses that key object rather than adding a second ESC binding, so there is one ESC
    reader in the hub, polled in `update` like the dialogue keys. No capture is left on the
    keyboard plugin that the main menu would inherit. **[charter default]**

### Bounds

21. **No server change, no new message.** Enter is `enter_hub` / `world_entered`; leave is
    `leave_queue` and its existing reply. The body stays in the hub while the delver is on the
    main menu, visible to others, because there is no `leave_hub` message and adding one is out
    of bounds (the same accepted consequence as FS-QPDKN's result-card hold). **[user]**
22. **No confirmation step** on either choice. **[charter default]** Reason: nothing is lost by
    either action; the queue can be rejoined and the character re-entered.

### Amendment 2026-10-29: leaving for the roster leaves the hub

R21's accepted consequence was played and rejected by the user: a refresh while on the
roster put the delver straight back in the hub, and their body stood there for everyone
meanwhile. *Change who you are* now leaves the hub. R21 and the `leave_hub` line in Out of
Scope are superseded by the following.

23. **A new inbound action `leave_hub`** (no payload), routed on the sender's record. Accepted
    from a member whose record names the hub and who is not queued: their body is removed from
    the hub and their record names no world (the record itself, with its token and character,
    stays). The reply is `world_left` (no payload). A later `enter_hub` seats them again through
    `Admit`, cap and all.
24. **Refused** with an error on the `leave_hub` action and nothing changed: queued → "Leave the
    queue first." (as FS-K2HKP R7a); record names a run → "You are in a delve."; record names no
    world → "You are not in the hub."
25. **The client sends `leave_hub` on *Change who you are*** and switches to `MainMenuScene` on
    `world_left`; a second press before the reply sends nothing. On an error reply it stays in
    the hub and shows the message as a passing notice (the ESC menu's *Leave the queue* is the
    way out of the queued case).
26. **A refresh while on the roster lands on the roster.** A reconnect of a member in no world
    is announced nothing (today's `announceCurrentWorld` already does this) and the client
    boots to the main menu.
27. **The hub slot is freed** by leaving; re-entry may be refused by the cap like any entry
    (FS-29KSH), and the refusal shows on the main menu (FS-BDA7X R41).
28. A member who disconnects while in no world is cleaned up at grace end as today (nothing to
    remove from any world).

## User Stories

1. As a delver in the hub, I want ESC to open a small menu, so that I have a way out without a
   page refresh.
2. As a delver talking to an NPC, I want ESC to still dismiss the dialogue, so that the key I
   learned keeps working.
3. As a delver with the menu open, I want ESC or *Back* to close it, so that I can return to the
   hub without touching the mouse.
4. As a delver, I want *Change who you are* to take me to the main menu I already know, so that I
   pick from the roster I already use.
5. As a delver on the main menu after leaving the hub, I want DELVE to put me back in the hub as
   the character I picked, so that switching is the same gesture as entering.
6. As a delver who picks another character, I want to stand at the hub spawn as that character,
   so that I know the switch took.
7. As a delver who picks the same character again, I want to be back in the hub with nothing
   odd happening, so that changing my mind costs nothing.
8. As a queued delver who goes to the main menu and picks another character, I want to be told
   to leave the queue first, so that I understand why I was refused.
9. As a queued delver who goes to the main menu and picks the same character, I want to find
   myself back in the hub still queued, so that looking at the roster does not lose my place.
10. As a delver, I want no confirmation prompt on either choice, so that the menu is two presses
    at most.
11. As a queued delver, I want *Leave the queue* in the ESC menu, so that I can cancel without
    hunting for a button.
12. As a queued delver, I want a *Leave* button next to the queue panel, so that I can cancel
    without opening a menu.
13. As a queued delver who pressed *Leave*, I want the panel to vanish only when the server says I
    am out, so that I never think I left when I did not.
14. As a queued delver whose leave failed, I want to see the server's message and keep the panel,
    so that I know to try again.
15. As a queued delver who pressed *Leave* twice, I want only one request sent, so that the
    server is not asked twice for the same thing.
16. As a delver who left the queue, I want to change character right away, so that leaving the
    queue is the path to switching while queued.
17. As a delver being moved to a delve ("Joining the delve…"), I want the leave button gone, so
    that I am not offered something that is already too late.
18. As a delver whose delve could not be joined, I want the panel and the button down, so that
    the hub does not claim I am still queued.
19. As a delver whose match is found while the menu is open, I want the delve to start, so that
    an open menu never costs me a seat.
20. As a delver in the loadout screen, I want its own back control unchanged, so that nothing
    about the loadout moves.
21. As another delver in the hub, I want a delver who went to the main menu to stay visible until
    they re-enter, so that the hub does not flicker bodies (accepted consequence).
22. As a delver re-entering the hub many times in one session, I want no leftover menu, panel,
    button or listener from an earlier visit, so that the hub behaves the same every time.
23. As a maintainer, I want one `leaveQueue()` path behind both entry points, so that a fix to
    the send or the reply lands once.
24. As a maintainer, I want `leave_queue` in `ActionType` and `ActionMap`, so that the cast in
    `MainMenuScene` can go.

## Acceptance Criteria

**Hub menu**

- [ ] In `HubScene` with no dialogue open, ESC shows the menu with *Change who you are* and
      *Back*; with the client queued, *Leave the queue* is shown too.
- [ ] With an NPC dialogue open, ESC dismisses the dialogue and no menu appears.
- [ ] ESC with the menu open closes it; *Back* closes it.
- [ ] With the menu open, no `move` message is sent for WASD.
- [ ] The menu is camera-fixed at depth 2000, dark vellum with a brass hairline, choices amber,
      drawn from `BARROW_HEX` tokens only (the token fence passes).

**Changing character**

- [ ] *Change who you are* starts `MainMenuScene` and stops `HubScene`; nothing is sent.
- [ ] From the main menu, DELVE sends `enter_hub` with the picked `characterId` as today, and a
      `world_entered(hub)` starts `HubScene` (no change to `MainMenuScene`'s roster or DELVE
      code).
- [ ] A refused `enter_hub` while queued shows its reason on the main menu (existing R41 path;
      verified, not rebuilt).

**Leaving the queue**

- [ ] `queued` becomes true on a `find_game` success reply and on any `queue_status`; it is
      false after a `leave_queue` success, after `world_handoff_failed`, and on shutdown.
- [ ] *Leave the queue* (menu) and *Leave* (panel) each send exactly one `leave_queue` with no
      payload; a second press on either before the reply sends nothing.
- [ ] On a `leave_queue` success reply: the panel and button are gone, `queued` is false, the
      menu (if open) is closed.
- [ ] On a `leave_queue` error reply: the server's message is shown as a passing hub notice, the
      panel and button stay, another press sends again.
- [ ] The *Leave* button is at the panel's right, same height, amber, depth 1000; it appears with
      the panel and is absent when not queued.
- [ ] While the panel shows "Joining the delve…" the button is not pressable; after "The delve
      could not be joined." it is gone.
- [ ] `ActionType.LeaveQueue` and `ActionMap.leave_queue` exist; `MainMenuScene` compiles without
      the `as any`.

**Restart hygiene**

- [ ] After a `HubScene` shutdown and restart: no `leave_queue` listener from the earlier visit
      is registered, no menu or button from the earlier visit is referenced, and `queued` starts
      false.
- [ ] Unit tests cover: ESC opens/closes, ESC with dialogue open, queued choice visibility, one
      send under double press, success and error reply handling, button lifecycle with the panel,
      teardown clears listeners and flags.
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint` pass.

## Edge States

**Menu**
- ESC while the queue panel is up: the menu opens with the third choice. Leaving to the main menu
  keeps the queue entry (R10).
- ESC in `LoadoutScene`: not this feature. The loadout is its own scene, `HubScene` is stopped
  while it is open, so no hub menu exists there; the loadout's own back control returns to the
  hub, unchanged.
- `world_entered` arriving while the menu is open (a match found while queued, or a reconnect
  announce): `PhaserGame` switches scenes as always; the overlay goes with `HubScene`'s shutdown
  (R19). The menu never holds a `world_entered`.
- `queue_status` arriving while the menu is open: the panel updates behind the menu; the choice
  is already shown.
- Menu open and the delver walks into NPC range: nothing; the menu owns the keyboard (R5).
- Interact key (E) while the menu is open: ignored; no dialogue opens over the menu.

**Changing character**
- Main menu reached from the hub, then the browser tab is refreshed: the server announces the
  world on socket open and the boot-chain hold in `PhaserGame` applies; the delver lands back in
  the hub as the character the server holds. Unchanged behaviour.
- `enter_hub` refused for any other reason (character not owned, level data missing): shown on
  the main menu by the existing R41 path.
- The main menu's own queue popup (the pre-hub `GATHERING THE DELVE` panel): not reached from
  this flow; the hub queues through the NPC, and the main menu only ever enters the hub.

**Leaving the queue**
- *Leave* pressed, match found before the reply: `world_entered(run)` or `world_handoff` wins.
  On `world_entered` the scene stops and the late reply is dropped with its listeners. On
  `world_handoff` the panel shows "Joining the delve…" and the button yields (R16); a late
  success reply would clear `queued` on a scene that is being left; harmless.
- *Leave* pressed, `world_handoff_failed` arrives before the reply: `queued` clears, the panel
  shows the failure text, the button is gone; a late reply changes nothing visible.
- Error reply, then the delver presses again: a fresh send (R14).
- Leave the queue, then *Change who you are*, then another character: accepted by the server
  (R7a satisfied).
- Leave the queue from the ESC menu, then press ESC: the menu is already closed by the success
  reply (R13); ESC opens a fresh menu with two choices.
- A `leave_queue` reply arriving with no listener (the scene restarted meanwhile): routed to the
  global error handler or dropped; no visible effect.
- Reconnect while queued: the server removes a disconnected player from the queue
  (FS-K2HKP R8); the rebuilt `HubScene` starts with `queued` false and no panel. Unchanged.

**Restart hygiene**
- Two visits in one page lifetime, menu opened in the first: the second visit's ESC opens a
  fresh menu; the first's overlay was destroyed with its scene and its reference forgotten.
- Page unmount while the menu is open: `DESTROY` runs `release()` (already wired alongside
  `SHUTDOWN`).

## WebSocket message surface

No HTTP endpoints change. No WebSocket message is added or changed (ADR-0004: game-service owns
the contract; nothing here touches it). The client gains type entries only (R18).

**Inbound (client → server)**

| Action | Payload | Notes |
|---|---|---|
| `enter_hub` | `{characterId}` | unchanged; sent by `MainMenuScene`'s DELVE as today |
| `leave_queue` | none | unchanged; now also sent by `HubScene.leaveQueue()` (previously only by the main menu's pre-hub popup) |

**Outbound (server → client)**

| Message | Change |
|---|---|
| `world_entered` | unchanged |
| `leave_queue` (reply) | unchanged; success `{message}`, or `{message}` with top-level `error` set (FS-K2HKP R7) |
| `queue_status` | unchanged; now also sets `queued` on the client |

## Out of Scope

- **A new character-pick scene.** The main menu is the pick screen.
- **Creating or deleting characters in the hub.** Both stay on the main menu / creation scene.
- **A new server NPC** for leaving the queue or switching.
- ~~A `leave_hub` message~~ — superseded by the 2026-10-29 amendment (R23–R28).
- **Changing the run's ESC** (`BarrowspireScene`'s `keydown-ESC → MainMenuScene`).
- **Changing `MainMenuScene`'s roster, `activate`, or DELVE logic.**
- **Any server change**, including the `leave_queue` retry policy or its reply copy.
- **A lore name for the hub** (CONTEXT.md § Open; deliberately unresolved).
- **Blocking the switch client-side while queued.** The server refuses it, and the main menu
  shows why.
- **A confirmation step** on either action.

## Change: The ESC menu in a field world
Status: work-order
Date: 2026-11-12

Added to the charter "右下角圖示與面板操作" by the owner, 2026-11-12, before any slice was built:
"目前野外按esc沒反應 野外按esc跟村莊一樣行為" (in a field Esc does nothing today; Esc in a field should
behave as in the town). Made alongside [FS-3EBCA](3EBCA-hud-corner-icons.md), whose Menu icon
opens the menu in every world. The text above is not edited.

Amended the same day by the owner: "信箱似乎也會卡住其他面板 但信箱是全畫面 那設定成開信箱時其他視窗會被關閉 開其他視窗時信箱會被關閉 開menu時其他視窗也會關閉 然後menu開啟時其他都不能按" (opening the menu closes every window too, and
while the menu is open nothing else can be pressed): C4 edited in place and C6 added, for the
town's, the field's and the run's menu alike (FS-3EBCA R17, R18).

**Facts (verified 2026-11-12 on main 321d2b23).** A field binds `keydown-ESC` to hiding the gear
overlay and nothing else (`FieldScene.bindHudKeys`), so with nothing open Esc does nothing. The
server accepts `leave_hub` from a field: the visit settles, the body goes, the record names no
world, and it answers `world_left` (FS-X2F2H R18, `Server.LeaveHub` → `leaveFieldForRoster`). A
run's Esc already closes the gear overlay, then opens or closes the run's menu (FS-9K8EZ,
FS-HRH2J R5); it is not changed here beyond FS-R82NV § Change C2's party panel step.

### Requirements

C1. **Esc in a field does what it does in the town.** One press closes one thing: the gear
    overlay, then the party panel (FS-R82NV § Change C2); with neither open it opens the ESC
    menu, and with the menu open it closes it, as *Back* does. **(owner: "野外按esc跟村莊一樣行為")**
C2. **The field's menu is the town's**: the same chrome and place (R4, centred in the popup band),
    the same choices by the same rule (`hubMenuChoices`): *Change character* and *Back [Esc]*, and
    *Leave the queue* only while queued (a field player is never queued: FS-X2F2H R20, so in
    practice it never shows). Enter is the first choice and a number picks that choice, as in the
    town. **(derived here: "the same as the town" read as the same menu, not a new one)**
C3. ***Change character* leaves the field for the roster** exactly as from the town (R25): one
    `leave_hub`, nothing more until it is answered; `world_left` switches to `MainMenuScene`; an
    error reply keeps the player in the field with the message as a passing notice and the choice
    usable again. The server already takes it from a field (FS-X2F2H R18): no server change.
C4. **The menu owns the keys and the screen while open** (R5): movement is not sent, and I, B,
    C, T, E, F, Q and M, a press in the world (attack, cast, Shadow Shot hold), the chat input
    (no focus, its row hidden), the party panel, the corner row (Menu included: the menu's ×,
    Back and Esc close it), the envelope, the map mode icon and every button drawn under the menu
    open or do nothing; a blocker over the whole view, under the menu's rows, takes every press
    and hover. In the town, a field and a run alike. The world runs on behind it. **(R5, applied
    to the field; the screen, owner 2026-11-12: "menu開啟時其他都不能按", FS-3EBCA R18)**
C5. **It follows the view**: an open menu is re-centred when the view's size changes
    (FS-ZAJMH R13), as the town's is.
C6. **It opens over no window.** Opening the menu, in the town, a field or a run, first closes
    every window: the inventory and the character panel (the stash with them), the party panel
    and, in the town, the letter panel. Esc still closes the topmost window first and opens the
    menu only with none open (C1); the corner row's Menu icon opens it at once, closing them
    (FS-3EBCA R6, R17). **(owner, 2026-11-12: "開menu時其他視窗也會關閉")**

### Acceptance Criteria

- [ ] In a field with nothing open, Esc opens the menu with *Change character* and *Back [Esc]*; Esc again, or *Back*, closes it.
- [ ] With the gear overlay open, the first Esc closes it and does not open the menu; with the party panel open, the first Esc closes it.
- [ ] *Change character* sends one `leave_hub`; a second press before the answer sends nothing; `world_left` starts `MainMenuScene`; an error reply shows its message and leaves the player in the field.
- [ ] While the menu is open no `move` is sent, I, B, C, T and the corner icons (Menu included) open nothing, the chat input takes no focus, and a press in the world sends no attack or cast.
- [ ] The Menu icon opens the menu with the inventory, the character panel or the party panel open, closing them; no window is open while the menu is.
- [ ] The run's Esc is unchanged apart from the party panel step.

### Edge States

- **Fallen in a field** (FS-X2F2H's fallen card): Esc still opens the menu; *Change character*
  leaves as from anywhere in the field (the server settles the visit).
- **`world_left` with no leave pending** (another tab): ignored, as in the town.
- **A dialogue in a field:** fields have no NPC dialogue today; nothing to order.
- **Leaving the field** for the town with the menu open: the menu goes with the scene.

### Out of Scope

- A settings panel, or any new menu choice.
- The run's menu (FS-9K8EZ), beyond the party panel step.
- Any server change.

## Change: The menu wears the party panel's frame
Status: work-order
Date: 2026-11-12

The owner, 2026-11-12: "menu跟道具欄跟角色欄的ui調整成跟party一樣外框" (the menu, the inventory and the
character panel take the party panel's outer frame). The menu's chrome (`showMenuPanel`) draws the
town's and the field's ESC menu, the run's ESC menu and its Fall confirm (FS-9K8EZ), so all four
change together; the inventory and the character panel are FS-HRH2J § Change: Character and
inventory apart C16. Recorded without adversarial review.

### Requirements

C1. **The frame.** The menu panel is drawn by the party panel's own frame drawing, not a copy: its
    carved ground, double brass rule and corner studs in place of R4's charcoal box with a brass
    hairline. **(owner, above)**
C2. **The ×.** An × stands at the menu's top right in the party panel's look and place (22 px,
    `palette.interactable`, brighter under the pointer, a hand cursor, a 24 × 24 box 12 px in
    from the top and right edges). A press on it does what Esc does with the menu open: the
    cancel row's action (Back, or the Fall confirm's way back), or closing the menu. **(owner:
    "跟party一樣外框", the party panel's frame carrying its ×)**
C3. **Inside unchanged.** The rows, the copy line, the keys, the width, the height and the place
    in the popup band are as before. **(owner, as relayed: contents and layout stay)** Amended the
    same day by the owner, "menu目前沒標題也加上" (the menu has no title; give it one): the menu and the
    Fall confirm take the title MENU in the shared title band, their rows and copy line moved down
    by the band and the box taller by as much (FS-3EBCA R20–R23).

### Acceptance Criteria

- [ ] The town's, the field's and the run's ESC menus and the Fall confirm are drawn by the party panel's frame drawing, with an × at the top right.
- [ ] A press on the × closes the menu as Esc does; the rows, keys and place are unchanged.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .` and `npm run lint` pass.

### Out of Scope

- The NPC dialogue's card (already the carved panel), the letter panel, the chat window.
