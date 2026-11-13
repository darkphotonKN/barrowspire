# FS-XWHZP: Spire messages as lore lines

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" (Spire messages as lore lines) → this FS · Also the change FS for: [FS-3103M](3103M-vorsk-summoned-by-tome-and-altar.md) §I R24 (the tome, altar and hell lines move here from the HUD notice; see that FS's amendment), [FS-KYPQ9](KYPQ9-remainder-restyle-town-dressing-and-effects.md) §B.5 (the dread tremor, the one named exception to "no camera shake"); each carries `## Change: Spire messages as lore lines → FS-XWHZP` · Related: [FS-PQ2TW](PQ2TW-arrival-card.md) (the arrival card: the nearest look), [FS-F6F88](F6F88-multi-floor-delves.md) / [FS-M8CSE](M8CSE-spire-height-and-the-climb.md) (the floor card, the gather refusal), [FS-KE075](KE075-floor-1-dungeon.md) (the guarded chest line, §J R60), [FS-9K8EZ](9K8EZ-die-by-choice.md) (Fall refused), [FS-1819Q](1819Q-dev-gallery.md) (gallery cards) · Related ADRs: [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (the canvas palette) · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (arrival card, floor card) · Surface: game-client only

> Promoted `--from-thread` on 2026-11-14 from the scoping notes of the owner's request during the
> FS-C8VM7 / FS-3103M charter run. The owner approved the interview up front and asked for no
> confirmation; nothing was asked of anyone.
>
> **Markers.** Unmarked decisions are the owner's. **(default)** is a starting value the owner
> approved at scoping ("tune freely"). **(charter default: …)** is a question the notes left
> open, answered here with the smaller v1, with its reason; each is listed under *Open
> questions*. Every number and every line of copy is a starting value. Visual calls are delegated
> (the owner's standing art rule): decided here, judged after on the gallery cards and a
> screenshot. Code citations are against the tree at `30924c43`.

## Summary

Inside the Spire, the world speaks in **lore lines**: a quiet line of italic serif high in the
centre of the view, fading in slowly, holding, and fading out with fine dust drifting off it.
Today every Spire message is the plain HUD notice, a box of sans text on a coloured backing: the
switch says "Exit door unlocked! Run to escape!", and the owner found it "very off-putting and
non lore friendly". After this change every Spire world message is a lore line in the client's own
lore voice, keyed on the event or the reply's reason: the switch, the escape door, a player
escaping, the stair that waits for the party, the guarded chest, a refused Fall, and FS-3103M's
tome, altar and hell lines. A line has a **tone**: `lore` (parchment, the default), `dread`
(oxblood, with a low ember burst and a slight tremor), `hope` (a warm lantern gold). Interface
messages (equip, bag, network) stay HUD notices.

Why (owner, 2026-11-14): "we didn't have in-game story pop up visual vibe lore thing yet", then
"I wanted to make **all spire related messages** use it, for example when you click the escape
switch and the door opens the message is very off-putting and non lore friendly. It should use the
same message / lore system and visual too."

## Bounds

- **May touch:** `game-client` only: a new lore line module and its copy (`src/ui/`), its dust
  (`src/render/effects/`), the run scene's message call sites (`src/scenes/BarrowspireScene.ts`)
  and the pure copy they used (`src/ui/floor.ts`), the canvas palette's names
  (`src/utils/canvasPalette.ts`) for the three tones, their tests, and the dev gallery
  (`src/dev/gallery/effects.ts`).
- **May not touch:** `game-server/` (server strings are the human lane), proto, the gateway, the
  WebSocket shape, the hub and field scenes, the arrival card's own module, or the existing text
  of a shipped FS. No new colour token: tones are names over existing `BARROW` tokens (ADR-0013).
  No new baked art, no new font, no new sound.

## Requirements

### §A. The lore line (the look)

1. **A lore line is its own presentation, in its own module**, reusable for later story beats:
   one piece, handed a line's text and tone, that draws, times, queues and takes down lines. It
   reads and writes no game state, takes no input, and nothing waits on it. The run scene owns one.
2. **Where it stands (default):** centred across the view, its centre 20% of the view's height
   above the view's middle (30% from the top), so it sits below the arrival / floor card (centred
   20% from the top, FS-PQ2TW R10) and never on it. It is camera-fixed and keeps its place when
   the view is resized.
3. **How it reads (default):** the body serif (`CANVAS_FONT.body`, the lore face the cards use),
   italic, 22 px, letter spacing 1, centred, wrapped at 640 view px; quieter than the cards: no
   heading, no rule, no dark behind it. A soft ink shadow under the letters keeps it legible over a
   lit floor; no backing box.
4. **Its timing (default):** a slow fade in (900 ms), a hold fully shown (2600 ms), a fade out
   (1100 ms), Sine easing in and out. Then the next line in the queue, if any, after a 250 ms
   gap.
5. **Its depth:** over the world, its atmosphere, the HUD (1000) and the arrival card (960, 961),
   under the HUD notices (2000): depth 1990. Equal-depth draw order is not relied on.
6. **Fine dust:** while a line shows, a few fine motes rise slowly off it and fade (the `fx_dust`
   sheet, about 1 view px, the line's tone colour toward `vellumDark`), at most one mote per
   80 ms and at most 40 alive, so it stays a trail by FS-KYPQ9 §B.6, never a burst. The dust stops
   when the line starts to fade out; the motes in the air finish their life.
7. **Reduced motion and missing art:** under reduced motion there is no dust, no ember burst and
   no tremor; the line still fades in, holds and fades out. Without the `fx_dust` sheet the line
   plays with no dust and logs a warning once.

### §B. Tones

8. **Three tones, a starting set, one record each**, every colour a `palette` name over an
   existing `BARROW` token (ADR-0013, ADR-0025), named by what it is:
   | Tone | Text colour | Extra | Used by |
   |---|---|---|---|
   | `lore` (the default) | parchment: `loreText` = `vellum` | none | the world speaking: the stair, the chest, Fall, the tome, the altar, server free text |
   | `dread` | oxblood: `loreDread` = `oxbloodText` | a low ember burst and a slight tremor (R9, R10) | the hell line |
   | `hope` | lantern gold: `loreHope` = `brassBright` | warmer dust (`brassBright` toward `vellumDark`) | the switch, the escape door, a player escaping |
   **(charter default: `brassBright`, not `amber`)** Amber is reserved for what can be interacted
   with (design guideline); a lore line cannot be.
9. **The dread ember burst (default):** as a dread line starts, one emission of at most 12 ember
   motes (`ember` toward `oxblood`) from the line's foot, low and slow (10-40 px/s, mostly
   sideways and a little up, under drag), gone in 900 ms. At most 12, within FS-KYPQ9 §B.6's
   one-shot cap; never `explode`.
10. **The dread tremor (default):** as a dread line starts, the run's camera trembles slightly:
    220 ms, intensity 0.002 of the view. This is the owner's call at scoping and the **one named
    exception** to FS-KYPQ9 §B.5 ("no camera shake", cap zero): only a dread lore line trembles,
    nothing else in the client may, and the source scan keeps holding everything else to zero.

### §C. Several at once

11. **Lines queue, never overlap (default).** One line shows at a time; a line that arrives while
    one shows waits.
12. **A newer `dread` line jumps the queue (default):** it waits ahead of every waiting non-dread
    line (behind an earlier waiting dread line). **(charter default: it does not cut the line
    showing)** The line showing keeps its hold; jumping the queue is enough for v1.
13. **(charter default: at most 3 waiting)** A fourth waiting line drops the oldest waiting
    non-dread line, so a burst (a party of four escaping at once) never backs up for twenty
    seconds. A dread line is never dropped for a non-dread one.
14. **(charter default: no doubles)** A line whose text and tone equal the line showing or one
    waiting is dropped: the switch's broadcast flip and the server's `exit_door_unlocked` message
    name the same event and show one line.
15. **A scene's end, a run's reset, or a floor change** takes every line down and empties the
    queue: the lines belong to the floor they were said on. **(charter default: a floor change
    clears them)** The floor card is the arrival's line.

### §D. Which messages are lore lines, and their copy

16. **Every Spire world message is a lore line, its copy written by the client**, keyed on the
    event or the reply's reason, never on the server's free text where a key exists. The copy is
    one pure table, tested without a canvas. Starting copy **(default; tune freely)**:
    | Key | Source | Tone | Line |
    |---|---|---|---|
    | `switch_thrown` | the broadcast: a switch's `is_activated` turns true (§E) | hope | "The seal breaks. Somewhere, a door gives." |
    | `exit_door_unlocked` | the server's one-shot message of that name | hope | the same line as `switch_thrown` (R14 shows it once) |
    | `door_opened` | the broadcast: the escape door's `is_open` turns true (§E) | hope | "The way out stands open." |
    | `escaped` | the broadcast: a player's `escape` turns true (§E) | hope | another: "*Name* walks out of the dark."; the player themself: "You walk out of the dark." |
    | `party_not_gathered` | interact reply reason | lore | the existing words: "The stair waits. *N* of your party *is/are* not yet with you." / "The stair waits for the whole party." |
    | `container_guarded` | interact reply reason | lore | "It will not open." |
    | `loot_reserved` | interact reply reason | lore | "Not yours yet. The one who slew it has first claim." (the field's words for the same reason) |
    | `tome_taken` | interact reply reason (FS-3103M R13) | lore | "Wonder if I can burn it." (owner's words) |
    | `altar_without_tome` | interact reply reason (FS-3103M R16) | lore | "A tome was burned here once, they say, to insult a demon." |
    | `altar_burned` | interact reply reason (FS-3103M R19) | none | no line |
    | `burn_heard` | the broadcast: the altar's `burned` turns true (FS-3103M R26) | dread | "You hear a sound from hell" (owner's words) |
    | Fall refused | a refused `forfeit_run` (FS-9K8EZ req 4) | lore | the server's words; "The barrow will not take you yet." when it sent none |
17. **Server free text with no key** (charter default, by the owner's rule): an in-run `interact`
    reply that carries a message and no reason the table knows is shown as a `lore` line with the
    server's words, until the server gives it a reason. **(charter default: every in-run interact
    reply is about the world)** Interact is the world's verb (a coffer, a door, the stair, a
    pile); the interface's verbs are equip, the bag and the menus. Today that is "too far away to
    interact" and "escape door is locked". Server strings are the human lane: no server change.
18. **A reply with nothing to say** (the empty frame that follows every reply, `altar_burned`)
    raises no line, as today.
19. **The `exit_door_unlocked` one-shot** keeps its hold-while-loading behaviour (FS-C4JWH Edge
    States): held, then played as a lore line once the run has loaded.
20. **Equip refusals stay HUD notices**, as do every other interface or system message: the bag
    and gear overlay's notices, the network's ("Disconnected from server"), and anything raised
    outside a run. They are about the interface, not the world. The HUD notice and its tones are
    unchanged.
21. **The "Burn tome?" confirm stays FS-3103M's menu panel** (R25): a choice, not a line.

### §E. Transitions, and reconnect replays nothing

22. **Broadcast-driven lines fire on a transition only**, against the previous broadcast on the
    same floor: the switch's `is_activated` false → true, the escape door's `is_open` false →
    true, a player's `escape` false → true, the altar's `burned` false → true. Pure checks,
    tested without a canvas.
23. **The first broadcast is the baseline and says nothing**: after a connect, a reconnect, a
    scene restart, and on a new floor. A switch already thrown, a door already open, a player
    already out, or an altar already burned when the baseline is taken raises no line. (Today the
    switch and the escapes are announced again on a reconnect; that ends.)
24. **A player escaping is said once per run**, whoever they are; the first broadcast's players
    already out are seeded as said.

### §F. Ready for FS-3103M (its R24 amended)

25. **The lore module carries FS-3103M's three lines** (R16's table: `tome_taken`,
    `altar_without_tome`, `burn_heard`), and `altar_burned` says nothing. This FS builds no tome,
    altar, `tome_carried` or burn wiring: drawing them, the E targets, the confirm and calling the
    burn check on the flip are I-3103M-7's, which reads the reply's reason through this FS's copy
    and plays `burn_heard` through this FS's lore lines.

### §G. The gallery

26. **One gallery card per tone** (FS-1819Q R2, R10), under the lore line's dust module: "Lore
    line (lore)", "Lore line (dread)", "Lore line (hope)", each playing a real line through the
    game's own lore line piece on the gallery's canvas, the dread card with its burst and tremor.
    A replay queues as the game would.

## User Stories

1. As a player, I want the Spire's messages to sound like the Spire, so that the world never breaks into a system popup mid-delve.
2. As a player who throws the escape switch, I want a line that says a seal broke and a door gave, so that I feel the run turn toward the way out.
3. As a player, I want the escape door's opening told in the same voice, so that the way out reads as a place, not a status.
4. As a player watching a teammate escape, I want "*Name* walks out of the dark.", so that I know they made it, in the world's words.
5. As a player who escapes, I want my own escape said to me as "you", so that the moment is mine.
6. As a player at the stair, I want the stair's wait for my party said as lore, so that the refusal reads as the Spire's rule, not an error.
7. As a player reaching for a guarded chest, I want "It will not open." as a quiet line, so that the monsters around it say why.
8. As a player reaching for a pile I did not earn, I want the same words a field gives, so that the rule reads the same everywhere.
9. As a player whose Fall is refused, I want the refusal as a lore line, so that even the barrow's refusal stays in the world.
10. As a player who picks up the tome, I want its line to look like a story beat, not a HUD toast, so that I feel I found something.
11. As a player at an altar without the tome, I want the rumour as a lore line, so that I learn what I missed in the world's voice.
12. As a player when the tome burns, I want a dread line that trembles, so that I brace before Vorsk is even seen.
13. As a player, I want hopeful lines warm and dread lines red, so that I read the mood before the words.
14. As a player, I want lines never to stack on each other, so that each one can be read.
15. As a player, I want a dread line to come before older quiet lines, so that danger is never stuck behind news.
16. As a player in a party of four escaping together, I want the lines not to back up for half a minute, so that the screen keeps up with the run.
17. As a player, I want the switch told once, not twice, so that one event is one line.
18. As a player who reconnects, I want no old line replayed, so that a line means it happened just now.
19. As a player who climbs, I want the last floor's lines gone, so that the floor card speaks for the new floor.
20. As a player who asked for reduced motion, I want lines without dust, burst or tremor, so that the screen stays still.
21. As a player, I want equip and bag messages to stay the plain notice, so that interface problems read as interface, not as the world.
22. As a player, I want lore lines legible over a lit floor without a box, so that they read without looking like a dialog.
23. As a player, I want a lore line never to cover the floor card, so that the arrival reads first.
24. As the owner, I want every lore line to use existing barrow tokens, so that it fits the palette and the fence holds.
25. As the owner, I want each tone on a gallery card, so that I can judge the look without playing a run.
26. As the developer building FS-3103M §I, I want the tome, altar and hell lines ready in the lore module, so that the wiring only has to call it.
27. As the developer, I want one copy table keyed on events and reasons, so that the words are tested and tuned in one place.
28. As the developer, I want unkeyed server text to still reach the player as a lore line, so that nothing the server says is lost before it has a reason.

## Acceptance Criteria

### Client (vitest)

- [ ] The lore line draws its text in the body serif, italic, at its place (20% of the view's height above its middle, centred), at depth 1990, camera-fixed, in its tone's `palette` colour, with no backing.
- [ ] It fades in over 900 ms, holds 2600 ms, fades out over 1100 ms; the next queued line starts 250 ms after.
- [ ] A line that arrives while one shows waits; a dread line waits ahead of non-dread lines and behind an earlier dread line; a fourth waiting line drops the oldest waiting non-dread line; a line equal to the one showing or waiting is dropped.
- [ ] A dread line's start emits at most 12 ember motes once and trembles the camera once (220 ms, 0.002); lore and hope lines do neither.
- [ ] Under reduced motion: no dust, no burst, no tremor; the line still fades in, holds and fades out. Without `fx_dust`: no dust, one warning.
- [ ] A resize keeps the line at its place; a scene's end, a run's reset and a floor change take every line down and empty the queue.
- [ ] The copy table gives R16's line and tone for every key, nothing for `altar_burned` and for an empty reply, and the server's words as `lore` for an unkeyed reply with a message (R17).
- [ ] The transition checks fire only on false → true against a previous broadcast, never on the first; a player already out on the first broadcast is never announced; each player's escape is said once.
- [ ] In the run scene: an interact reply, the `exit_door_unlocked` one-shot, a refused Fall, the switch, the escape door and an escape each raise a lore line and no HUD notice; an equip refusal still raises the HUD notice.
- [ ] The gallery's effects registry has the three lore line cards under the dust's module, and its registry test passes.
- [ ] The source scan still finds no camera shake in the effects module or the run and hub scenes; the only tremor is the lore line's dread start.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

### Look

- [ ] A gallery screenshot of each tone, judged by the owner after (delegated art rule).

## Edge States

- **Two lines in one broadcast** (the switch and the door the same tick): the second waits.
- **The switch flip and the `exit_door_unlocked` message both arrive:** one line (R14).
- **A party escaping together:** at most one showing and three waiting; the oldest non-dread
  drop first.
- **A dread line while the queue is full of hope lines:** the oldest hope line is dropped and the
  dread line waits first.
- **A line arriving during the floor card:** it shows under the card, below it, at depth 1990
  over the card's dark. It does not wait for the card.
- **Reconnect mid-run:** the first broadcast is the baseline; nothing is replayed (R23). A held
  `exit_door_unlocked` from the server is the server's to send again or not.
- **A climb mid-line:** the line and the queue go (R15); the new floor's first broadcast is its
  baseline.
- **The run ends mid-line:** the line finishes or the scene's end takes it; nothing waits on it.
- **Resize mid-line:** the line moves to its place in the new view; motes in the air finish
  where they are.
- **Reduced motion:** text only, fades kept.
- **No `fx_dust` sheet:** text only, one warning.
- **A very long server message:** wraps at 640 px, centred; no truncation.
- **Hub and fields:** untouched; their notices are their own.

## Out of Scope

- **Fields and the hub using lore lines** (Spire only, per the owner; a later change).
- **Sound for a lore line** **(charter default: none in v1)**: no existing interface sound fits a
  quiet world line, and a new sound is out of bounds.
- **Any server string or reason change** (human lane): the unkeyed lines keep the server's words
  until it adds a reason.
- **The tome, the altar, `tome_carried`, the burn confirm and calling the burn check**: FS-3103M
  §I (I-3103M-7).
- **Cutting a showing line short for a dread line**, more tones, per-line timings, a history or
  log of past lines, and replay after reconnect.
- **The HUD notice's look**, which stays as it is for interface messages.
- **CONTEXT.md entries** for "lore line" and its tones: routed to `domain-model`.

## Open questions

The charter defaults, for the owner to revise:

1. R8: hope as `brassBright`, not `amber` (amber means interactable).
2. R12: a dread line jumps the queue but does not cut the showing line.
3. R13: at most 3 waiting, the oldest non-dread dropped.
4. R14: equal lines dropped, so the switch is said once.
5. R15: a floor change clears the lines.
6. R17: every in-run interact reply counts as the world's, so "too far away to interact" is a lore
   line in the server's words until it has a reason.
7. Out of Scope: no sound in v1.
