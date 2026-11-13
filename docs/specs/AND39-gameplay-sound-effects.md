# FS-AND39: Gameplay sound effects

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Sound" → "Gameplay sound effects" → this FS · Related ADRs: [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (its spirit: art authored in code, never sourced; no ADR on audio) · Builds on: [FS-WDM0X](WDM0X-interface-sound-effects.md) (the player's rules S11, S12, S22; the Sound effects level, `audio/sfxSetting.ts`; `sceneUiSoundStage`), [FS-28DDG](28DDG-music-in-the-hub.md) (unchanged), `game-client/src/components/gameAudio.ts` (one page-wide `AudioContext`; unchanged), [FS-1819Q](1819Q-dev-gallery.md) (the dev route's production 404) · Surface: game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (no new terms; "sound effect" is plain English; the screen says **town**, code says **hub**; a container's view is the **coffer** view) · Charter: approved by the owner 2026-11-14 ("run the full loop and accept yourself"). Every decision below is **[charter default]**, owner-approved 2026-11-14 via charter, with its reason. A rule marked *Derived* applies a default to a case the charter did not name.

## Summary

The world answers the player's hand with sound. A monster struck in view thuds, the player's own
wound thuds deeper, and each class's ability sounds as the player casts it. A chest's lid creaks
open, a sack or a drop pile rustles, the town's stash lid knocks, and an item taken into the bag or
moved between slots sounds of leather and iron. There are 11 effects, all built in code as numbers
and never sourced as files. They play at the existing Sound effects level. A dev-only sound board
plays each one for the owner's ear.

## Facts (verified 2026-11-14 on feat/client-sound-effects, cut from 8ea8dc09)

- **Phaser plays a hand-made buffer.** In Phaser 4.2.1, `WebAudioSound`'s constructor reads
  `manager.game.cache.audio.get(key)` as its `audioBuffer` and throws if it is absent. `play` sets it
  as a buffer source's `buffer`. The loader (`AudioFile.onProcess`) and
  `WebAudioSoundManager.decodeAudio` both store a decoded `AudioBuffer` with `cache.audio.add(key,
  buffer)`. An `AudioBuffer` added under a key by hand therefore plays as a loaded one does. The
  HTML5 audio manager keeps audio tags in that cache instead, and has no `context`.
- **One context.** The game is built with `audio: gameAudio()` (`components/PhaserGame.tsx`), the
  page's one `AudioContext`. `scene.sound.context` is that context under Web Audio. Nothing in
  the client makes an `AudioBuffer` today.
- **The interface effects' player.** `audio/uiSounds.ts`: keys are `sfx:<name>` (`uiSoundKey`).
  `UiSounds.play` reads the kept level at each play (`readSfxLevel`). It plays nothing at level 0,
  while the context is not running (`audible()`), or when the key is not cached. It keeps one sound
  per key, restarted on a repeat, and passes `sfxGain(level)` as the play's `volume`.
  `sceneUiSoundStage(scene)` is its Phaser stage. Each world scene makes one in `create`
  (`mountUiSounds`: HubScene ~984, FieldScene ~385, BarrowspireScene ~3297). The 11 interface
  names and the 11 here are disjoint.
- **Boot.** `PreloadScene.preload` queues the resident art and `preloadUiSounds`. `create` starts
  `MainMenuScene`.
- **A monster's hit.** `MonsterRoster.sync` (`render/creatures/monsters.ts` ~583) computes `hit`:
  health below the last state's, with the sprite shown. It then flashes. A monster first seen,
  one coming back into the broadcast and one hidden by the hide rule or the fog have no `hit`. The
  roster takes a `MonsterEffects` (today only `claw`). The run builds it at BarrowspireScene ~3232
  from `this.monsterEffects` (~959), and the field in `fieldCombatOnScene` (`scenes/fieldCombat.ts`
  ~216). The server does not say who struck or with what.
- **The player's own wound.** Run: `handleGameStateUpdate` (BarrowspireScene ~3893) flashes the
  own body when `health.current < this.ownHealth.current`. `ownHealth` is unset before the first
  state. Field: `FieldCombat`'s state read (`fieldCombat.ts` ~110) flashes any player, own or
  teammate, whose health is below their `lastHealth`. `current_player` is always this client's
  own player, also while it watches a teammate in the run.
- **Casts.** `render/combat/playerCombat.ts` is shared by the run and the field:
  - A warrior's `special` sends `dash`, then calls `look.dash`.
  - A mage's `special` sends `triple_fireball`, then calls `look.fireball`, the same call as the
    mage's primary fireball. `look` alone cannot tell them apart.
  - An archer's right button only starts the hold. `releaseAim` sends `shadow_shot` and calls
    `look.shadowShot` only on a ready, affordable release.
  - A mercenary's `parry` sends and calls `look.parry`, unless `parryRefused` holds it back.

  `special` runs only off the client's own cooldown (`canCast`). The server may still refuse a
  sent cast. The run's `CombatLook` is BarrowspireScene ~875–898; the field's is `fieldCombat.ts`
  ~228–256. Other players' casts reach this client only as their projectiles and state.
- **Coffer opens.** `ContainerView.open` (`ui/ContainerView.ts` ~421) is called only for this
  client's own open:
  - In the run, `updateContainers` (~2554) calls it on the state that shows a container open that
    the player reached for (`is_open && reaching`), which also ends a timed open (FS-MQYEX).
    `toggleChest` (~3026) calls it at once for a container the last state already shows open,
    which every drop pile is (FS-4R9M9 R61).
  - In the field, `FieldPiles` opens a drop pile at once (`fieldPiles.ts` ~139). It opens a chest
    or a sack in `followReach` (~249) on the state that shows it open.

  The kinds are `chest`, `sack` and `drop_pile`; an unknown kind is a chest (`placedKind`).
- **Pickups.** `ContainerView.looted` calls `options.onLoot(item)` only for a shown item, and only
  when `mayTake` (the bag has room) allows it, by a click or F. The run's `lootChestItem` (~3092)
  always sends. The field's `lootFromSatchel` (FieldScene ~794) sends only when `FieldPiles.loot`
  returns true. It returns false for a pile reserved for someone else, and shows words instead.
- **Gear.** The run and the field use `ui/EquipmentHud.ts` (built at BarrowspireScene ~3462 and
  FieldScene ~594):
  - `panel.onEquip` sends `Equip`. An equip over a worn item is a swap.
  - `panel.onUnequip` runs only after `mayUnequip` (room in the bag).

  The town uses `ui/HubGear.ts` (HubScene ~3201). There, `onEquip`, `onUnequip` and `onMove` (the
  stash↔bag moves) each go through `send`, which returns false while a change is in flight or a
  status shows.
- **The stash.** The town's E at the stash chest runs `this.act(() => this.gear?.openStash())`
  (HubScene ~1548). `HubGear.openStash` returns false when the inventory is already open, and
  FS-WDM0X S2 plays `inventory_open` for it.
- **The dev route.** `/dev/gallery` answers 404 in a production build (`app/dev/gallery/page.tsx`).
  Its families (`dev/gallery/families.ts`: `effects`, `item-icons`) are visual pieces
  (FS-1819Q R3).

## Requirements

### A. The effects and when they play

R1. **Eleven effects.** **[charter default]**

| Effect | Plays when | Worlds |
|---|---|---|
| `hit_monster` | a monster in view loses health, struck by anyone, with anything | run, field |
| `hit_player` | this client's own player loses health | run, field |
| `chest_open` | the coffer view opens for the player's own open of a chest | run, field |
| `loot_open` | the coffer view opens for the player's own open of a sack or a drop pile | run, field |
| `stash_open` | the player's E opens the town's stash | town |
| `item_pickup` | the player takes an item from an open coffer into the bag | run, field |
| `item_swap` | the player equips, unequips or swaps gear, or moves an item between stash and bag | run, field, town |
| `dash` | the player casts the warrior's Dash | run, field |
| `triple_fireball` | the player casts the mage's Triple Fireball | run, field |
| `shadow_shot` | the player's archer releases Shadow Shot | run, field |
| `parry` | the player's mercenary raises the parry | run, field |

R2. **`hit_monster` is any monster's health drop in view.** It plays where `MonsterRoster.sync`
    finds `hit`, in the run and the field. One sound covers every source: the player's,
    a teammate's, melee, a projectile or a spell. A monster first seen, one back in the broadcast,
    and one hidden by the hide rule or the fog play nothing (Facts). **[charter default]** Reason:
    the server does not say melee from ranged.
    - *Derived:* the killing blow is a drop, so it plays `hit_monster`. A death sound is out of
      scope.
    - *Derived:* several monsters hit in one state restart the one sound (R13), so that state is
      heard once.
R3. **`hit_player` is the player's own drop only.** It plays where the run's own-health check
    (BarrowspireScene ~3893) and the field's own entry in `FieldCombat`'s state read
    (`fieldCombat.ts` ~110) find a drop. A teammate's drop flashes as today and plays nothing. The
    first state after entering or reconnecting has nothing to compare, so it plays nothing. A rise
    (a potion, a respawn) plays nothing. **[charter default]**
R4. **The four abilities are the player's own, at the cast.** **[charter default]** Reason: other
    players' casts are not visible to this client.
    - `dash` plays as the warrior's `dash` is sent.
    - `triple_fireball` plays as the mage's `triple_fireball` is sent. The mage's primary
      fireball plays nothing.
    - `shadow_shot` plays as a release fires `shadow_shot`. A hold that is cancelled or released
      unready plays nothing. So does the draw.
    - `parry` plays as `parry` is sent. A parry `parryRefused` holds back plays nothing.

    It happens in `render/combat/playerCombat.ts`, so the run and the field share it. *Derived:*
    `look.fireball` is shared with the primary (Facts), so `PlayerCombat` reports the four casts
    through a hook of their own, called once at each send. A cast the client's cooldown holds back
    sends nothing and plays nothing.
R5. **`chest_open` / `loot_open` are the player's own open, as the coffer view opens.** They play
    as `ContainerView.open` runs, so a timed open sounds when it opens, not when it starts.
    `chest_open` is for a chest (and an unknown kind, read as a chest); `loot_open` is for a sack
    or a drop pile. Another player's open changes only a container's drawn frame and plays nothing.
    **[charter default]** Reason: the open is server-confirmed (`is_open` with the player's reach).
    - *Derived:* a drop pile is always open (Facts), so the player's reach opens its view at
      once. The view also opens at once for a chest or sack the last state already showed open.
      Both are server-confirmed opens, so both play. Opening `ContainerView` is the one point every
      own open passes through, in both worlds.
R6. **`stash_open` plays alongside `inventory_open`.** When the town's E opens the stash
    (`openStash` returns true), `stash_open` plays as well as FS-WDM0X's `inventory_open`. The
    first is the chest's lid in the world; the second is the window. An E that `openStash` refuses
    plays neither. **[charter default]** Reason: the world and window layers differ, and FS-WDM0X
    stays untouched. FS-WDM0X S3's "one press, one sound" governs the interface effects only.
R7. **`item_pickup` and `item_swap` play on the player's action, as the panel moves the item.**
    **[charter default]**
    - `item_pickup` plays as the coffer view hands an item to the scene to take (`onLoot`, by a
      click or F) and the scene sends it. In the field, a reserved pile's refusal
      (`FieldPiles.loot` false) plays nothing. A take that `mayTake` refuses (a full bag) never
      reaches `onLoot` and plays nothing.
    - `item_swap` plays as `EquipmentHud`'s `onEquip` and `onUnequip` send (run, field), and as
      `HubGear`'s `onEquip`, `onUnequip` and `onMove` send (town). A change `HubGear.send` drops
      (one in flight, a status showing) plays nothing. So does an unequip `mayUnequip` refuses.
    - A refusal from the server, after the send, plays nothing more.
R8. **Nothing else plays.** No other event plays one of these 11 effects, and no FS-WDM0X effect
    or FS-28DDG music changes its behaviour. **[charter default]**

### B. Built in code

R9. **Each effect is a pure, seeded, deterministic generator.** Each effect is rendered by a
    function of the sample rate alone. It returns mono `Float32Array` samples and reads neither
    Phaser nor Web Audio, so vitest tests it as it is. Its randomness (noise, crackle, jitter) comes
    from a seeded PRNG in the module, seeded per effect; `Math.random` is never used. The same rate
    gives the same samples on every call and every boot. **[charter default]** Reason: the
    build-art-in-code rule (ADR-0021 spirit), tunable as numbers, no files.
R10. **Simple but medieval rustic.** Every effect is made of wood, leather, iron, cloth and flesh
     sounds: filtered noise bursts, low body thumps, damped resonances, inharmonic metal partials,
     plucked string decays. None is a synth beep, a pure tone melody, a chirp or chiptune.
     **[charter default]** The starting character of each is *Derived*; the numbers are the
     tunables, and the owner's listening check judges them:

| Effect | Starting character |
|---|---|
| `hit_monster` | a dull flesh-and-leather thud: a short low thump under a brief slap of noise |
| `hit_player` | heavier and lower than `hit_monster`, with a gritty crunch, so the two are told apart |
| `chest_open` | a wooden lid: a short hinge creak, then a hollow wood knock |
| `loot_open` | cloth and leather: a soft rustle of a sack or a heap being opened |
| `stash_open` | a heavier, iron-bound lid than `chest_open`: creak, an iron clink, a deep wood thump |
| `item_pickup` | a leather pouch taking something in: a soft thump and a short rustle |
| `item_swap` | a buckle and strap: a small iron tick over a leather creak |
| `dash` | a heavy stride: a boot stamp and a rush of cloth |
| `triple_fireball` | a roaring whoomp of flame: a low noise swell with crackle |
| `shadow_shot` | a bowstring's release: a plucked low string with a wooden limb's knock |
| `parry` | steel on steel: a short, bright iron ring with a quick decay |

R11. **Short, clean, and at one ceiling.** **[charter default]**
     - Each effect lasts at most 0.6 s.
     - It starts and ends at zero (a short fade at each end, so no click).
     - Every sample is finite.
     - It is peak-normalised so its largest absolute sample equals `GAMEPLAY_SFX_CEILING ×` its
       trim.
     - `GAMEPLAY_SFX_CEILING` starts at 0.7 and each trim at 1.0 (tunables, named exports in a
       table keyed by effect). A trim lies in (0, 1].
     - Their length, seed and recipe numbers live in that table too, so a retune is `Tunes
       FS-AND39`.
     - *Derived:* the 0.7 start leaves headroom for overlapping effects, since Web Audio clips at
       the output.

### C. Loading

R12. **Installed at boot, resident everywhere.** `PreloadScene` renders each effect at the
     context's sample rate, copies it into an `AudioBuffer` made on that context, and adds it to
     the game's audio cache under `sfx:<name>`. No world frees or rebuilds one. **[charter
     default]** Reason: plays go through FS-WDM0X's player rules, and the first event in any world
     can sound.
     - Without Web Audio (Phaser's HTML5 fallback, or no audio), nothing is installed, and every
       gameplay effect is silent (R13). The boot goes on to the main menu as before.
     - An effect whose render or install throws is left out, and the rest install.
     - The FS-WDM0X effects still load as they do.

### D. Playing

R13. **FS-WDM0X's player rules.** **[charter default]** Each play:
     - reads the kept Sound effects level (`audio/sfxSetting.ts`) at that play;
     - plays nothing at level 0;
     - plays at `sfxGain(level)`, set on the play itself.

     It also keeps FS-WDM0X's rules:
     - **S11:** one sound per effect, a repeat restarts it from the top, and different effects may
       overlap.
     - **S12:** while the context is not running, it plays nothing and queues nothing.
     - **S22:** an effect not in the cache plays nothing and throws nothing.

     The sound manager's `volume` and `mute` are never written. No new OPTIONS row and no new
     `localStorage` key exist.
R14. **Fixed, flat sound.** No pitch, rate or detune variation and no spatial falloff or panning
     in v1. A monster's hit across the screen sounds as loud as one beside the player.
     **[charter default]**

### E. The dev sound board

R15. **A dev-only page with a button per effect.** `/dev/sounds` lists the 11 effects, each with
     a play button. It renders from the same generators (R9) at its own context's sample rate,
     with no Phaser. A production build answers 404 there, as `/dev/gallery` does. **[charter
     default]** Reason: the owner's listening check.
     - *Derived:* the page makes its Web Audio context on the first press (a gesture), so nothing
       is blocked.
     - *Derived:* each press plays at `SFX_MAX_GAIN` (the slider's top, the loudest the game
       plays), restarting that effect as R13 does.
     - *Derived:* the gallery's families are visual pieces (FS-1819Q R3), and a sound is not one.
       So the board is not a gallery family, and `/dev/gallery` gains no link; FS-1819Q is
       unchanged.

### F. Ownership

R16. **Two modules, the scenes only call.** *Derived* from the charter's bounds.
     - `game-client/src/audio/gameplaySfx.ts` holds the generators, the seeded PRNG and the
       tunables table (R9–R11).
     - `game-client/src/audio/gameplaySounds.ts` holds the effect list, the keys, the boot
       install (R12) and the player (R13). The player is built on `sceneUiSoundStage`.
     - The FS-WDM0X play checks may be lifted out of `UiSounds.play` into a shared function, if
       `uiSounds.test.ts` passes unchanged.
     - Each world scene makes its gameplay player in `create`, beside `mountUiSounds`, and hands
       it to the modules that play.
     - `gameAudio.ts`, `worldMusic.ts`, `sfxSetting.ts`, the game config and every FS-WDM0X
       trigger are unchanged.

## User Stories

1. As a player, I want a thud when a monster I can see is struck, so that I feel my blows land.
2. As a player, I want my teammates' blows on monsters to thud too, so that I hear the fight around me.
3. As a player, I want a different, heavier sound when I am wounded, so that I notice the hit without watching my health bar.
4. As a player, I want no sound for my teammates' wounds, so that my own wound stays unmistakable.
5. As a warrior, I want my Dash to sound as I cast it, so that the charge feels heavy.
6. As a mage, I want Triple Fireball to roar as I cast it, so that my big spell stands apart from my plain fireball.
7. As an archer, I want Shadow Shot to sound on the release, never during the draw, so that the shot lands in my ear when it leaves the bow.
8. As a mercenary, I want my parry to ring as I raise it, so that I know the stance is up.
9. As a player, I want a refused parry or a cancelled draw to stay silent, so that a sound always means something was cast.
10. As a player, I want a chest to creak open when I open it, so that opening a coffer feels physical.
11. As a player, I want a timed open to sound when the lid actually opens, so that the sound matches what I see.
12. As a player, I want a sack and a drop pile to rustle instead of creak, so that I can tell what I opened by ear.
13. As a player, I want other players' chest opens to stay silent, so that only my own actions sound.
14. As a player in the town, I want the stash chest's lid to sound as I open it, so that the chest feels real, not just a window.
15. As a player, I want a soft pouch sound when I take an item into my bag, so that each pickup is confirmed.
16. As a player, I want a buckle-and-strap sound when I equip, unequip or swap gear, so that changing gear feels hands-on.
17. As a player in the town, I want moving items between stash and bag to sound like handling gear.
18. As a player with a full bag, I want a take that cannot happen to stay silent.
19. As a player, I want a pile reserved for someone else to give its words, not a pickup sound.
20. As a player, I want the Sound effects slider to set these sounds too, so that one control sets every effect.
21. As a player, I want level 0 to silence these effects as well.
22. As a player, I want many monsters struck at once to sound once, not a pile-up, so that a big fight stays clean.
23. As a player, I want no burst of sounds when audio unlocks, so that events before my first gesture are simply silent.
24. As a player on a browser without Web Audio, I want the game to work, silently.
25. As a player, I want the sounds to fit a medieval barrow (wood, leather, iron, cloth, flesh), never electronic beeps.
26. As the owner, I want every sound built in code as numbers, so that I can retune any effect without sourcing a file.
27. As the owner, I want a dev page with a button per effect, so that I can listen and judge each sound alone.
28. As the owner, I want one shared loudness ceiling with a trim per effect, so that I can balance the set by numbers.
29. As a developer, I want each generator pure and deterministic, so that tests pin its length, loudness and edges.
30. As a developer, I want the gameplay effects to play through the interface effects' player rules, so that the level, the restart and the silence rules are written once.

## Acceptance Criteria

### The generators

- [ ] Each of the 11 effects renders at 44100 and at 48000 Hz to a `Float32Array` of at most
      `0.6 × rate` samples. All its samples are finite, and its first and last samples are 0.
- [ ] Each effect's largest absolute sample equals `GAMEPLAY_SFX_CEILING ×` its trim (within
      1e-6). A test that changes the ceiling or a trim changes that peak.
- [ ] Rendering an effect twice at the same rate gives identical samples. No two effects render
      identical samples.
- [ ] The module imports neither Phaser nor any Web Audio type, and never calls `Math.random`.
- [ ] `GAMEPLAY_SFX_CEILING` = 0.7 and the per-effect table (length, seed, trim = 1.0, recipe
      numbers) are named exports.

### Loading

- [ ] With a Web Audio stand-in, the boot install adds 11 `AudioBuffer`s, mono, at the context's
      rate, under `sfx:hit_monster` … `sfx:parry`, each holding that effect's samples.
      `PreloadScene` still goes on to the main menu, and the FS-WDM0X effects still load.
- [ ] With no context (HTML5 fallback or no audio), nothing is added and nothing throws. One
      effect that throws is left out while the rest install.
- [ ] Leaving a world leaves every gameplay effect cached.

### The player

- [ ] At level *n* > 0, with the context running and the effect cached, a play starts that
      effect's one sound at `sfxGain(n)`. A second play restarts it, and no second sound is added.
- [ ] At level 0, with the context not running, or with the effect not cached, a play does
      nothing and throws nothing. Nothing plays late once the context runs.
- [ ] No play sets the pitch, rate, detune or pan, or writes the sound manager's `volume` or
      `mute`.
- [ ] A level change between two plays is heard on the second.

### Combat (run and field)

- [ ] A state in which a shown monster's health is below its last state's plays `hit_monster`. A
      state that first shows a monster, brings one back, or drops a hidden one's health plays
      nothing. Two monsters struck in one state play one restarted sound.
- [ ] A drop in the player's own health plays `hit_player`, in the run and the field. A
      teammate's drop, the first state, and a rise play nothing.
- [ ] A warrior's sent `dash`, a mage's sent `triple_fireball`, an archer's fired `shadow_shot`
      and a mercenary's sent `parry` each play their effect once, through `PlayerCombat` (one test
      per class, with a fake look).
- [ ] A mage's primary fireball, a cast held back by the cooldown, an archer's press, a cancelled
      or unready release, and a refused parry play nothing.

### Coffers and items

- [ ] In the run, the coffer view opening on the state that answers the reach plays `chest_open`
      for a chest and `loot_open` for a sack. A drop pile, or a container already shown open,
      opening the view at once plays `loot_open` for a pile or sack, and `chest_open` for a chest.
      A timed open plays at the open, not at the start.
- [ ] In the field, a drop pile's view opening plays `loot_open`, and a clearing chest's or
      sack's view opening on its state plays `chest_open` or `loot_open`.
- [ ] A container another player opens plays nothing. A reach the server refuses plays nothing.
- [ ] Taking an item from the open view by click or F plays `item_pickup` in the run and the
      field. A full bag's refused take and a reserved pile's refusal play nothing.
- [ ] Equip, unequip and swap play `item_swap` in the run and the field (`EquipmentHud`). In the
      town, equip, unequip, swap and stash↔bag moves play it (`HubGear`). A change dropped while
      one is in flight, and an unequip refused for room, play nothing.
- [ ] In the town, E at the stash plays `stash_open` and `inventory_open`. An E refused because
      the inventory is open plays neither.

### The dev sound board

- [ ] `/dev/sounds` shows the 11 effects, each with a play button that renders and plays that
      effect from the generators at `SFX_MAX_GAIN`. It answers 404 in a production build (route
      test, as `/dev/gallery`'s).
- [ ] `/dev/gallery` and `dev/gallery/families.ts` are unchanged.

### Housekeeping

- [ ] No server, proto, gateway or `openapi.yaml` change. No new file under `public/audio/`.
      `gameAudio.ts`, `worldMusic.ts`, `sfxSetting.ts` and the game config are unchanged.
      `uiSounds.test.ts` passes unchanged.
- [ ] `BarrowspireScene.ts` changes only where it makes the gameplay player, hands it to its
      modules, and calls it at the Facts' points: own health, monster effects, `CombatLook`, the
      container view and loot, and the equipment HUD.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .`, `npm run lint` and
      `npm run lint:fence` pass.
- [ ] The owner's listening check passes (the HITL slice), on the sound board and in play, in
      Chrome and Safari.

## Edge States

- **Before the first gesture, or the window blurred.** The context is not running, so events are
  silent and nothing queues (R13). A fight already under way when the context resumes sounds only
  from then on.
- **HTML5 audio or no audio.** Nothing is installed, and every gameplay effect is silent (R12).
  The FS-WDM0X effects behave as they already do there.
- **Level 0.** Every gameplay effect is silent, with the interface effects.
- **A crowded fight.** Many hits per state restart one `hit_monster` sound. The thud may be cut
  short by the next state's hit. That is the restart rule, heard.
- **A cast the server refuses.** The client plays at its send, as it draws the cast's look. A
  refusal after it does not unplay it (resource, stun, range).
- **The killing blow.** It plays `hit_monster`, and no death sound follows (out of scope).
- **The player's own death.** The killing drop plays `hit_player`. Watching a teammate afterwards
  plays nothing for their wounds.
- **Reconnect or floor change.** The first state compares nothing and plays nothing. A coffer
  view open across a floor change closes silently.
- **A sound ringing as the scene ends.** It plays out (≤ 0.6 s) on the game's sound manager.
- **Stash E with the bag already open.** `openStash` refuses, so neither sound plays (R6).
- **Rapid pickups.** Each take restarts `item_pickup`. Different effects overlap, as a pickup
  over a hit does.
- **Safari.** It has Web Audio, so the effects install and play there. No codec is involved.

## Out of Scope

- Swing, loose and projectile-impact sounds (the primary attacks, arrows and fireballs in flight
  or landing).
- Monster voices, attacks and deaths. Footsteps, ambience.
- Teammates' wounds and casts. A loot pile appearing. The riposte. Shadow Shot's draw.
- Pitch, rate or volume variation, variants, and spatial or positional sound.
- A new OPTIONS row, a separate gameplay level or a new `localStorage` key.
- Sourced, downloaded or owner-supplied audio files for these effects.
- Any change to FS-WDM0X's or FS-28DDG's behaviour, `gameAudio.ts`, the server or the contract.
- A gallery family or a link from `/dev/gallery` to the sound board.
