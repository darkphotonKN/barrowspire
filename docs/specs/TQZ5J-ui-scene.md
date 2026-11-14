# FS-TQZ5J: The UI scene over every world (phase 1)

> Status: work-order · SPECIFICATION.md: none (pure architecture, see "No thin line") · Related ADRs: [ADR-0081](../adr/0081-the-interface-is-one-ui-scene-over-every-world-talking-to-the-worlds-through-a-typed-interface.md) (the decision), [ADR-0057](../adr/0057-the-client-runs-phaser-4-pixel-rounding-by-vertex-round-mode-masks-by-the-mask-filter.md) (Phaser 4, render scale) · Builds on: [FS-R6EYZ](R6EYZ-disconnect-notice.md) R11 (a scene drawn over every world), [FS-ZAJMH](ZAJMH-hd-canvas-and-fullscreen.md) (the viewport and render scale) · Moves, unchanged: [FS-3EBCA](3EBCA-hud-corner-icons.md) (the corner row), [FS-G4VMQ](G4VMQ-switch-character-and-leave-queue-from-hub.md) and [FS-9K8EZ](9K8EZ-die-by-choice.md) (the ESC menus), [FS-28DDG](28DDG-music-in-the-hub.md) § Change (OPTIONS), [FS-T3DWX](T3DWX-fullscreen-in-the-options-panel.md) (its Fullscreen row), [FS-WDM0X](WDM0X-interface-sound-effects.md) (the interface sounds)

Promoted 2026-11-14 from the same day's draft, under the owner's approved charter (2026-11-13/14):
「把ui介面獨立成一個scene 當模組 之後就不用每張地圖都要寫一次」 (make the UI its own scene, a
module, so it need not be written again for every map) and 「就照你說的分階段進行」 (go in the
phases you proposed). The charter came with defaults P1–P9 already answered; they are marked
**[charter]**. What the code forces (read on main 6328e797) is marked **[code]**; what the spike
showed (§ Spike findings) is marked **[spike]**. Recorded without adversarial review: no
`challenge-me` pass was run.

**Lane.** game-client only (the agent lane). No server, proto, gateway or manifest change.
**[charter]**

**No behaviour or look change.** This is a move. Every acceptance criterion of the features it
moves still holds, word for word. A player sees, hears and presses exactly what they do today.
**[charter]**

**No thin line.** The README's survival test asks whether a line names something the system
*does*. A player cannot do anything new here, and no owning feature's acceptance criteria change,
so this is neither a new capability nor a behaviour change (no `## Change:` stub on the owners).
It is a structural decision about where the interface lives: that *holds*, so it is ADR-0081, and
this FS is its work order. **[charter: "it may be pure architecture"]**

**Words.** A **world scene** is one of `HubScene`, `FieldScene`, `BarrowspireScene` (town, field,
run). The **UI scene** is the one scene drawn over them that holds the interface (game-client
`CONTEXT.md`). The **interface** (`UiBridge` below; the name is the slice's to settle) is the typed
channel between them.

## Summary

Today each world scene builds its own interface: the corner row, the ESC menu and OPTIONS, the
interface sounds, the gear overlay, the party panel, the minimap, the mailbox and the run's HUD.
Every new world repeats the wiring. This FS introduces one **UI scene**, drawn over every world,
alive from the first world entry to the end of the game, that talks to the world scenes only
through a typed interface. Phase 1 builds that scene and moves three pieces into it: the corner
row, the ESC menu with OPTIONS, and the interface sounds. Later phases move the rest, one group at a
time.

## Phases

| Phase | Moves into the UI scene | Here |
|---|---|---|
| 1 | the shell and the interface; the corner row; the ESC menu + OPTIONS and the key split; the interface sounds | **this FS** |
| 2 | the gear overlay (inventory, character panel), and its keys I, B, C | later |
| 3 | the party panel, and T | later |
| 4 | the minimap, and M | later |
| 5 | the mailbox | later |
| 6 | the ability card, potions, target frame, settlement record | later |
| 7 | chat | later |

Each phase is merged before the next starts. **[charter P1]** Later phases are each a
`## Change:` section appended here when they are scoped.

## Requirements

### A. The UI scene

1. **One scene.** `UIScene` (key `"UIScene"`) is registered in the game's scene list after every
   world scene and before `DisconnectNoticeScene`: drawn over every world, under the disconnect
   notice. **[charter P4; code: Phaser draws and hands input in list order]**
2. **Launched once.** It is launched the first time a world scene comes up, and from then on is
   never restarted by a world switch: a switch replaces the world scene under it and leaves it
   standing. **[charter P2]**
3. **Shown only with a world.** It is shown while a world scene is starting or running, and hidden
   otherwise: in the main menu, character creation, boot and preload. Hidden means asleep: not
   drawn, not updated, no pointer input and no keys (Phaser's `sleep`). What wakes and sleeps it is
   the world's own report (R9): a world announces itself as it comes up and its end as it shuts
   down, because not every way to the main menu runs through `switchWorld` (Change character starts
   it from inside the hub, and so does Return to menu). **[charter P2; code]**
4. **Ends with the game.** It is destroyed with the game, and the interface with it (R8). Leaving
   /game leaves nothing listening. **[charter P2]**
5. **Held under the disconnect notice.** While the notice is up the UI scene is paused with the
   worlds (`holdWorlds`), so no key reaches it (Esc would otherwise open the menu under the
   notice). Return to menu leaves it asleep (R3). **[code: FS-R6EYZ R10, R12]**
6. **Render scale.** It is fitted like every scene: `ViewportFit` fits its camera as it starts,
   `fitGame` re-fits it on a change, and its widgets relay out through `relayoutOn`. Its text is
   crispened at a new render scale like any running scene's. Nothing of its own is needed beyond
   being in the game's scene list. **[charter P6; spike (c)]**
7. **Mouse.** A press on any interactive object of the UI scene never reaches a world scene: not
   its objects, not its scene-wide `pointerdown`, `pointerup` or `wheel`. A press anywhere else
   reaches the world exactly as today. This rests on Phaser's `InputManager.globalTopOnly`, which
   stays at its default `true`; nothing turns it off. It works only with the UI scene above the
   worlds in the scene list (R1): registered below them, the world takes the panel's presses.
   **[charter P4; spike (a), (order)]**

### B. The interface

8. **One per game.** The game bridge (`PhaserGame.tsx`) makes one interface per game and lends it
   to the scenes through the game's registry, as it lends the frame's fullscreen (FS-T3DWX R12). It
   is let go with the game. Scenes reach it through one typed accessor. No scene imports another
   scene's class, reads another scene's fields or calls its methods; the UI scene and the world
   scenes know only the interface. **[charter P3]**
9. **World → UI: the world's report.** Each world scene reports, whole, on its `create` and again
   on every change of any part, synchronously:
   - **world**: `hub` | `field` | `run`; and on its shutdown, that it has left;
   - **player**: `resolved` (out of the delve: dead or escaped; the run's `menuState`), false
     elsewhere;
   - **menu facts**: what the world's menu rows read today: the town's `queued` and `leaving`
     (the Change-character press in flight), the run's `ended`, `leavePending` and `fallPending`;
   - **blockers**: `dialogue` (the town's NPC dialogue is open: it keeps the keys and the menu
     stays shut, FS-G4VMQ), and whether the world can take the OPTIONS panel now (the town's music
     is set, today's `if (!music) return`);
   - **windows**: which of the world's own windows are open: `letter`, `party`, `inventory`,
     `character`.
   **[charter P3; code]**
10. **UI → world: the UI's state.** The UI scene reports whether its menu slot is filled
    (`menuOpen`: the ESC menu, OPTIONS or the run's Fall confirm). Every world guard that reads its
    own `this.menu` today reads this instead: no attack or cast, no stride, no talk, no chat
    opening, no potion, no gear or party toggle while it is true, exactly as today. As it turns true
    the world closes its own windows (FS-3EBCA R17), stops a stride (FS-G4VMQ R5) and ends an aim
    (FS-JTNPR req 15). **[charter P3; code]**
11. **UI → world: requests.** The UI scene asks; the world does. Phase 1's requests:
    - `close`: `letter` | `party` | `gear` | `dialogue` (one Esc step, R17);
    - `toggle`: `inventory` | `character` | `party` (the corner row's icons);
    - `leaveQueue`, `changeCharacter` (the town's and the field's rows);
    - `leaveRun`, `fall` (the run's rows);
    - `musicLevel` with a level (the OPTIONS Music row, R19).
    A world ignores a request it has no answer for (a field asked to `leaveRun`). A request is
    answered synchronously: when the call returns, the world has acted and reported again. Socket
    messages stay the world's to send. **[charter P3; code: UiSounds reads before and after]**
12. **Player actions in the world.** A world input that can open or close a window (I, B, C, T,
    the mailbox's envelope, a window's ×) runs through the interface's `act`, a `UiActWrapper`
    (`src/audio/uiSounds.ts`): the interface reports the world's windows before and after, once,
    so the UI scene's sounds play the rule for the whole action (R22). The world modules handed a
    wrapper today (`GearOverlay`, `PartyPanel`) are handed this one. **[code: FS-WDM0X S9]**

### C. The corner row

13. **Built by the UI scene.** The corner row is built once per world by the UI scene, from the
    world in the report: in the town Menu, Inventory, Character and Party, its Mailbox slot left to
    the town's own envelope (`MailboxEnvelope`, still the hub scene's until phase 5); in a field and
    the run the same four and the greyed Mailbox. It is rebuilt when the world changes, and is
    where, and as, it is today: same frames, knockouts, labels, hover, greying. **[charter P1; code]**
14. **Its presses.** Menu is the UI scene's own (R16). Inventory, Character and Party send
    `toggle`. The refusals stand as today, now read from the report and the UI's state: the run's
    Inventory and Character do nothing while the menu is open; Party does nothing while a dialogue
    or the menu is open. **[code: FS-3EBCA R6–R8, R18]**
15. **Its rect is not the world's.** A press on the row never reaches the world (R7), so the
    worlds stop testing `corner.covers` in their click paths (`panelTakes` and the town's
    equivalents). The map mode icon and every other world piece are no further from the row than
    today, so nothing else changes. **[spike (a)]**

### D. The ESC menu, OPTIONS and the key split

16. **Built by the UI scene.** The ESC menu, OPTIONS and the run's Fall confirm are built by the UI
    scene, in its one menu slot, from the report: the town's rows by `hubMenuChoices({ queued })`,
    the field's by `hubMenuChoices({ queued: false })`, the run's by `runMenuChoices({ resolved })`
    and `FALL_CONFIRM`; dimmed rows as today (Change character while `leaving`, Leave the barrow
    while `leavePending`, Fall now while `fallPending`). Same chrome, place, blocker (with the Menu
    icon let through, FS-3EBCA R18), relayout and tones. **[charter P1; code]**
17. **Esc is the UI scene's.** One Esc press is one step, decided by the UI scene from its own menu
    and the reported windows: an open dialogue is dismissed first (`close: dialogue`, today's
    "a dialogue keeps its own Esc"), then the letter panel, the open menu (its Back; OPTIONS's
    reopens the menu), the party panel, the gear overlay; with nothing open the menu opens, except
    once the run has ended (`escapeStep`, extended with the dialogue on top). **[charter P5; code:
    FS-R82NV § Change C2, FS-HRH2J R5, FS-1GZGD R40]**
18. **The menu's keys.** While the menu slot is filled, Enter is its first row, 1–3 a row, and ←/→
    nudge the OPTIONS slider; all are the UI scene's then. While it is empty, the UI scene does not
    act on them and they reach the world as today (1 drinks a potion in the run, Enter opens chat,
    E, Enter and 1–3 answer the town's dialogue). **[charter P5; code]**
19. **OPTIONS's rows.** Music is the stored level (`storedMusicLevel`) and each change also sends
    `musicLevel`, which the world playing music (the town today) applies at once, as the live
    `HubMusic` control does today. Sound effects as today. Fullscreen through the game's lent
    fullscreen (`lentFullscreen(registry)`, FS-T3DWX R12). **[code]**
20. **The menu yields.** The UI scene closes its menu (no sound: not the player's) when the report
    says the player's rows would now be wrong (resolved changed, FS-9K8EZ req 6), when the run ends,
    when a dialogue opens, and when the world changes (a switch takes the old world's menu down
    today). **[code]**
21. **One owner per key.** A key is acted on by exactly one scene at any moment, and that is
    settled by who binds it and by reported state, never by event order:
    - **Keys the UI scene owns outright** (Esc in phase 1): no world scene binds them, by event or
      by `addKey`.
    - **Keys shared by state** (Enter, 1–3, ←/→): the UI scene acts only while its menu slot is
      filled, and the world's handlers stay guarded by `menuOpen` (R10), as they are by `this.menu`
      today.
    - **No `stopPropagation` on keys.** Neither the UI scene nor a world scene calls a keyboard
      event's `stopPropagation()` or `stopImmediatePropagation()` to settle ownership. Phaser hands a
      key to each scene in the order the scenes' keyboard plugins subscribed (the order they
      started), not in scene-list order, and a world switch restarts the world and moves it behind
      the UI scene: a stop from the UI scene would shield the world in some sessions and not in
      others. **[spike (b)]**
    - **Keyups always reach the world:** a key held as the menu opens (a stride) is still let go
      there. **[spike (b)]**
    - **The corner hotkeys move with their windows:** I, B and C with the gear overlay (phase 2), T
      with the party panel (phase 3), M with the minimap (phase 4). Until then they stay where they
      are. P5's end state (the UI scene owns every corner hotkey) is reached when the last of those
      phases lands. **[charter P5; spike (b)]**

### E. The interface sounds

22. **One player.** The UI scene holds the game's one `UiSounds`. Its window state is its own menu
    slot plus the report's windows. Its own inputs (Esc, the menu's rows, ×, the corner icons) run
    through its `act`, which spans the requests they send (R11 is synchronous), so a corner press
    that opens the inventory plays `inventory_open` once, and the menu opening over open windows
    plays only `settings_open` (S3). A world player action reported through R12 plays the rule for
    its before and after, once; one inside a UI `act` joins it. A change the world makes on its own
    (a server message closing a window) plays nothing, as today. **[charter P1; code: FS-WDM0X
    S3–S9]**

### F. Parity

23. **Before and after screenshots.** Each moving slice takes screenshots before (main) and after
    (the branch) of every piece it moves, in the town, a field and the run, at render scale 1, 1.5
    and 2, windowed and fullscreen: idle, hovered and (for the menu) open, OPTIONS open and the
    Fall confirm. They match pixel for pixel, or each difference is named and the owner accepts it
    in the look-and-feel check. **[charter P9]**
24. **The depth inversion is checked.** A scene above the world cannot interleave its depths with
    the world's: whatever in a world scene draws over a moved piece today will draw under it. The
    corner row is at depth 1000 and the menu at 2000; above them today stand the gear overlay
    (1100) and its tips (2200) and flash (2300), the party panel (1110), the run's controls panel
    (1200), its resolved card (1500), the settlement record (1600), the town's letter panel (1800)
    and notifications (2000). Each move slice names which of them can overlap the moved piece's
    rect and screenshots that case; an overlap that changes the picture goes to the owner before
    merge. **[code]**

## User Stories

1. As a player, I want the corner row, the ESC menu, OPTIONS and their sounds to look, sound and
   answer exactly as they do today in the town, a field and the run, so that the move is invisible
   to me.
2. As a player, I want a click on the corner row or the open menu never to swing my weapon or walk
   me, so that pressing the interface is safe.
3. As a player, I want a click beside the interface to reach the world as it does today, so that
   nothing about playing changes.
4. As a player, I want one Esc to close one thing, the dialogue, the letter, the menu, the party
   panel, the gear, in that order, and with nothing open to open the menu, so that Esc behaves as
   it always has.
5. As a player in the run, I want 1 to drink a potion when the menu is shut and to pick the first
   row when it is open, never both, so that one press does one thing.
6. As a player, I want Enter to open chat when the menu is shut and to press the first row when it
   is open, never both.
7. As a player walking when I open the menu, I want my character to stop and not to walk on when
   the menu closes, so that a held key never sticks.
8. As a player in the town, I want the OPTIONS Music row to change the music I hear at once, so that
   the slider still works live.
9. As a player who goes fullscreen or moves the window to another monitor, I want the corner row
   and the menu crisp and in place, so that the interface follows the render scale as the world
   does.
10. As a player whose connection drops, I want Esc to do nothing under the disconnect notice, so that
    only its button takes me on.
11. As a player going back to the main menu or character creation, I want no corner row or menu over
    those screens.
12. As a player matched while the menu is open, I want the menu to close as the run comes up, as it
    does today.
13. As a player who dies or escapes with the menu open, I want the menu to step aside for the card,
    as it does today.
14. As a developer adding a world, I want the corner row, the menu and the sounds to appear without
    my world building them, so that a new map does not repeat the interface.
15. As a developer, I want the world and the interface to talk only through one typed interface, so
    that either can change without reading the other's internals.
16. As a developer moving a later group (gear, party, minimap, mailbox, run HUD, chat), I want the
    shell, the interface and the key rule already in place, so that each phase is one move.
17. As the owner, I want screenshots before and after each move, so that I can confirm nothing
    changed before it merges.

## Acceptance Criteria

- [ ] `UIScene` is in the game's scene list after the three world scenes and before
      `DisconnectNoticeScene`.
- [ ] Entering the town from the menu launches the UI scene; a switch town → run → town → field
      leaves the same UI scene instance standing (never restarted).
- [ ] In the main menu and character creation the UI scene is asleep: nothing of it drawn, Esc does
      nothing of its; back into a world it wakes with that world's corner row.
- [ ] With the disconnect notice up, the UI scene is paused; Return to menu leaves it asleep.
- [ ] No scene class imports another scene class or calls another scene's methods for the UI;
      the world scenes and the UI scene use only the interface (by test or by the diff).
- [ ] The world scenes no longer construct `HudCorner`, `showMenuPanel`, `openOptionsPanel` or
      `UiSounds`, and no longer bind Esc (no `keydown-ESC`, no `addKey(ESC)`).
- [ ] No scene calls `stopPropagation()` or `stopImmediatePropagation()` on a keyboard event to
      settle which scene answers a key; the key rules hold in the first world after a page load and
      after a world switch alike.
- [ ] A press on the corner row or on the open menu (blocker included) reaches no world handler;
      a press beside them does (a test on the scene list, and the owner's check).
- [ ] Esc steps through dialogue, letter, menu, party, gear, menu-open, in every world, as
      `escapeStep` says, and does nothing once the run has ended but close windows.
- [ ] In the run, 1 with the menu shut drinks a potion and with it open picks the first row, never
      both; likewise Enter (chat vs first row) in every world.
- [ ] A movement key held as the menu opens stops the stride, and its release is heard by the world.
- [ ] The town's OPTIONS Music row changes the playing music at once.
- [ ] Every interface sound plays as FS-WDM0X says: once per player action, none for a server-made
      change, menu ↔ OPTIONS silent.
- [ ] Every acceptance criterion of FS-3EBCA, FS-G4VMQ, FS-9K8EZ, FS-28DDG § Change, FS-T3DWX and
      FS-WDM0X still holds; their tests pass, moved with the code where they tested a world scene.
- [ ] Before/after screenshots of each moved piece (R23) match or every difference is named and
      accepted (R24).
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.
- [ ] The owner's look-and-feel check in the town, a field and the run, at 1×, 1.5×/2× and
      fullscreen, passes.

## Edge States

- **A world switch with the menu open** (a match found from the town's menu, a field's gate): the
  menu closes as the old world shuts down; the new world's corner row is built; no sound.
- **A world still loading its art** (FS-C4JWH): the world has not reported yet, so the UI scene
  shows nothing of a world it has not heard from; it shows that world's row on the world's report
  at `create`, which is when the row appears today.
- **The same world restarted** (back to the town from a run): a left then an entered report; the row
  is rebuilt, as it is rebuilt today.
- **The disconnect notice during a world switch**: the notice pauses whatever is running, the UI
  scene included.
- **A press that starts on the interface and ends beside it**: the press is the interface's; the
  release reaches the world as a `pointerup` with no press before it, as it does today inside one
  scene, and no world handler acts on it (the run's Shadow Shot releases only a hold it started).
  **[spike (a)]**
- **A key held while the pointer rests on the interface**: the world still hears it. Keys do not go
  through pointer polling, so this holds with or without polling in the UI scene. **[spike (b)]**
- **The first world after the page loads vs every later one**: the world's keyboard plugin is
  ahead of the UI scene's in the first, behind it after any switch (R21). Nothing may depend on
  that order. **[spike (b)]**
- **The menu open and the player dies, escapes, or the run ends**: R20.
- **A dialogue opening under an open menu** cannot happen today (the menu refuses talk); if a report
  ever says so, the menu yields (R20).
- **Leaving /game with the menu open**: the game is destroyed, the UI scene and the interface with
  it; no listener survives (R4).

## Spike findings

Run 2026-11-14 (P8). A standalone Phaser 4.2.1 page with no server: a fake world (a full-view
interactive ground, scene-wide `pointerdown`/`pointerup`/`wheel`, and its own Esc, I, 1 and Enter
handlers, by event and by `addKey` + `JustDown`, plus a held W) under a UI scene (one interactive
panel, Esc and I as its own, 1 and Enter only while its "menu" is open). Bundled with the repo's
esbuild straight from `src` (the tsconfig `@/` paths), so `ViewportFit`, `mountViewport`, `fitGame`,
`relayoutOn` and `roundEveryObject` are **the repo's own, imported standalone, not mimicked**. Driven
in headless Chrome by playwright-core `channel: "chrome"` (SwiftShader, as the bake runs). The page
and driver stayed in git-ignored `game-client/tmp/ui-scene-spike/` and were never committed.

**(a) Pointer: holds.** With the UI scene above the world and `globalTopOnly` at its default:

- A click on the panel reaches the panel and no world handler, neither the ground nor the scene-wide
  `pointerdown` or `pointerup`. A wheel over the panel reaches no world `wheel`.
- A click or wheel beside the panel reaches the world's ground and its scene-wide handlers.
- A press on the panel let go beside it: the press is the panel's alone, and the world's scene-wide
  `pointerup` *is* heard. Today one scene hears both, so nothing changes; no world handler acts on a
  lone release (the run's Shadow Shot releases only a hold it began).
- The UI scene's own scene-wide `pointerdown` fires on every press, panel or not; it never stops the
  world from hearing a press beside the panel.
- With the UI scene registered *below* the world, a click on the panel goes to the world: the order
  in the scene list is load-bearing (R1, R7).

**(b) Keys: holds, by binding and state; `stopPropagation` does not.** Every keyboard plugin hears
every key, in the order the plugins subscribed to the input manager's `process` event (each scene's
keyboard plugin subscribes as the scene starts), *not* in scene-list order:

- First world after load (the world starts and launches the UI): listeners "World then UI". The UI
  scene's `stopPropagation()` on Esc came too late: the world's `keydown-ESC` and its `JustDown(ESC)`
  both fired.
- After a world switch (stop + start the world, the UI standing): "UI then World". The same stop now
  shielded the world completely.
- Without any stop, a world that still binds Esc acts on it alongside the UI (the control).
- 1 and Enter with the UI's menu shut reach the world only; with it open the UI acts, and a world
  handler not guarded by the menu state acts too.
- A W held while Esc opens the menu: the world hears the keyup (`isDown` false, `keyup-W`).
- With the pointer resting on the panel, the world still hears W, with and without pointer polling
  in the UI scene: keys are dispatched from the DOM event, not from pointer polling.

So the key split is the charter's P5 taken literally, **world scenes never bind the UI's keys**, plus
state guards on shared keys, and no key ever relies on `stopPropagation` (R21). This sharpens P5's
"world scenes stop binding them" from one option into the only safe one; no default changes.

**(c) Render scale: holds, with the repo's own plugin.** Through `mountViewport` → `fitView` →
`viewport.set` → `fitGame`, both scenes' cameras went 1080×720 zoom 1 → 1620×1080 zoom 1.5 →
2160×1440 zoom 2; a frame grown to 1920×1080 (fullscreen-like) gave a 1280-wide view at 1.5 and fired
both scenes' `relayoutOn`. At each scale the panel still took its click and a click beside still
reached the world. One gap in the harness: headless Chrome's emulated density change did not fire
the `(resolution: …dppx)` media query, so the driver nudged the frame by 1 px to run the same refit
(`watchFrame` → `fitView(frame, devicePixelRatio)`); the density watch itself is FS-ZAJMH's and
unit-tested there.

**Defaults:** none changed. P4 holds as stated; P5 holds, its mechanism now fixed (no
`stopPropagation`); P6 holds with no code of the UI scene's own.

## Out of Scope

- Phases 2–7 (the gear overlay, party panel, minimap, mailbox, the run's HUD, chat), and the
  corner hotkeys I, B, C, T and M, which move with their windows.
- Any change to what the interface looks like, says or does.
- The disconnect notice (stays its own scene, over the UI scene).
- The main menu and character creation's own canvas menus.
- The server.

## Amendment A1 2026-11-14 (the pointer across the scenes)

**Why.** I-TQZ5J-3 moved the corner row into the UI scene, and its developer found three things a
player touches that changed, against the charter's "a player sees, hears and presses exactly what
they do today". All three come from how Phaser hands a pointer event to the scenes: top down, and
stopping at the first scene that has an interactive object under the pointer (or that just left one)
as long as `InputManager.globalTopOnly` is on, which R7 keeps. Verified against Phaser 4.2.1 in the
git-ignored harness `game-client/tmp/ui-scene-corner/` (before: 74ecdf3c, the row in the world;
after: 27957a8f, the row in the UI scene):

1. **A press begun in the world and let go over the row never ended in the world.** Before, the
   world heard its `pointerup`; after, neither `pointerup` nor `pointerupoutside`, and not even a
   release off the canvas once the press had passed over an icon (its out event made the UI scene
   take the release). An archer's Shadow Shot hold let go over the icons stays drawn; a chat
   scrollbar drag let go there stays grabbed.
2. **A press on the row no longer let go of the game's text field.** The chat input's and the party
   invite field's owners let go of their field for a press the world hears off their panel
   (`ChatWindow.onPress`, `PartyPanel.onPress`); a press on the row never reaches the world (R7), so
   pressing Party left the chat focused and the next keys went on landing in it.
3. **A move onto the row was not heard by the world.** A single jump from a bag slot onto the row
   left the gear overlay's item tip showing; a single jump back from the row onto the slot did not
   show it again (the UI scene took that move too, for its out event).

**Decision.** The integrator chose parity: today's behaviour back. The rules below hold for every
piece the UI scene holds, the corner row now and each group a later phase moves (§ Phases); a later
phase's `## Change:` inherits them without restating, and states only what it adds. They amend R7
(whose press rule stands) and add R25–R27. Built as I-TQZ5J-6. **[integrator decision; harness]**

### Requirements (added)

25. **A world's press is the world's to its end.** A press that begins with nothing of the UI
    scene's under the pointer (in the world, or on a held icon, R14) belongs to the world until no
    button is down: its moves and its release reach the world wherever the pointer goes, the release
    as `pointerup` over the canvas (over a UI piece included) and as `pointerupoutside` off it, with
    the world's own aim point (`pointer.worldX/worldY` through the world's camera). The UI scene takes
    no part of a press it did not start: while it is down, no UI piece is under the pointer for
    Phaser, so none lights, labels or answers a press, a second button's included. Its pieces answer
    again from the first event with no button down.
    *Why:* a press belongs to the scene it began in, as a press begun on a UI piece is the UI scene's
    (R7). Otherwise a hold or a drag the world began never ends in the world (Shadow Shot, the chat's
    scrollbar), and a release over the UI scene would carry the UI camera's point. *How:* the UI
    scene's cameras leave Phaser's hit test (`Camera.inputEnabled`, which
    `CameraManager.getCamerasBelowPointer` reads) from the moment it hears a press with nothing of its
    own under it until no pointer is down (heard on its release, the next move, or the next frame;
    Phaser hears a release on window, so one off the canvas counts). With nothing of the UI scene's
    hit, Phaser does not stop there and hands every event on, so the world hears its press exactly as
    a world with no scene above it does. No global switch of Phaser's is turned, and no
    `stopPropagation` (R21's rule kept for the pointer too). **[integrator decision; harness]**
26. **A press on the UI scene lets go of a focused text field, as a press in the world does.** A
    press the UI scene takes lets go of the game's own text field holding focus (the chat input, the
    party invite field: the frame's DOM fields, inside Phaser's parent) after the piece pressed has
    answered, the order one scene gave it. A field's owner keeps its field only for a press on its
    own piece, as today (the chat keeps typing for a press on its panel). While an owner stands in a
    world (both do in phase 1) any press the UI scene takes lets its field go; once an owner moves
    into the UI scene (the party panel in phase 3, chat in phase 7), a press on that piece keeps its
    field by the piece's own rule and a press on any other piece lets it go. A page control outside
    the game (the site header) is let go of by the frame for any press on the game, as before
    (`takeFocusOnPress`, unchanged).
    *Why:* the owners hear the world's scene-wide `pointerdown`, which a press on the UI scene never
    reaches (R7), and that press must stay out of the world (it would attack, walk or cast). The
    field's letting go is the one part of the world's press a UI press must still have. *How:* the
    UI scene blurs the focused element inside the game's frame itself (`letGoOfGameField`,
    `gameFocus.ts`), on its own scene-wide `pointerdown` when Phaser lists one of its pieces under
    the pointer. **[integrator decision; harness]**
27. **Every move reaches the world.** A pointer move the UI scene takes (the pointer over one of its
    pieces, or just leaving one) still reaches the world reported, through the world's own input
    pass: over a UI piece as a move over nothing of the world's (the world's hovered objects get
    their out, its scene-wide `pointermove` hears it with nothing under the pointer, so a tip or
    hover the world shows goes), and just off a piece as any move (what lies under the pointer there
    gets its over). A press, a wheel and the release of a press begun on a UI piece, over a piece,
    still reach no world (R7).
    *Why:* before, the row was the world's top object, so a move onto it ended the world's hovers
    under it in the same pass, and a move off it lit what lay beyond; Phaser now stops those moves at
    the UI scene. A world hover must not hang until some later move the world happens to hear.
    *How:* the UI scene hands such a move to the world reported through the UI bridge, and the world
    runs it through Phaser's own pass over a DOM event (`InputPlugin.update`, Phaser 4.2.1, private:
    pinned by test to its source), with its cameras out of the hit test for a move over a UI piece.
    The UI scene hands on only the moves Phaser stopped at it, so the world hears each move once.
    A world piece that hovers by coordinates on its scene-wide `pointermove` (the gear overlay, the
    satchel, the map mode icon) hears the pointer's coordinates as before; in phase 1 none lies under
    the row (R15). A later phase that moves a UI piece over one names it (R24) and says how it yields.
    **[integrator decision; harness]**

### Acceptance Criteria (added)

- [ ] A left or right press begun in the world and let go over the row reaches the world's
      `pointerup` with the world's aim point, and one let go off the canvas its `pointerupoutside`;
      the world hears every move of it over the row (harness, before vs after).
- [ ] A press on a corner icon with the game's text field focused lets go of it; a press in the world
      as before (harness, before vs after; unit).
- [ ] A single move from a world hover (the gear overlay's item tip) onto the row ends it, and a single
      move back shows it again (harness, before vs after).
- [ ] A press and a wheel on the row still reach no world handler (R7; harness).
- [ ] The corner row's before/after screenshots (R23) stay pixel-equal.
- [ ] Unit tests for each rule; full client vitest, `tsc --noEmit`, `npm run lint` and
      `npm run lint:fence` pass.

### Edge States (added)

- **A world press passing over the row.** No icon lights or labels under it. When the row was the
  world's, an icon lit and labelled under a world press passing over it (the harness's before); this
  is the one picture R25 changes, and it is named for the owner's check (I-TQZ5J-5). A second button
  pressed over an icon during a world press is the world's, where it once pressed the icon.
- **A world press still down as the UI scene sleeps or the world switches.** The UI scene's pieces
  come back on its first move or frame with no button down; Phaser hears the release on window
  either way.
- **A release over an icon ending a world press.** The icon lights on the next move, not on the
  release itself.
- **Touch.** One UI scene for every pointer: a world press by one finger keeps the UI scene's pieces
  from every finger until all are up. Touch is not a supported input.

### Out of Scope (added)

- The ESC menu and the dialogue (I-TQZ5J-4's scope, still the owner's to settle).
- Keys: R21 stands as written.
- Turning `globalTopOnly` off, or any other game-wide input switch.

## Amendment A2 2026-11-14 (the dialogue card and the notices)

**Why.** The owner widened phase 1 on 2026-11-14: 「對話匡也搬吧」 (move the dialogue box too), and
the screen notices with it, so both draw over the interface. With the corner row in the UI scene
(I-TQZ5J-3), the town's NPC dialogue card, still the town's at the popup band (`MENU_DEPTH` 2000),
draws *under* the row (1000) where they meet: its lower rows run under Inventory, Character and
Party (the harness's `corner/depth/after/hub-dialogue-*` shots). Slice 3 only holds the row while a
dialogue is open; it does not put the card back on top. A notice left in a world would likewise stand
under every UI piece it crosses. The owner approved the design the same day: the dialogue becomes
typed data the world hands the UI scene, which draws it and hands back the id picked; the notices
become typed messages. No function crosses the interface (ADR-0081). **[owner decision]**

**What moves.** Phase 1 (§ Phases) now also moves into the UI scene, unchanged:

- **The dialogue card**: `showDialogueCard` (`src/ui/npcDialogue.ts`) as the town draws it today
  (`HubScene.showDialogue`) for the Spire's door, the Elder and the town folk, the storekeeper and
  the residents. **[code]**
- **The notices**: the town's passing line (`HubScene.notice`: top centre at y 72, depth 1000, gone
  after 3.2 s), the field's (`FieldScene.notice`: its own backed line, y 72, depth 1000, 3.2 s), and
  the run's notifications (`BarrowspireScene.showNotification`: y 100, depth 2000, a backing colour
  per tone, held 1 s then faded over 2 s), with every path that raises one (the worlds' refusals and
  server messages, `HubGear`'s, `EquipmentHud`'s and `fieldPiles`' `port.notice`). **[code]**

Not moving: the town's queue line (`showQueueProgressText`), chat's notice lines (`useChatStore`,
chat's phase), the party panel's own lines, and the disconnect notice (its own scene). **[code]**

### Requirements (added)

28. **Depths in the UI scene.** Each piece keeps the depth it has today, now inside the UI scene:
    the corner row 1000; the windows 1100–1800 as later phases move them; the popup band 2000 (the
    ESC menu, OPTIONS and the Fall confirm with their blocker at 1999, the dialogue card, the run's
    notifications); tips 2200 and above. Pieces at one depth draw in the order they were added, a
    later one over an earlier (Phaser 4.2.1's `DisplayList.depthSort` is a `StableSort` by depth),
    as they did inside one world. The town's and the field's notice lines stand at 1000 today and
    keep 1000: over the corner row by that order, under the menu as today. **[owner design; code]**
29. **The dialogue is the world's data.** The town shows a dialogue with one typed call on the
    interface, `showDialogue({ speaker, text, options })`, and takes it down with `closeDialogue`:
    - `speaker`: the name; the role under it, if any; the portrait, if any, as a texture key and
      frame (the frame the figure the player walked up to shows, read by the town as today; the
      game's textures are one manager, so the UI scene cuts the same bust from it);
    - `text`: the line;
    - `options`: each `{ id, label, register, enabled }`. The owner's `{ id, label }` keeps the two
      facts today's look reads: `register` (`actionable` | `cancel`, the row's colour and its key)
      and `enabled` (false: the row is dimmed, neither lit nor pressable). Labels go bare; the UI
      scene adds the key on each by today's rule (`[E]` for a lone actionable row, `[1]`–`[3]` for
      several, `[Esc]` for the cancel row).
    Plain data only: no callback, no live reader (`enabled` today is a function the card reads;
    it becomes a value the world sends again). The world sends the card again whenever any part of
    it changes (a reply now awaited, a page turned). A card with the same speaker, text and option
    ids retones in place, as today's `retone`; any other replaces the one shown, as today's
    close-then-show of a turned page. **[owner design; code]**
30. **Its answers are requests.** A row pressed, or picked by its key, sends `pickDialogue` with its
    option's id; a dimmed row sends nothing. The world acts on the id as it acts on the choice today
    (does it, stays up awaiting a reply and sends the card again, turns the page, or closes), within
    the call (R11). An id not on the card the world shows now is ignored. Esc sends `close: dialogue`
    (R17), today's dismiss. **[owner design; code]**
31. **Its keys.** While a dialogue is shown its keys are the UI scene's, as the menu's are (R18, R21):
    E and Enter pick the first actionable row (with none, they close it), 1–3 an actionable row by
    number, Esc closes it, exactly as `HubScene.showDialogue`'s `confirm`, `pick` and `dismiss` do
    today. Shared by state: the town's own E, Enter and 1–3 handlers stay guarded by its dialogue
    being open (the town knows: it asked for it), so a key is never acted on by both. No
    `stopPropagation`. **[owner design; spike (b)]**
32. **The card in the UI scene.** Drawn by the UI scene where and as today (bottom right, the popup
    band, its rows' hit areas over it, its bust's mask), and laid out again on a new view. It stands
    over the corner row again, as it did when both were the town's: slice 3's hold of every icon
    under a dialogue (`UiCornerRow`'s `heldNow`) gives way to the card's rows taking their own
    presses by depth, and what lights, labels and answers on the row under an open dialogue is what
    it was at 74ecdf3c (the town still refusing Party, R14). The menu yields to it (R20). It closes,
    with no sound, as its world leaves. Its ground stays non-interactive, so a press on it beside a
    row reaches the world as today (R7, A1 R25). **[owner design; code]**
33. **Notices are typed messages.** A world says a notice with one typed call on the interface,
    `notice({ text, look })`: `look` is the town's line, the field's line, or the run's notification
    with its backing colour (a colour value, data). The UI scene draws it with today's look, place,
    depth and timing on its own clock (R28; the town's and the field's 3.2 s then gone, the run's 1 s
    then a 2 s fade), each notice its own as today, several standing at once where today they do. A
    notice is not the player's: it plays no sound and takes no input. **[owner design; code]**
34. **A notice goes with its world.** As a world leaves, every notice it said is taken down, as the
    world's shutdown destroys them today. Under the disconnect notice they hold with the UI scene
    (R5), as they hold with the world today. **[code]**
35. **The depth inversion, again (R24).** Moved into the UI scene, the card and the notices draw over
    every piece still in a world. The slice moving each names which world pieces can meet it and
    screenshots each case before and after: for the card, the gear overlay (1100), its tips (2200)
    and flash (2300), the party panel (1110) and the letter panel (1800); for the notices at the top
    centre, the letter panel, the gear overlay and its tips and flash, the party panel, the run's
    controls panel (1200), resolved card (1500) and settlement record (1600). Today a world piece
    above a notice's depth (a tip over a run notification, the gear overlay over a town line) draws
    over it; after, the notice is on top. That is what the owner asked for (notices over the
    interface); each case is still shown to the owner (I-TQZ5J-5). **[owner design; code]**

### Acceptance Criteria (added)

- [ ] Every acceptance criterion of the dialogue's owners still holds (FS-29KSH R24, FS-NSV3D,
      FS-0XMCP's door, FS-B0H2D R27, FS-BJNYC R20–R22); their tests pass, moved with the code.
- [ ] The town no longer calls `showDialogueCard`; no world scene draws a notice of its own.
- [ ] The dialogue and the notices cross the interface as plain data: no function in either message
      (by the types and the diff).
- [ ] E, Enter, 1–3 and Esc on an open card do what they do today, never acted on by both the card
      and the town, in the first world after a page load and after a world switch.
- [ ] A notice said just before a world switch is gone in the next world; a dialogue open as the town
      leaves closes with no sound.
- [ ] Before/after screenshots (R23): the card (the door with its three ways, one dimmed while its
      reply waits, the door's refusal line, a page of the Elder's telling, a resident), idle and each
      row hovered, over the corner row; each notice look; at render scale 1, 1.5 and 2, windowed and
      fullscreen. Pixel-equal against 74ecdf3c, or each difference named for I-TQZ5J-5.
- [ ] The depth cases of R35 screenshotted and named.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

### Edge States (added)

- **A page turned** (the Elder's Go on): the town sends the next card; it replaces the one shown.
- **A reply awaited** (the door's three ways): the town sends the card again with that row
  disabled; it retones in place, the pointer's hover as today's `retone` leaves it.
- **The door's card closed by walking out of the gate**: the town's `closeDialogue`, no sound.
- **A dialogue open as the town leaves** (a match found, a field's gate): closed as the town leaves.
- **A notice said while the menu is open**: drawn at its depth; the run's (2000), said after the menu
  opened, over it, as in one world today; the town's and the field's (1000) under it.
- **A notice said in the frame its world leaves**: taken down with the world's leaving.
- **Between I-TQZ5J-4 and these slices**: the card and the run's notifications are still the worlds'
  and draw under the UI scene's menu (2000) where they meet; I-TQZ5J-4 names those cases.

### Out of Scope (added)

- Any change to the card's or the notices' look, words or timing; dialogue sounds (there are none).
- The queue line, chat's lines, the party panel's lines, the disconnect notice.
- A dialogue tree or memory (FS-29KSH's out of scope stands).

Sliced as I-TQZ5J-7 (the dialogue card) and I-TQZ5J-8 (the notices), each after I-TQZ5J-4, which
first fills the popup band (2000) and settles Esc; the owner's check (I-TQZ5J-5) now waits on both.

## Change: Menu, dialog and notice sounds → FS-WDM0X

FS-WDM0X § Change: Menu, dialog and notice sounds (pass 1) gives the UI scene's pieces their hover,
press, dialog and notice sounds. It supersedes A2 R33's "it plays no sound" for the notices.

## Change: Phase 2: the party
Status: work-order
Date: 2026-11-14

Scoped and promoted in one run under the owner's approved charter (2026-11-14: 「按照你的建議吧」),
with the integrator's defaults; no interview, no `challenge-me` pass. What the code forces (read on
feat/client-ui-scene, ecb92ba9) is marked **[code]**; the charter's defaults **[charter]**; a default
applied to a case the charter did not name, *Derived*. A1's pointer rules (R25–R27) and A2's depth
rule (R28) are inherited, not restated.

**The order of the phases changes.** § Phases put the gear overlay second and the party third. A
first try at moving the gear overlay with the satchel / container view found the party panel (1110)
drawing over both (1100, 1000): moved alone, the gear overlay would stand over a party panel still in
a world. The party moves first, so this phase is the party; the gear overlay, the satchel / container
view and the settlement record are phase 3; the rest keep their order after them. § Phases' table
stands as the record of the plan as first written. **[charter]**

**Lane.** game-client only. No server, proto, gateway or manifest change. No behaviour or look change
but the depths named in R46. **[charter]**

### Facts (verified 2026-11-14 on feat/client-ui-scene, ecb92ba9)

- **Who mounts what.** Each world's `create` mounts the party panel (`mountPartyPanel`, its DOM invite
  field, T, its × and buttons), the invite prompt (`mountPartyInvitePrompt`) and the party frames
  (`mountPartyFrames`, with Travel); the town alone mounts the ready check (`mountPartyReadyCheck`:
  the check only happens in the town, FS-BJNYC R4). Each world's `release` destroys them. **[code]**
- **What they read of the world.** The panel: `blocked` (the town: its dialogue or the menu; a field:
  the menu; the run: the menu, its end or an open chest), `opening` (the town: its letter panel
  closes), the interface sounds' wrapper. The prompt: `hidden` (the town: the menu, the gear overlay
  or the letter panel; a field: never; the run: its end) and `floor` (a field and the run: the chat
  window's top edge; the town: none). The ready check: the town's `hidden`. The frames: the world's
  art library (the class sheets, resident art, FS-C4JWH) and each state tick (`show(state)`). **[code]**
- **What they read of their own.** The party store (`usePartyStore`: the party, `panelOpen`, the
  invites, the ready check), the game store's world, the auth store's player, and they send through
  `partyCommands(socketManager)`. These are app state and the socket, fed by `SocketManager`, read by
  no scene's field: the town and the field read the party store themselves today. **[code]**
- **What the world asks of them.** `windows().party` is the panel's open state; the answers `toggle:
  party` and `close: party`; the menu opening (`heardUi`) and the letter panel opening
  (`clearForLetter`) close it; the world's click paths (`panelTakes`, the field's `takesPointer`),
  `GearOverlay`'s `under`, the town's map pointer and the field's and the run's map mode icon test
  `partyPanel.covers` and `invitePrompt.covers`. **[code]**
- **Their presses.** The panel's ×, its buttons and the frames' Travel (`drawHudButton`) and the
  invite prompt's buttons answer on `pointerup` (main d6a64948); the ready check's on `pointerdown`.
  Their grounds take no input: a press on the panel's or a prompt's ground reaches the world, which
  refuses it only by the rect tests above (the town has none for the prompt and the ready check). A
  greyed button takes no input. **[code]**
- **Depths.** The panel 1110, its invite field (a DOM element) 1000, the prompt, the ready check and
  the frames the HUD's 1000. **[code]**

### Requirements (added)

36. **What moves.** Into the UI scene, unchanged: the party panel with its invite field, T, its × and
    its buttons; the invite prompt; the ready check; the party frames with Travel. The UI scene builds
    them for each world it hears reported and takes them down as that world leaves, as each world's
    `create` mounted and its `release` destroyed them: the ready check in the town only, the rest in
    every world. A switch builds the next world's anew; the panel's open state, the invites and the
    check live in the party store, so they carry across a switch as today. No world scene mounts a
    party piece. **[charter; code]**
37. **What the UI scene reads directly.** The party store, the game store's world and the auth
    store's player, as the pieces read them today: app state, not a scene's field (ADR-0081 Decision 2
    forbids reaching into a scene). Party commands go out as before, from the pieces, through
    `partyCommands(socketManager)`: they were never a world's messages. The frames cut their busts
    from the UI scene's own art library over the resident art (`registerArt(…, RESIDENT_ART)`), where
    the class sheets are: the game's textures are one manager, and the world's library resolves the
    same frames. **[charter; code]**
38. **What crosses the interface, typed.** The world's part of each rule becomes plain state in its
    report; the UI scene adds its own menu state where the rule read it:
    - `blockers().party`: the world turns T and the Party icon away now (the town: its dialogue; the
      run: its end or an open chest; a field: never). The panel is refused while this is true or the
      menu slot is filled.
    - `blockers().popups`: the world hides the invite prompts and the ready check now (the town: the
      menu, the gear overlay or the letter panel; the run: its end; a field: never), the world's rule
      whole, the menu included where it read it.
    - `layout().chatTop`: the screen y the invite stack stays above (the chat window's top edge in a
      field and the run; none in the town).
    - `partySeen(state)`: each state tick the frames were shown, as plain data (the player's own and
      the others' health, resource and level).
    A report without them reads false and none. **[charter; code]**
39. **The party leaves the world's windows and requests.** The party panel's open state is the UI
    scene's to read (the store's `panelOpen`): `WorldWindows` loses `party`, `toggle` and `close` lose
    `party`. The corner row's Party icon, Esc's party step (R17, `escapeStep`'s order unchanged:
    letter, menu, party, gear), the menu opening over the windows (FS-3EBCA R17) and the Menu icon
    after the run's end act on the UI scene's panel itself; the gear overlay's close stays a request.
    The interface sounds' window state reads the panel from the UI scene and the rest from the report
    (R22). The town's letter panel opening still closes the party panel: the town shuts it in the
    party store, as the panel's own close does; the panel opening still asks the town to close its
    letter panel (`close: letter`). **[charter; code]**
40. **Their presses are the UI scene's.** The open panel, each shown invite prompt and the ready check
    take every press, wheel and move on their rect: each stands an interactive ground under its own
    buttons, drawn nothing, so Phaser stops there (R7). The world's `panelTakes` and the field's
    `takesPointer` stop testing them, and so do `GearOverlay`'s `under` and the map pointers (R41). The
    frames' ground stays open as today: a press on a frame reaches the world (an attack in a field or
    the run); only Travel is the UI scene's. The ×, the buttons and Travel keep answering on
    `pointerup`, the ready check's buttons on `pointerdown`. **[charter; code]**
41. **A world hover by coordinates yields under any UI piece.** While the world hears a move the UI
    scene took over one of its pieces (A1 R27), the bridge says so (`overUi`); the world pieces that
    hovered by coordinates and gave way to the party panel (the gear overlay's `under`, the town's
    map pointer, the field's and the run's map mode icon) give way to it instead, as to any UI piece.
    So the gear overlay's slots under the party panel neither light nor tip, as today. This is how they
    yield (R27's "says how it yields"). *Derived.*
42. **The invite field keeps its rule (A1 R26).** A press on the party panel (its ground, a button,
    its ×) keeps the invite field's focus; a press on any other UI piece or in the world lets it go;
    the chat's field lets go for a press on the panel as it does today. The field is the UI scene's
    DOM element, placed by its camera as before. **[charter; A1 R26]**
43. **T is the UI scene's.** Owned outright (R21): no world binds it; the panel hears it on the UI
    scene's keyboard as it heard it on the world's, under the same rule (refused while blocked, a
    letter while a text field holds focus). **[charter; R21]**
44. **Depths, inside the UI scene.** Today's: the panel 1110, its invite field, the prompts, the ready
    check and the frames 1000 (R28). Among the UI scene's own pieces nothing meets in a new order: the
    menu, the dialogue card and the run's notifications (2000) stand over every party piece as they
    did; the town's and the field's notice line (y 57–87) stays clear of the prompts (from y 92) and of
    the panel (from 18 % of the view's height, y 130 at 720). **[code]**
45. **Parity.** Before (ecb92ba9) and after screenshots in the harness (R23): the party panel with no
    party, in a party as leader and as member, greyed in a run; the invite prompt; the ready check;
    the frames with Travel; in the town, a field and the run, at render scale 1, 1.5 and 2, windowed
    and fullscreen. Pixel-equal except the depths named in R46. The earlier sets (corner 119, menu 498,
    dialogue 144, notices 84) stay pixel-equal. **[charter]**
46. **The depth inversion (R24).** Moved into the UI scene, the party pieces draw over every piece
    still in a world. Each case where a world piece above a party piece's depth can meet it today is
    named and shot before and after, for the owner's check:
    - the panel (1110) under the run's controls panel (1200), its resolved card (1500), the gear
      overlay's tips (2200) and flash (2300) today; over them after;
    - the prompts (1000) under the gear overlay (1100, in a field and the run, where the prompt is
      never hidden for it), its tips and flash, the run's controls panel and resolved card today; over
      them after;
    - the frames (1000) under the gear overlay's character panel (1100), its tips and flash, the
      town's letter panel (1800) where they meet today; over them after.
    No world piece comes to draw over a party piece it was under. **[code]**

### Acceptance Criteria (added)

- [x] No world scene imports or mounts `PartyPanel`, `PartyInvitePrompt`, `PartyReadyCheck` or
      `PartyFrames`, binds T, or tests a party piece's rect (`partyPanel.covers`,
      `invitePrompt.covers`).
- [x] The UI scene builds the panel, the prompt and the frames for each world reported and the ready
      check for the town only, and takes them down as the world leaves; an open panel stays open
      across a switch.
- [x] T and the Party icon open and close the panel under `blockers().party` and the menu, as today
      in each world; Esc closes the letter, the menu, the party panel, the gear overlay in that order;
      the menu opening closes the panel; the letter panel opening closes it and the panel opening
      closes the letter panel (the town).
- [x] The prompts and the ready check hide by `blockers().popups`, stack above `layout().chatTop`, and
      the frames' bars and levels follow `partySeen`.
- [x] A press, wheel or move on the open panel, a prompt or the ready check reaches no world handler
      (no attack, no cast, no gear slot lit or tipped, no map mode icon lit); a press on a frame
      reaches the world as today; the panel's, the prompts' and Travel's presses answer on release.
- [x] A press on the panel keeps the invite field's focus; a press on another UI piece or in the
      world lets it go.
- [x] Every party sound plays as FS-WDM0X says, once per player action (R22; FS-WDM0X § Change pass
      2 (party)).
- [x] Before/after screenshots (R45) pixel-equal except R46's named cases, each shot; the earlier
      sets stay pixel-equal.
- [x] Every acceptance criterion of FS-R82NV's panel, prompt and frames, FS-NCC9J R23–R28, FS-BJNYC
      R23–R26, FS-B3NDZ and FS-CH21F R8–R12 still holds; their tests pass, moved with the code where
      they tested a world scene.
- [x] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.
- [ ] The owner's look-and-feel check of the party pieces and R46's cases passes.

### Edge States (added)

- **A press on the panel's or a prompt's ground in the town.** It was the town's, and nothing in the
  town answered it but the chat field letting go, which R42 keeps.
- **A world press passing over the panel** (a held Shadow Shot, a chat scrollbar drag): the world's
  to its end (R25); while it is down the UI scene hits nothing, so the gear overlay's slots under the
  panel can light under it (`overUi` is not said for a move Phaser handed the world itself). Today the
  rect test kept them dark.
- **The dialogue card's rows over the gear overlay.** R41 is the UI scene's whole: a move over a card
  row now dims the gear overlay's hover under it too, where it lit before.
- **A monster or an ally under the panel or a prompt in the run.** No longer lit under the pointer
  there (the UI scene takes the move), where today it was.
- **The panel open as the run ends.** As today: the run's end refuses T, and the panel is closed by
  whatever closed it.
- **A world still loading its art.** Its party pieces come with its report at `create`, as they came
  with its `create`.

### Out of Scope (added)

- The gear overlay, the satchel / container view and the settlement record (phase 3), the minimap and
  M, the mailbox, the run's HUD, chat.
- Any change to what the party pieces look like, say or do, but R46's depths and the sounds of
  FS-WDM0X's pass 2.
- The server; the party's commands and the store's rules.

### As built (2026-11-14)

Appended after the slices; the text above is not edited. Built in I-TQZ5J-9 (the panel, its field and
T), I-TQZ5J-10 (the invite prompt and the ready check) and I-TQZ5J-11 (the frames and Travel), the
party's sounds in I-WDM0X-8 (FS-WDM0X § Pass 2: the party).

- **Parity (R45).** 186 of 186 before/after shots pixel-equal (the cases R45 lists, at render scale
  1, 1.5 and 2, windowed and fullscreen, the resident art loaded so the busts are real).
- **R46, as shot.** The party panel now draws over the run's controls panel, its resolved card and a
  gear item tip where they meet. The frames now draw over the gear overlay's character panel (its top
  left corner, in the town and the run) and, at 1× windowed, over the letter panel's left edge by a few
  pixels. Two invite prompts meet neither the controls panel, the resolved card nor the gear overlay:
  equal. The frames over the character panel is the one inversion a player will notice: phase 3
  (the gear overlay into the UI scene, 1100 over the frames' 1000) puts it back. Each goes to the
  owner's check (I-TQZ5J-12).

### Amendment B1 2026-11-14 (after the phase 2 review)

Appended after the review of phase 2 (ecb92ba9..09ff93e0) and FS-WDM0X § Pass 2b; the text above,
the As built paragraph included, is not edited. What the owner decided is **[owner]**; a review
finding settled by the integrator, *Derived*.

**R37 and ADR-0081.** R37 sends the party's commands from the pieces, which stood against ADR-0081
Decision 2's "socket messages stay the world's". [ADR-0082](../adr/0082-a-moved-pieces-own-commands-go-from-the-piece-world-play-messages-stay-the-worlds.md)
amends that clause: world-play messages stay the world's; a command a moved piece owns, reading only
app state (the party now, chat later), goes from that piece. R37 stands as written.

#### Requirements (added)

47. **The run's end closes the party panel.** When the run ends for this player, meaning the first
    of the settlement record and the resolved card "The barrow keeps you" to appear in the run (the
    moment FS-WDM0X § Pass 2b E1 chimes `dialog_open`: a death or an escape, solo or in a party),
    the UI scene's party panel, if open, closes by itself. The reason: the panel now draws over the
    end's pieces, which stay the run's (R46), and with four members its ground swallows the top of
    WATCH THE DELVE and LEAVE THE BARROW and takes their presses (R40). **[owner, 2026-11-14:
    「Auto-close the party panel when the card appears」]**
    - **Silent.** FS-WDM0X **S4, "What the game closes plays nothing"**, whose first silent case is
      the run's end: no `party_close`, so the moment plays the end's `dialog_open` alone (E1, one
      end one sound). **[owner]**
    - **How.** The run shuts it in the party store, as the town shuts it for its letter panel
      (R39), outside any player action, so the interface sounds' window rule hears no close. No
      request kind is added: the panel's open state is app state (R37, ADR-0082). *Derived.*
    - **Once.** Only the end's first appearance closes it. The record rebuilt on a copy or a resize,
      the card redrawn on a resize, and the record brought back by SETTLEMENT (E2, E3) close
      nothing. A reconnect is a new start of the run (E2): its end appears anew and closes the
      panel again. *Derived.*
    - **Reopening.** The player reopens it with T or the Party icon under R38's rule, unchanged:
      while the run has not ended (a dead player watching the delve, an escaped one waiting); the
      run's `end_game`, an open chest or the menu refuse it, as today. **[owner]**
48. **The panel opening asks every world to close its letter panel.** The panel's `opening` sends
    `close: letter` to whatever world is reported; a world without one ignores it, by R11's rule (a
    request with no answer is ignored). The UI scene no longer names the town for it. The ready
    check's town-only rule (FS-BJNYC R4, R36) stands. *Derived* (review LOW).
49. **The gear overlay yields on a move only.** R41's `under` becomes `yields()`: whether a UI piece
    holds the pointer now (the bridge's `overUi`), read only as the pointer moves. A press and the
    wheel over a UI piece never reach a world (R7, R40), so the overlay's press and wheel stop
    reading it; what they did with it could not happen. *Derived* (review LOW).

#### Acceptance Criteria (added)

- [x] The first of the record and the card to appear in a run (a solo death, a solo escape, a death
      with a teammate in play, card or record first) closes an open party panel and plays
      `dialog_open` alone, no `party_close`; a closed panel stays closed and nothing more plays.
- [x] A later copy, a resize, and SETTLEMENT bringing the record back leave the panel as it is.
- [x] T and the Party icon reopen it after the end popped up while the run has not ended; after
      `end_game` they are refused as before.
- [x] The panel opening requests `close: letter` in every world; the town closes its letter panel,
      a field and the run answer nothing.
- [x] The gear overlay's hover and tip yield under a UI piece on a move; its press and wheel read no
      yield.
- [x] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass; the party
      parity set and the earlier sets stay pixel-equal.

#### Edge States (added)

- **A reopened panel can cover the end's buttons again.** Reopened over the card or the record, it
  stands over them as before R47, its ground taking the presses on the covered part. The player
  opened it; T, Esc or its × closes it. Nothing moves or reshapes the panel for the end. Named, not
  redesigned. **[owner: "keep it simple"]**
- **The panel opened between the card and a late record.** Opened after the card closed it, it is
  not closed again by the record that comes later: the end popped up once (R47, E1).
- **This supersedes, for the end's first popup only,** § Edge States (added)'s "The panel open as
  the run ends. As today: … the panel is closed by whatever closed it." The run's end still refuses
  T (R38).
- **Transitional, until phase 3: the frames over the gear overlay let the pointer through.** The
  frames (1000, now in the UI scene) draw over the character / stash panel's top-left corner (R46,
  As built), but their ground stays open (R40: a press on a frame reaches the world). So a press, a
  hover or the wheel there reaches the stash cells or the stats hidden under a frame: a hover lights
  and tips a cell the player cannot see, and a right-press there can move a hidden stash item.
  Accepted as transitional **[owner-level decision, 2026-11-14]**: phase 3 moves the gear overlay
  into the UI scene (1100 over the frames' 1000), which puts the frames under it again, and nothing
  of this branch merges to main before then. No code change. It is on the owner's check
  (I-TQZ5J-12).

#### As built (B1, 2026-11-14)

R47 in `BarrowspireScene.endPopsUp` (the one place E1 chimes): `dialog_open`, then
`usePartyStore.getState().closePanel()`. R48 in `partyPanelWiring`, which takes no world now. R49 in
`GearOverlay`'s `yields`. With them, `drawHudButton` takes its button as one object and
`mountPartyPanel` the panel's wiring whole (review LOWs, no behaviour change). The party parity set
rerun on the result: 186 of 186 pixel-equal, and R46's depth cases differ exactly as shot before (the
letter panel's 2700 px included). The earlier sets (corner, menu, dialogue, notices) were not rerun:
none of these changes draws or moves anything of theirs.

### Note 2026-11-14: which interface goes where (ADR-0083)

Appended after B1; the text above is not edited. It belongs to no one phase: it records where each
of today's pieces stands under [ADR-0083](../adr/0083-which-interface-goes-in-the-ui-scene-and-which-stays-in-the-world.md)
(owner, 2026-11-14: 「ok」; the frames rule 「任何ui都優先隊友列表」), so each later `## Change:`
here starts from it. It is a record, not a requirement: each phase's own section names what it moves.
The rule numbers are ADR-0083's (UI 1.1–1.3, world 2.1–2.3). Names and depths read on
feat/client-ui-scene, 65e9a42c.

| Class | Piece | Code | Depth today | Worlds |
|---|---|---|---|---|
| **Moved** | the corner row | `HudCorner` via `UiCornerRow` | 1000 | all |
| | the ESC menu, OPTIONS and the run's Fall confirm | `menuPanel`, `optionsPanel`, `UiMenuSlot` | 1999 blocker, 2000, 2001 | all |
| | the NPC dialogue card | `npcDialogue`, `UiDialogueSlot` | 2000 | town |
| | the notices: the town's and the field's line, the run's notifications | `uiSceneNotices` | 1000; 2000 | all |
| | the party panel and its invite field | `PartyPanel`, `partyInviteField` (DOM) | 1110; 1000 | all |
| | the invite prompt | `PartyInvitePrompt` | 1000 | all |
| | the ready check | `PartyReadyCheck` | 1000 | town |
| | the party frames with Travel | `PartyFrames` | 1000 | all |
| **Phase 3** | the gear overlay: inventory, character panel, stash | `GearOverlay` | 1100–1103; tips 2200; flash 2300 | all |
| | the container view (its coffer, satchel and bone heap faces) | `ContainerView` | 1000 | field, run |
| | the settlement record | `SettlementRecord` | 1600–1601 | run |
| **Later** | the minimap, its map mode icon and name | `minimap`, `minimapModeIcon`, `minimapName` | 1000 (overlay 920); 1001–1002; 1001 | all |
| | the mailbox: the envelope and the letter panel | `MailboxEnvelope`, `LetterPanel` | 1000; 1800, tip 2200 | town |
| | the ability and potion bars | `AbilityHud`, `PotionHud` | 1000 | field and run; run |
| | the target frame | `targetFrame` | 1000 | run |
| | chat | `ChatWindow`, `chatInputField` | 1000–1002 | all |
| | the ResourceHud and ProgressHud bars | `ResourceHud`, `ProgressHud` | 1000 | field and run; town and run |
| | the ArrivalCard | `arrivalCard` | 960–961 | all |
| **Stays in the world** | name plates and monster health bars | `render/markers` (`MARKER_DEPTH`) | 950, 951 | all |
| | the function markers (a function NPC's or the stash's plate and sigil) | `render/markers/npc`, the town | 950 | town |
| | damage numbers | none drawn today (a hit is a tint, `render/effects/hit`) | | |
| | the open bar of a timed open, over its container | `ui/openBar`, the run | 951 | run |
| | interact prompts over objects | none drawn today | | |
| | the resolved card ("The barrow keeps you") | the run's `resolvedCard` | 1500 | run |
| | WATCH THE DELVE and LEAVE THE BARROW | the run's buttons | 1000 | run |
| | FallenCountdown | `fieldFallen`, the field | 1000 | field |
| | the controls panel | the run's `controlsPanel` | 1200 | run |
| | fog, darkness, aim lines | `render/world/fog`, `blackout`, `render/lighting/LightMap`, `render/effects/aimLine` | 500; 500; 135–136; 940 | fog: run; blackout: town, run; light-map: all; aim line: with the class kit's effects |

Corrections to the table as drafted, each from the code:

- **The coffer timed-open bar** is the open bar of any timed open, drawn over the shut container
  the player stands at (FS-MQYEX §D), not the coffer's alone. The coffer is one of the container
  view's three faces.
- **Interact prompts over objects** and **damage numbers** are not drawn today. They stay in the
  table as the rule's examples (2.1) for when they come. What is drawn over objects today is the
  function markers, added to the table.
- **Notices** are not all at 2000: the town's and the field's line stand at 1000 (over the corner
  row by being added after it, A2 R28), the run's notifications at 2000.
- **The container view** is at 1000, not in the windows' 1100–1800 band.

**The frames rule, against the code.** The frames are not yet lowest in the UI scene: they share
1000 with the corner row, the invite prompt, the ready check, the invite field and the notice line,
drawn in the order added (each world's corner row is built before its party pieces). Phase 3 puts
them under every other UI piece, puts the container view over them in the windows' band, and gives
each moved window a ground of its own (`uiGround`, as R40), so that the frames sit under every window
and a press, hover or wheel there passes through to neither Travel nor the world. That is phase 3's
acceptance criterion by ADR-0083, and it ends B1's transitional edge state.

**Open under the overlap rule.** The run's controls panel stays in the world (2.3) but meets the
party panel today (R46, As built), and nothing in the run avoids it. It needs an avoidance or a move;
this note does not choose.
