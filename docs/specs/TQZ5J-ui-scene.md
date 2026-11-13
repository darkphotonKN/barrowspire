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
   stays at its default `true`; nothing turns it off. The UI scene never turns on pointer polling
   (`setPollAlways`, `setPollRate`). **[charter P4; spike (a)]**

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
21. **One owner per key.** A key is acted on by exactly one scene at any moment:
    - **Keys the UI scene owns outright** (Esc in phase 1): no world scene binds them.
    - **Keys shared by state** (Enter, 1–3, ←/→): the UI scene acts only while its menu slot is
      filled, and the world's handlers stay guarded by `menuOpen` (R10), as they are by `this.menu`
      today.
    - **Belt and braces:** on a keydown it acted on, the UI scene calls the event's
      `stopPropagation()`, so no world scene's handler or `Key` hears it. It never stops a keyup:
      a key held as the menu opens (a stride) is still let go in the world.
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
      `UiSounds`, and no longer bind Esc.
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
  release reaches the world as a `pointerup` with no press before it, which no world handler acts on
  (the run's Shadow Shot releases only a hold it started). **[spike (a)]**
- **A key held while the pointer rests on the interface**: the world still hears it (no pointer
  polling in the UI scene, R7). **[spike (b)]**
- **The menu open and the player dies, escapes, or the run ends**: R20.
- **A dialogue opening under an open menu** cannot happen today (the menu refuses talk); if a report
  ever says so, the menu yields (R20).
- **Leaving /game with the menu open**: the game is destroyed, the UI scene and the interface with
  it; no listener survives (R4).

## Spike findings

(Folded in from the P8 spike; see below.)

## Out of Scope

- Phases 2–7 (the gear overlay, party panel, minimap, mailbox, the run's HUD, chat), and the
  corner hotkeys I, B, C, T and M, which move with their windows.
- Any change to what the interface looks like, says or does.
- The disconnect notice (stays its own scene, over the UI scene).
- The main menu and character creation's own canvas menus.
- The server.
