# FS-28DDG: Music in the hub

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Sound" → "Music in the hub", "Turn the music on or off" → this FS · Owners carrying a stub: [FS-G4VMQ](G4VMQ-switch-character-and-leave-queue-from-hub.md) (R3, the town's ESC menu gains a row) · Related ADRs: [ADR-0059](../adr/0059-scene-scoped-atlas-groups-are-evicted-with-their-animations-once-the-next-scene-has-loaded.md) (scene-scoped loading; its scope is atlas groups, followed here in spirit only), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (the ESC menu is canvas chrome on the game palette) · Builds on: `game-client/src/components/gameAudio.ts` (one page-wide `AudioContext` handed to every game; merged f5c2827f; its contract is unchanged here), [FS-29KSH](29KSH-hub-world-and-delve-entry.md) R15, R36 (one place switches scenes), [FS-C4JWH](C4JWH-scene-scoped-art-loading.md) (a world's own `preload()` and torch bar) · Surface: game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (no new terms; the screen says **town**, code says **hub**) · Charter: approved by the owner 2026-11-13; every decision below is **[charter default]** with its reason, D2's mp3-only by owner override (「那只給mp3可以嗎」 → yes)

## Summary

The town has music. When a player is in the hub, the owner's village track (`/audio/music/village.mp3`)
loops quietly underneath, fading in on arrival and fading out when they leave for the Spire, a
field or the roster. The town's ESC menu gets one more row to silence or restore it, and this
browser remembers the choice. It is the game's first sound. No other world plays anything, and no
sound effects come with it.

## Requirements

### A. Where and when it plays

1. **Only in the hub.** The music plays while HubScene runs, town buildings included (they are
   inside HubScene). The main menu, the roster, character creation, a run and a field play none.
   **[charter default D1]** Reason: the smallest v1 that gives the town a voice.
2. **Fade in on entering the hub.** Every entry to the hub (from the main menu, back from a run or
   a field, a hub restart) brings the music up from silence to its volume over
   `MUSIC_FADE_IN_MS` (tunable, 2000 ms). The fade begins when the music can first be heard
   (R10), not when the scene starts, so a player who must click first still hears it rise.
3. **Fade out and stop on leaving the hub.** When HubScene stops for any other world scene or the
   main menu, the music falls to silence over `MUSIC_FADE_OUT_MS` (tunable, 1000 ms), then stops.
   The fade outlives the hub: `switchWorld` stops HubScene before the next world starts, and a
   scene's tweens and clock stop with it, so the fade is not driven by HubScene's tweens or timers.
   It runs on something the game keeps across scenes (the game's step, or the sound's own Web
   Audio gain).
4. **One track, one copy.** At most one instance of the music exists per game. A hub entered while
   the previous visit's fade-out is still running takes that same sound back up from its current
   volume to full, at its current place in the track. It never starts a second copy over it.
5. **From the top each new visit.** A hub entered after the music had stopped starts the track
   from its beginning.

### B. Format and loop

6. **mp3 only.** The track is loaded from `/audio/music/village.mp3` alone, with no ogg or other
   alternative. **[charter default D2, owner override]** Reason: every browser the game targets
   decodes mp3, and the owner supplied only the mp3.
7. **Seamless loop.** The sound loops with Phaser's own looping (`loop: true`; Phaser 4.2.1's
   `WebAudioSound` schedules a second buffer source at the end, which is gapless on the buffer
   decoded). v1 adds nothing more. **[charter default D2]** Reason: an mp3 carries encoder
   padding (this file: 576 priming + 576 remainder frames, `afinfo`), which some browsers keep in
   the decoded buffer; whether that is audible is the owner's listening check (Edge States), and
   its fix is known and small, so v1 does not pre-build it.

### C. Volume

8. **Fixed at 0.4.** The music's own volume is `MUSIC_VOLUME` (tunable, 0.4), set on the music's
   sound, never on the sound manager's master volume or mute, so sound added later is not turned
   down with it. No volume setting in v1. **[charter default D4]** Reason: quiet enough that later
   sound effects are never drowned.

### D. Autoplay and focus

9. **No prompt.** Nothing on screen asks the player to enable sound. **[charter default D3]**
   Reason: Phaser's Web Audio unlock (`WebAudioSoundManager#unlock`: the first `mousedown`,
   `mouseup`, `touchstart`, `touchend` or `keydown` on `document.body` resumes the context) already
   does it.
10. **It starts as soon as the browser lets it.** The music is started on entering the hub whether
    or not the context is running yet. A context still suspended (a page reloaded straight onto
    /game, no gesture since) holds it silent until the first click or key, and the fade-in (R2)
    starts from that moment. A page that already had a gesture (the player clicked through login
    and the roster) may hear it at once on entering the hub. Either way is correct.
11. **Focus is Phaser's default.** Losing the window's focus pauses all sound and regaining it
    resumes it (`pauseOnBlur`, default `true`; `onBlur` suspends the context, `onFocus` resumes
    it). No code is written for this. **[charter default D7]** Reason: the default is the
    behavior wanted.

### E. Loading and freeing

12. **Loaded by the hub, not at boot.** HubScene's `preload()` queues the track
    (`load.audio`), next to its art, so the hub's torch bar counts it. PreloadScene does not load
    it. **[charter default D6]** Reason: scene-scoped like the art (ADR-0059's spirit): the menus
    and other worlds never pay for it.
13. **Freed once the hub is left.** When the fade-out (R3) has ended and HubScene is neither
    running nor loading again, the music's sound is destroyed and its decoded buffer removed from
    the audio cache (about 39 MB decoded: 4,838,400 frames × 2 channels × 4 bytes). The next hub
    entry loads it again, from the browser's HTTP cache when it still has it. A hub re-entered
    before the fade-out ends keeps it (R4), and its `load.audio` is skipped because the key is
    still cached.
14. **A failed load costs only the music.** If the file is missing, cannot be decoded, or the
    browser cannot play mp3 (`AudioFile` warns "No audio URLs … can play on this device"), the hub
    enters and runs exactly as without music. The music is never added when its key is not in
    the audio cache (`WebAudioSound` throws "Audio key … not found in cache"), and nothing is
    shown to the player.

### F. On and off

15. **One row in the town's ESC menu.** The hub's ESC menu (FS-G4VMQ R3) gains an actionable row,
    after *Leave the queue* when present and before *Back*: **Silence the music** while the music
    is on, **Let the music play** while it is off. Amber like the other actionable rows, with its
    number key by the menu's existing rule (`[2]`, or `[3]` while queued). **[charter default
    D5]** Reason: music without a way to stop it is intrusive. Copy is a verb, as the menu's
    other rows are, in the lore voice's terse register (design-guideline "Copy voice").
16. **Pressing it switches the music and keeps the menu open.** *Silence the music* fades the music
    out (R3's fade) and leaves it stopped; *Let the music play* starts it and fades it in (R2).
    The menu is rebuilt in place with the other label, so the player sees the new state at once.
    A second press switches it back.
17. **Remembered in this browser.** The choice is kept in `localStorage` under
    `barrowspire_music` (`"on"` | `"off"`), read when the hub is entered and written on each
    press. Every read and write is wrapped in `try`/`catch`, as `ui/minimapMode.ts` does, and
    anything unreadable or absent is **on**. It is per browser, not per account or character, and
    nothing is sent to the server.
18. **Off means silent, not merely muted.** While the setting is off, entering the hub does not
    start the music. The file is still loaded (R12), so turning it on plays at once.
19. **The field's ESC menu is unchanged.** It shares `hubMenuChoices` (FS-G4VMQ § Change: The ESC
    menu in a field world) and keeps *Change character* and *Back* only. No music plays in a
    field, so it offers no music row. The run's ESC menu (FS-9K8EZ) is unchanged too.

### G. Ownership

20. **One module owns the music.** A new client module under `game-client/src/audio/` holds the
    music's lifecycle (enter, leave, on, off; the fades; freeing) and the setting's storage. Its
    decisions (what plays, at what volume, when to free) are Phaser-free and tested without a
    browser; HubScene only tells it that the hub was entered or left and what the menu row
    pressed. HubScene adds no fade or sound logic of its own.
21. **Per game, never across games.** The module holds a sound of one `Phaser.Game`. Leaving /game
    destroys that game and its sound manager. On a scene end of `"destroy"` (`sceneEnd.ts`) the
    module asks the sound manager nothing and lets go of its reference. A later game (coming back
    to /game) starts clean and never touches the old game's sound.
22. **`gameAudio.ts` is unchanged.** The music plays through the page-wide context that module
    hands Phaser. No game config changes.

## User Stories

1. As a player entering the town, I want quiet music to rise under it, so that the town feels
   like a place and not a test map.
2. As a player, I want the music to fade rather than start or stop abruptly, so that arriving and
   leaving feel deliberate.
3. As a player stepping into the Spire, I want the town's music to fall away behind me, so that
   the delve starts in its own silence.
4. As a player heading out to a field, I want the town music gone there, so that the field
   doesn't sound like the town.
5. As a player coming back from a run or a field, I want the music to fade back in, so that
   returning feels like coming home.
6. As a player walking into the Inn or another town building, I want the music to carry on, so
   that the town stays one place.
7. As a player who stays in town a long time, I want the track to loop without a break, so that I
   don't notice where it ends.
8. As a player, I want the music quiet enough that it never fights what I'm doing, so that later
   sounds can be heard over it.
9. As a player who just reloaded the page, I want the music to start the moment I click or press
   a key, without a prompt in my way, so that sound never blocks play.
10. As a player who already clicked through login and the roster, I want the music in the town at
    once, so that I don't have to click again for it.
11. As a player who alt-tabs away, I want the music to pause and pick up when I come back, so
    that it doesn't play to an empty room.
12. As a player who doesn't want music, I want a choice in the ESC menu to silence it, so that I
    can play in quiet.
13. As a player who silenced it, I want the menu to say so and offer it back, so that I can tell
    which state it is in.
14. As a player, I want my choice remembered the next time I open the game in this browser, so
    that I don't silence it every visit.
15. As a player whose browser blocks storage (private window, blocked site data), I want the game
    to work anyway with the music on, so that a storage refusal never breaks the town.
16. As a player switching character, I want the music to fade as I go to the roster, so that the
    roster stays silent like the other menus.
17. As a player travelling to my leader's town, I want the music to carry on through the hub's
    restart rather than start again over itself, so that I never hear two copies.
18. As a player on a slow connection, I want the town's loading bar to include the music, so that
    the town doesn't start silent and then jump in later.
19. As a player whose browser can't load or decode the track, I want the town to work as before,
    silent, so that missing music costs nothing else.
20. As a player in a field or a run, I want the ESC menu as it was, so that there is no music
    choice where no music plays.
21. As a player who leaves /game for the marketplace and comes back, I want the music to work
    again with no error on the page, so that navigating the site is safe.
22. As the owner, I want the music loaded only when the town is entered, so that the menus and the
    other worlds don't pay for it.
23. As the owner, I want the music freed once the town is left, so that a run doesn't carry the
    town's decoded audio.
24. As the owner, I want the volume and fade lengths as named tunables, so that I can retune them
    without a spec change.
25. As the owner, I want to listen to the loop point myself, so that a gap or click is caught
    before players hear it.

## Acceptance Criteria

### A. Where and when

- [ ] Entering the hub (from the main menu, a run, a field, a hub restart) starts the music at
      volume 0 and ramps it to 0.4 over 2000 ms once the context runs. Tested on the module with
      a fake sound and a fake clock.
- [ ] Leaving the hub (the scene's `"shutdown"`) ramps it from its current volume to 0 over
      1000 ms and then stops it, with the ramp still advancing after HubScene has stopped (it is
      not on HubScene's tweens or clock).
- [ ] A hub entered during that fade-out ramps the same sound back up from its current volume.
      No second sound is added, and the track does not restart.
- [ ] A hub entered after the music stopped starts the track from 0 s.
- [ ] No other scene (MainMenu, CharacterCreation, Barrowspire, Field) starts the music.

### B. Format, loop, volume

- [ ] HubScene's `preload()` queues `load.audio` for `/audio/music/village.mp3` only, under one
      key. PreloadScene queues no audio.
- [ ] The sound is added with `loop: true`, and its target volume is `MUSIC_VOLUME` = 0.4. The sound
      manager's `volume` and `mute` are never written.
- [ ] `MUSIC_VOLUME`, `MUSIC_FADE_IN_MS` and `MUSIC_FADE_OUT_MS` are named exports of the music
      module.

### C. Autoplay and focus

- [ ] Nothing on screen asks for sound. A suspended context leaves the music silent, and its
      fade-in begins when the context first runs (Phaser's unlock), not before.
- [ ] No blur or focus handling is added. The game config's sound settings are unchanged
      (`pauseOnBlur` default).

### D. Loading and freeing

- [ ] Once the fade-out has ended and HubScene is neither running nor loading, the sound is
      destroyed and the key removed from `cache.audio`. A hub entry while the key is still cached
      skips the download.
- [ ] A missing, undecodable or unplayable file leaves the hub entering and running normally. No
      sound is added for an uncached key, nothing throws, and nothing shows on screen.
- [ ] On a scene end of `"destroy"` the module calls nothing on the sound or the sound manager.
      Leaving /game and returning plays the music in the new game with no error on the page.

### E. On and off

- [ ] `hubMenuChoices` takes the music state. With it on, the hub's menu reads *Change character*,
      [*Leave the queue*], **Silence the music**, *Back*. With it off, the third row reads **Let
      the music play**. Called without it (the field), the choices are unchanged: `["change",
      "back"]`.
- [ ] Pressing the row (click or its number key) switches the music (fade out or fade in), writes
      the setting, and rebuilds the menu in place with the other label.
- [ ] The setting is read from and written to `localStorage["barrowspire_music"]` as `"on"` /
      `"off"`. A throwing or absent store, or any other value, reads as on, and a throwing write
      is swallowed.
- [ ] With the setting off, entering the hub plays nothing. Turning it on there fades it in.
- [ ] The field's and the run's ESC menus are unchanged.

### F. Housekeeping

- [ ] `game-client/src/components/gameAudio.ts` is unchanged. No server, proto or gateway file
      changes.
- [ ] `game-client/public/audio/music/village.mp3` is committed (the root `.gitignore` un-ignores
      `game-client/public/audio/`).
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .` and `npm run lint`
      pass.
- [ ] The owner's listening check passes (the HITL slice).

## Edge States

- **Locked context.** A page reloaded straight onto /game has no gesture: the context is
  suspended and the music is silent until the first click or key on the page. Phaser resumes the
  context, and the fade-in starts then (R10). Before that the module must not treat the music
  as audible.
- **Context already running.** After client-side navigation (login → /game), the context may run
  as soon as it is built. The music is heard on entering the hub with no click. Phaser 4.2.1
  still counts itself `locked` until its own unlock handler sees a gesture inside this game
  (`createAudioContext` calls `resume()`, then reads `state === 'suspended'` before that resolves),
  and `onBlur` skips the suspend while `locked`. So in this window, before the player's first click
  or key in the game, a blur does not pause the music. The first click or key, which every player
  makes to move, ends it. Accepted. D7's "no extra code" stands.
- **Loop point.** If the owner's listening check hears a gap or click where the track wraps (the
  mp3's 576 priming / 576 remainder frames kept in the decoded buffer), the fix is a Phaser sound
  marker (`addMarker({ name, start, duration, config: { loop: true } })`, played by name) that
  starts past the leading padding and ends before the trailing padding. It is written back as a
  `## Change:` on this FS. v1 does not pre-build it. **[charter default D2]**
- **Hub restart.** A `world_entered` for the hub while in the hub (a hub handoff, a reconnect)
  stops and starts HubScene in one go. The stop begins the fade-out and the start takes it back up
  (R4). The listener hears the volume dip briefly, never a second copy and never a restart from 0 s.
- **Leaving while still loading.** HubScene stopped during its preload never started the music.
  The module has nothing to fade. A load that later completes leaves the key cached, and it is
  freed on the next leave or used on the next entry.
- **Freed while loading again.** If the fade-out ends while HubScene is loading for a new visit,
  the music is not freed (R13). The new visit uses it.
- **Two leaves in a row.** A leave while already fading out (or stopped) changes nothing.
- **Toggled during a fade.** *Silence* during a fade-in reverses it to a fade-out from the current
  volume. *Let the music play* during a fade-out (off pressed, then on) reverses it to a fade-in.
  Never two sounds.
- **Toggled off, then leave.** Nothing is playing. Leaving frees it as usual.
- **Setting changed in another tab.** Read on each hub entry. A tab already in the hub keeps its
  own state until its next entry or press. No `storage` event listener in v1.
- **Storage refused.** Private windows, blocked site data or a throwing `localStorage` accessor
  read as on, and writes are lost silently. The press still switches the music for this visit.
- **Window loses focus.** Phaser suspends the context and resumes it on focus (R11). A fade in
  progress keeps its own schedule against the game's step and may finish while unheard.
- **Disconnect notice over the town.** The music plays on under the notice (FS-R6EYZ) until the
  hub stops ("Return to menu"), then fades out.
- **Leaving /game.** The game is destroyed and its sound manager destroys every sound. The module
  touches nothing (R21), and `gameAudio.ts` suspends the shared context as before. A fade in
  flight is dropped with the game.
- **No Web Audio.** A browser without `AudioContext` gets Phaser's HTML5 audio fallback
  (`gameAudio()` returns `{}`). The module works through the same `scene.sound` surface, and if
  that fallback cannot play the file, R14 applies.
- **mp3 unsupported.** `load.audio` adds no file. R14 applies.
- **Decoded size.** About 39 MB of decoded audio is held while the hub runs and briefly after it,
  in main memory, not the GPU. It is not counted in FS-C4JWH's texture figures.

## Out of Scope

- Music anywhere but the hub: the main menu, the roster, runs, fields, a different track per
  town building.
- Sound effects of any kind (footsteps, combat, UI clicks, ambience).
- A volume setting or slider, a master volume, a sound settings screen, and a separate mute for
  all sound.
- An ogg (or any second) encoding, and format negotiation.
- Pre-building the loop marker (an Edge State fix if the listening check needs it).
- Crossfading between tracks, a playlist, or music that reacts to time of day, party or danger.
- A server-side or per-account setting. The choice is per browser.
- Skipping the download when the music is off.
- Changing `gameAudio.ts`, the game config, the ESC menu's chrome (`showMenuPanel`), the field's or
  the run's ESC menu.
- Any server, proto or gateway change.
