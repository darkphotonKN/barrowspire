# Design Guideline — The Age of Barrowspire

**This document is the single source of truth for all visual and art direction in the
game client.** Any task that changes appearance — in-game canvas rendering, sprites,
tiles, environment art, animation, fonts, colors, lighting, UI chrome, or layout — must
read this file first and conform to it. When this file and any other doc (including older
sections of `CLAUDE.md`) disagree on a visual decision, **this file wins.**

> Scope note: this is the art-direction reference. It describes the target look, not the
> current state of the code. The actual reskin (touching rendering/sprite/CSS/component
> code, font loading, and string swaps) happens in separate later passes that conform to
> this design guideline.

> **Two mediums, two parts.** Everything in this document down to the Part II divider is
> **Part I — Game Canvas & In-Game HUD (pre-rendered isometric art)**. For the **web / platform
> DOM UI** (marketplace, profile, auth, leaderboard, subscription — React/Next/Tailwind)
> jump to **[Part II — Web / Platform UI Design System](#part-ii--web--platform-ui-dom-design-system)**
> at the end. The "drop Cinzel" rule applies to **both** — see Part II Typography.
> Each part has **its own palette**: the barrow ramp below is the game palette, and the web UI
> has a separate one defined in Part II
> ([ADR-0025](../../docs/adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md)).

---

## Identity & Mood

- **The Age of Barrowspire** — a dark, gothic, medieval dungeon-crawl. Torch-lit,
  oppressive, barrow-deep, rumor-haunted. Players are **players** who descend into the
  **Spire** and escape with relics.
- Reference feel: a 2D tile-based medieval CRPG world — earthy, lived-in, hand-built
  environments read from a fixed game camera. **Dark fantasy, not bright high-fantasy.**
- The world should feel cold and dangerous, with warmth only where torches burn. Dread
  and rumor over spectacle.
- **Field worlds are the one carve-out:** open country outside the Spire may be daylit, its
  warmth the field's own daylight rather than torches; the hub and the Spire keep the torch-lit
  dark. *(Amended at the owner's approval of FS-X2F2H, 2026-10-29.)*

---

## Art Technique — Pre-rendered 3D (the chosen medium)

[ADR-0020](../../docs/adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md)
chose the medium; [FS-2325V](../../docs/specs/2325V-pre-rendered-isometric-art.md) builds it.
The target is Ultima Online: realistic, gritty, dark Arthurian, warm where torches burn.

- **Everything that stands up is modelled in 3D and baked at build time** into 2D sprite
  sheets: walls, trees, props, interactables, characters, creatures, and the item icons in the
  container view. Phaser draws only those 2D sprites. Nothing is rendered in 3D at runtime, and
  three.js never ships to players.
- **Realistic light, soft shadow, texture grit.** Sprites carry their shading from the bake
  (tone-mapped, environment-lit, a warm key light from screen-left, baked contact shadows that
  fall screen-right). They look lit *before* any overlay is applied.
- **Linear filtering.** Baked sprites are drawn smoothed, at 1x from a 2x render. The pixel-art
  rules (nearest-neighbour, dithering, hand-placed clusters, pixel-grid outlines,
  `image-rendering: pixelated`) no longer apply to the canvas.
- **Readable silhouettes over detail.** At game scale a player is roughly one tile wide and a face
  is a handful of pixels. What makes a thing read is its silhouette, its material and its motion.
- **Bake colours come from `BARROW`** (`src/utils/theme.ts`), so baked art and the in-game HUD
  stay one ramp
  ([ADR-0013](../../docs/adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md)).
  The web UI does not share it; it has its own palette (Part II,
  [ADR-0025](../../docs/adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md)).
  Baked PNG pixels are asset data and outside the hex fence.
- **The sprite manifest is the only way the client learns about art** (`public/art/manifest.json`:
  frame size, anchor, directions, frame counts, fps, declared light source, provenance). Scenes
  never hard-code frame geometry.
- **Until a sheet exists, placeholders stand in.** A scene draws today's placeholder graphics on
  the projection, and falls back to them per entity if a sheet is missing.

---

## Perspective

- **A fixed 2:1 isometric camera.** The tile is a 64x32 px diamond. The bake camera is
  orthographic at 30° elevation and 45° azimuth, so baked sprites sit on the grid exactly.
- **The world stays flat; the projection is presentation.** The server's `x, y` (the *world
  position*) is the single source of truth. The client projects it with `worldToScreen` only to
  place things on screen, and uses `screenToWorld` only to turn a pointer into a world target
  (`src/render/iso/`). Every gameplay calculation (distance, range, proximity, bounds) uses world
  positions. A distance measured between two sprites is a defect.
- **Input keeps its world meaning.** A movement key sends the same world-space intent it always
  did, so "up" walks a diagonal on screen, as it does in UO.
- **Draw order is by footprint** (`x + y` of the ground an object stands on), not by sprite
  bounds. Clicks hit-test the footprint too.
- **Eight facings.** Characters face one of eight world directions, taken from the velocity the
  client already renders.
- **Occlusion: buildings stay closed, the cut-away is for the room you are in, trees fade.** From
  outside, a building is a closed block and never fades; a player it covers shows through it as a
  silhouette. The cut-away (low south and east fronts) is how a room the player stands in is
  seen. A tree or tall prop in front of the player fades to about 40% while it overlaps them. See
  "Building exteriors" below
  ([ADR-0036](../../docs/adr/0036-buildings-have-an-exterior-and-an-interior.md),
  [FS-9PN7X](../../docs/specs/9PN7X-building-exteriors-and-indoor-blackout.md)). *(Replaces
  "Occlusion is cut-away, then fade" with FS-9PN7X, 2026-11-01.)*
- **Outside the map is dark.** The corners of the screen beyond the projected diamond are a dark
  fill, never a void or a stray background. In a field world it is that field's edge tint, which
  the ground fades into (see "Field worlds may be daylit instead"; FS-KSD6K, 2026-10-30).

---

## Palette (fixed, limited global ramp)

Pixel art needs a tight shared palette. Base everything on this barrow ramp. (These
values are mirrored in code by `src/utils/theme.ts` — `BARROW` / `BARROW_HEX`.) This is the
**game palette**, read only by Phaser code. The web UI has its own palette, defined in Part II,
and the two are not required to agree (ADR-0025).

| Role | Values |
|------|--------|
| **Darks** (bases, NOT pure black) | charcoal `#161310`, deep umber `#241a12` |
| **Stone** | slate `#3a3d42`, `#54585f` |
| **Earth / barrow** | browns `#5a4632`, `#3e2f22` |
| **Torch warmth** (the only real light) | amber `#e8a14d`, ember `#c2611f` |
| **Arcane / Lich corruption** | sickly green `#6f8f4a`, necrotic teal `#4a6b6f` |
| **Umbra / shadow magic** | dusk violet `#3f3452`, lifted `#7d6c99` |
| **Blood / danger** | oxblood `#6e1f1f` |
| **Parchment / UI** | vellum `#cdbf9a`, darkened `#8a7d5c`, ink `#1c1712` |
| **Brass** | `#9c7b3f`, `#c9a14e` |

**Umbra is narrow on purpose:** it is the archer's Shadow Shot (the bolt, its wake and gloom,
and its aim arrow) and nothing else. A shadow has nothing to be darker than in a dark barrow, and
dark smoke vanishes over brown ground, so the shot reads by hue instead: a dim, desaturated
violet that no other channel uses. It is not a readability channel (see below), and it is never
saturated or bright: a violet that glows like neon fails the rule below.
One exception, text only: a whisper's line in the chat window is drawn in umbra lifted toward vellum (`palette.chatWhisper`, FS-WJGFJ R30), so a private word reads apart from every public one.

**Rules:**
- Keep darks as bases, **never pure black** — preserve enough value range that pixel
  detail still reads in dim scenes.
- Low-key, desaturated overall. Warm torch pools against cold dark.
  - In a daylit field world, warm daylight over a lit green ground stands in for torch against
    dark; never neon, still mixed from these tokens. *(Amended at the owner's approval of
    FS-X2F2H, 2026-10-30.)*
- **No bright saturated primaries.** No neon, no cyan, no electric glows.

---

## Gameplay accent — colour is a readability channel

Part II's **one torch per view** rule governs **emphasis on a web page**: the UI torch (bone, in
the UI palette) means *look here*, and scarcity is what makes it work. **It does not govern the canvas**, and the two are not
in conflict — they answer different questions.

In gameplay, colour is a **readability channel, not emphasis**. A player who cannot find the door
at a glance has a broken game, not a busy screen. Amber may therefore repeat as often as there
are interactables on screen, and repetition is correct behaviour rather than dilution.

| Channel | Colour | Means |
|---|---|---|
| **Interactable / actionable** | amber | the player can do something with this |
| **Safe / friendly / restorative** | arcane green | pickups, allies, healing |
| **Damage / danger / hostile** | oxblood | enemies, damage taken, hazards |
| **Neutral HUD** | vellum | labels, counters, non-urgent information |
| **Frame / chrome** | brass | panel borders, dividers, HUD structure |

**The rule in its testable form: an amber thing the player cannot act on is a defect.** That is
the check to apply, not a count. A health bar, a damage number and a score are not interactables
and belong in their own channels; a door, a chest, a switch and an escape point are, and stay
amber however many of them are on screen.

**This is a rule about meaning, not a licence for volume.** The palette rules above still hold in
full — no bright saturated primaries, no neon, low-key and desaturated overall, warm torch pools
against cold dark. A screen where everything is amber has not followed this rule; it has failed
the test above, because most of those things cannot be acted on.

---

## In-Game Canvas / World Art

- **Environment:** dark dungeon stone, cracked flagstone, mossy/wet walls, half-timbered houses
  with leaded windows, wooden doors with iron banding, barrow earth, bone piles, rubble, cobwebs.
  - Ground is diamond tiles that tile seamlessly, chosen deterministically per world tile so
    every client sees the same ground.
  - Clear floor/wall distinction.
- **Props:** wall torches and braziers (flickering light), chests, sacks, broken pillars, hanging
  chains, lamp posts, furniture, trees. Interactables have one baked frame per state (door
  locked/unlocked/open, switch inactive/active, chest closed/open, sack closed/open). A sack is
  the chest's humbler cousin, smaller and plainer on the floor: closed, a slumped burlap sack
  tied at the neck with a leather thong; open, the thong slipped and the neck fallen open, the
  dark inside showing.
- The world reads as a **torch-lit crypt:** pooled warm light, deep shadow, with shading
  baked into the art so it looks lit *before* any light-map is applied. This holds for the hub
  and for every run in the Spire.
- **Field worlds may be daylit instead** (FS-X2F2H; Gentle Meadows first). A field is open
  country outside the Spire: grass, sparse trees and rocks. Past a field's map edge there is no
  horizon backdrop and no painted land: only one flat tint per field, mixed from `BARROW` tokens
  (the Forest a deep moss-black, the Meadows a soft muted green-grey), and the ground, road
  included, fades into it over the outermost tile so the edge reads as the map falling away into
  the field's mood, never a hard seam. *(Horizon replaced by the edge tint, FS-KSD6K,
  2026-10-30.)* Its daylight may be as warm as a cozy meadow or as
  dim as an overcast wood, but never bright high-fantasy: the ground is mixed from `BARROW`
  tokens like every other surface, never neon, and shading is still baked into the art first. A
  meadow's ground may be lit clearly daylit, since its markers wear the field outline (see "The
  readability floor"). *(Ground brightness amended at the owner's approval of FS-X2F2H,
  2026-10-30.)* Grass is ground material, not a marker: a green field never carries the
  *safe* channel's meaning, and pickups, allies and hostiles still read against it.
  *(Amended at the owner's approval of FS-X2F2H, 2026-10-29.)*

### Building exteriors

*(Added with FS-9PN7X, 2026-11-01.)*
Every building has two looks
([ADR-0036](../../docs/adr/0036-buildings-have-an-exterior-and-an-interior.md),
[FS-9PN7X](../../docs/specs/9PN7X-building-exteriors-and-indoor-blackout.md)): the **building
exterior** while the player is outside it, and the **interior look** (the cut-away, furnished and
lit) while the player stands inside.

- **One exterior per building type.** A building type is its wall material: timber (town
  buildings) and masonry (Spire rooms) today. A new building type is not finished until it has
  both looks, and its exterior reads as the same building as its interior: same material, palette
  ramp, key light and contact shadow.
- **Four full-height walls in the type's outward surface.** From outside, the south and east sides
  stand full height like the north and west, faced with the building's outward surface (weathered
  timber framing on a stone plinth, or coursed masonry), never interior dressing (no sconce,
  banner, cobweb or torch) and never lit. Corners are the type's full-height posts.
- **A roof or stone cap that never fades.** Timber buildings keep their roof, its gable ends
  closed under it in the building's timber; masonry rooms are closed by a flat stone cap at the
  back walls' top, the same on every floor. Neither takes the occluder fade, so nothing of the
  inside shows over or through the top.
- **A dark opening at entrances.** A doorway seen from outside is a full-height frame in the
  building's material with flat darkness inside (`palette.inkDeep`): you see the way in, not the
  room. A closed or locked door draws as a door.
- **The indoor blackout.** While the player stands inside a building, everything outside it goes
  to `palette.inkDeep`, the canvas's darkest ink, so being inside feels enclosed.

---

## Characters / Enemies

- **Authored in code, never sourced**
  ([ADR-0021](../../docs/adr/0021-characters-are-authored-in-code-not-sourced.md)). Characters and
  creatures are modelled, skinned, textured and hand-animated inside the bake tool on one shared
  rig: humanoid, with a quadruped variant for field wildlife. No stock model or animation is
  used; the art is Barrowspire's own.
- **Fidelity bar: Ultima Online.** Believable proportions, readable silhouettes, textured gear.
  Not photoreal, and not blocky cartoon mannequins.
- **Each gets 8 directions** and idle, walk, attack and death animations, baked from that rig.
  Creature variants change proportions and add bones (tail, jaw, hunch), or lay the spine
  horizontal on four legs.
- **Player:** cloaked/armored figure with a lantern or torch; strong silhouette. The
  class reads at a glance: knight, archer, wizard, mercenary.
- **Mercenary:** a lightly armoured, skilled swordsman built on strength. He is a fighter in the
  open, never a rogue or an assassin. He wears a quilted arming coat in faded madder, skirted to
  mid-thigh, with a madder sash, one blackened spaulder, a vambrace on the sword arm and tall
  boots. He goes bareheaded, his hair tied back and his beard trimmed, so the face and hair
  carry him. His sword is a long, slender, curved dueling blade with a knuckle-bow, used
  one-handed with no shield. He is broad in the shoulder and heavy in the arm: never the
  knight's plate and helm, never the archer's hood and cloak. *(Amended at the owner's pick,
  FS-MAMHR §H, 2026-10-31.)*
- **Enemies:** barrow/undead themes — skeletons, wraiths, revenants — for fodder and brutes;
  a boss may also be an infernal demon the Spire summons. In field worlds only, fodder and
  brutes may also be living animals (the boar first). Dark palette; **glowing eyes as the
  readable accent.** Full rules under *Enemy design language* below.
- **Hub folk and menus use the same cast.** Villagers, function NPCs, and every character shown
  in a menu (the roster, character creation) come from baked sheets on the same
  rig as the players, never from a separate illustration or the old pixel generators. What a
  player picks in a menu is exactly what walks in the world.
- **The owner approves a contact sheet** (every class and creature x 8 directions x each
  animation, at game scale) before scenes switch to character sheets.


### Enemy design language

Every hostile is built to be told apart from a player in one glance, even at the canvas edge in
the run's dark ambient. These rules apply to every creature added from now on, and the ghoul and
troll already baked are the reference pair.

- **Undead and barrow-born only, for fodder and brutes.** Skeletons, ghouls, wraiths, revenants,
  barrow-trolls, grave-hounds. Things that were buried, or that live where the buried are. No
  demons below boss tier, no sci-fi, no cartoon monsters. This is the Spire's rule and it holds
  unchanged for every run; field worlds carry the one exception below.
- **Boss-tier exception: infernal beings the Spire summons.** A demon may appear, but only as a
  boss. It reads as something the Spire's power has called up from beyond the barrow dead, and it
  is never licence for demon fodder or demon brutes. *(Amended at the owner's request,
  2026-10-08.)*
- **Green-hide clause (bosses only).** A dark, desaturated hide green (bog or lich green, mixed
  from `BARROW` toward charcoal and barrow-deep, never the `arcane` token as-is and never brighter
  or more saturated than it) is allowed as a boss's body material. Emissives stay ember red.
  Green is never an emissive and never a marker colour on a hostile, because arcane green means
  *safe*. *(Amended at the owner's request, 2026-10-08.)*
- **Field-wildlife clause (field worlds only).** In a field world, fodder and brutes may be
  living animals: the boar first. They are beasts of the country outside the Spire, never
  cartoon animals and never pets. Their materials are natural hide, bristle, tusk and horn, taken
  from the warm, desaturated end of `BARROW` (barrowBrown, barrowDeep, umber, charcoal for hide
  and bristle; the bone mix of vellum and vellumDark for tusk and horn). Never bright, and never
  amber, which means *interactable*. A living animal never appears in a run.
  *(Amended at the owner's approval of FS-X2F2H, 2026-10-29.)*
- **Quadruped rig variant (field wildlife).** A creature variant of the shared rig may be a
  quadruped: a horizontal spine, four legs, and head and tail chains. It is still authored in
  code in the bake tool (ADR-0021), still baked in 8 directions with idle, walk, attack and
  death, and still goes through the same contact-sheet approval. Four legs break the human line
  by build; the 1x colourless outline test below still applies.
  *(Amended at the owner's approval of FS-X2F2H, 2026-10-29.)*
- **Silhouette breaks the human line.** A player stands upright and symmetrical. A hostile never
  does: it is hunched, too thin, too long in the arm, asymmetric (one arm heavier, a broken
  jaw), or wears rags that trail. Test at 1x: with the colour removed, the outline alone must say
  "not a player".
- **Size is a threat tier.** Fodder is 0.85–1.0x player height. A brute is 1.3–1.5x and wider.
  A boss is at least 1.8x. The tier reads before any name plate does.
  A quadruped is measured against the player by body length along the shoulder line, not by
  standing height, and takes the same multiples. Quadruped fodder stays shorter in body length
  than a player is tall, so it reads smaller than a player; its shoulder sits well below the
  player's. *(Amended at the owner's approval of FS-X2F2H, 2026-10-29.)*
- **Materials are grave materials.** Bone, grave-rot skin, bog hide, rust, rotted linen, rag,
  corroded bronze. Take colours from the cold, desaturated end of `BARROW` (charcoal, slate,
  necrotic, barrowBrown, bone). Never bright, never clean metal, never a player's heraldic red.
  Field wildlife takes its own natural materials under the field-wildlife clause above.
- **Eyes are the accent, and they are in the hostile channel.** Glowing eyes use an ember red
  from the oxblood family (the *damage / hostile* channel above). Never amber, which means
  *interactable*, and never arcane green, which means *safe*. Eyes are the one emissive part of a
  hostile. They are marker material (FS-2325V §C.9): drawn above the light-map, so darkness never
  dims them. This holds for field wildlife too: a boar's eyes are the same ember red, its one
  emissive, so a boar in daylight still reads hostile and never reads as livestock.
  *(Field wildlife amended at the owner's approval of FS-X2F2H, 2026-10-29.)*
- **Motion tells intent.** Fodder moves jerkily and low. Brutes move heavily and slowly. Every
  attack has a readable wind-up, a pull-back or a raised arm, held long enough to see before it
  lands. An attack that cannot be read before it hits is unfair, not scary.
- **Deaths are final and distinct from a player's fall.** Undead collapse: bones scatter, a
  wraith unravels, a brute topples with weight. No gore and no blood spray. The barrow keeps its
  dead quietly. A living animal falls onto its side and goes still, with the same restraint.
- **Same pipeline as everyone.** Built on the shared rig in the bake tool (ADR-0021), with 8
  directions and idle, walk, attack and death, on the same contact-sheet approval as players.

---

## Lighting

**With art (FS-2325V §C, live in hub and run):**

- **Shading is baked into the sprites first**, then a **light-map** lights the scene: a
  camera-fixed multiply layer filled with the world's ambient, with additive radial pools for
  each light source in view (torch sconce, brazier, lit window, lamp post, the player's own
  torch). Sources flicker on their own clocks.
- **Ambient is fixed per world:** warm dusk in the hub, dark barrow in a run, and daylight in a
  daylit field world (from a cozy meadow's warmth to an overcast wood's gloom, fixed per field).
  A daylit field keeps the light-map and the vignette; its light sources simply pool less
  against a brighter ambient. *(Daylit fields amended at the owner's approval of FS-X2F2H,
  2026-10-29.)*
- The static vignette stays, above the light-map and below the HUD.
- Flame halos draw just above the light-map, so a flame reads as the source of its own pool. A
  flame under a roof lights the ground around it but shows no halo until the roof is off.

**Before art (superseded):** the overlay was the whole of the lighting, and it was two things.
The player's pool is now a light source on the light-map; the vignette is unchanged.

- A **static vignette** darkens the canvas edges. This does the atmospheric work — the world
  pressing in around the light.
- A **warm pool centred on the player**, moving with them. This is the part that makes the scene
  read as *carrying a torch* rather than merely as a dark screen. A vignette alone gives darkness
  with no source; the pool is what implies one.
- **Built once, depth-sorted above the world, repositioned per tick — never rebuilt.** The scene
  redraws from a full-state broadcast every tick, and the overlay's shape never changes. Only its
  position does. The light-map follows the same rule.

### The readability floor

**The vignette may never make an entity at the canvas edge unreadable.** Enemies whose intended
accent is *glowing eyes against dark* are the case that tests this, and the case most likely to
fail — their whole design is low contrast against a dark ground, and the vignette is darkest
exactly where a player first sees something enter the frame.

**If atmosphere and readability conflict, the vignette yields.** Reduce its strength or its reach.
An unreadable hostile is a bug; a slightly less moody screen is not.

**Markers carry readability, above the lighting** (FS-2325V §C.9). Hostile markers — the rival
name plate and HP bar, and a creature's glowing eyes once creatures render — draw above the
light-map and the vignette (and below the HUD), so darkness never dims them. Each keeps **at
least 3:1** contrast against the darkest lit ground at the canvas edge: ambient × the baked
ground's mean colour × the vignette there (`src/render/markers/`, tested against a fixed 3:1).
Marker colours are palette tokens like any other.

**The world may stay dark.** Ambient is never lifted for readability: the hub keeps its warm
dusk and the run its dark barrow. Lifting cannot work anyway — any multiply darkening lowers
contrast, and against the baked ground even full light under the vignette reaches only about
1.8:1. Ultima Online solves it the same way, with overlays that ignore lighting.

**Daylit fields keep the floor.** A daylit field's daylight is that field's look, not a lift for
readability. The floor holds there unchanged: markers draw above the light-map and keep at least
3:1, carried by the field outline below, and the gameplay accent channels mean
what they mean in every other world. *(Amended at the owner's approval of FS-X2F2H, 2026-10-29.)*

**In a field world the outline is the mechanism.** A daylit field's ground is not held dark for
the floor: every marker there (names, plates, a gate's name) wears a dark charcoal outline, and
each ink keeps at least 3:1 against that outline, so it reads on any ground however bright the
field's daylight (`FIELD_MARKER_OUTLINE` in `src/render/markers/`, tested for every field's look).
Field worlds only: the hub's and the Spire's markers stay as they are, measured against their lit
edge ground. *(Amended at the owner's approval of FS-X2F2H, 2026-10-30.)*

---

## Typography — push fully medieval

**The canvas uses the same two faces as Part II: Pirata One for display, EB Garamond for
everything else.** One client, one voice — and the canvas has no CSS, so it names them through a
single font constant of its own rather than a custom property.

- **Display:** **Pirata One** (blackletter). Chosen over UnifrakturMaguntia deliberately:
  authentic Fraktur is markedly harder to read, and legibility is the real risk with blackletter.
- **HUD / functional / body text:** **EB Garamond**. The readable workhorse — HUD text is read
  under pressure, and atmosphere must never cost a player information they need in a fight.
- **Drop clean Roman serifs (e.g. Cinzel) as the primary** — too modern/classical for the target.
  Keep one legible fallback in the stack.

### No bitmap font

The canvas has no pixel art, so it has no pixel/bitmap font. Pirata One and EB Garamond are the
final faces for the canvas, not a stand-in awaiting one.

### The blackletter bound

**Blackletter is permitted only at ≥28px, and only on these canvas surfaces:**

- the **main-menu title**
- the **end-of-run overlay heading**

**Nothing else.** HUD, labels, counters, tooltips, buttons, item names and prompts all use the
body serif. That leaves very little of the canvas eligible, which is intended — blackletter is
hard to read small, and every remaining surface is text a player reads while under pressure.

Where the bound and the message conflict — an end-of-run heading long enough to need shrinking —
**the message wins** and the heading takes the body serif.

---

## UI Chrome (align to the pre-rendered world)

- **The canvas menus wear the web UI's Bone & Soot.** The loading screen, the main menu and character creation
  (`src/ui/menuChrome.ts`) are the gate into the game, so they match the site
  rather than the barrow: soot ground with dust and a vignette, grey-stone panels with a 1px
  iron hairline and a carved edge, bone-grey text, iron section titles, ash grey for cancel and
  subtitles, and bone as the one torch per view (the primary button, the page title, the active
  selection). The primary button is a bone fill with soot text, a bright-bone inset hairline and
  a soft bone glow; secondary buttons are iron-outlined stone. The main-menu title is the site's
  hero h1, word for word (`THE AGE OF BARROWSPIRE`), in blackletter with the Atmosphere
  treatment: a bone gradient fill, a soft bone glow, a hard dark foot shadow, and a pool of bone
  light behind it. It has no tagline under it. Phaser still never reads the DOM's UI table
  (ADR-0025): the values come from the `menu*` entries of `BARROW` / `BARROW_HEX`, which mirror
  `globals.css` `:root` and must agree with it, through `palette.menu`. The figures' plinths are
  slate stone with iron rims under a bone pool. **What stays on the game palette:** the baked
  figures themselves, the HUD pieces a menu reuses (the roster's XP bar, the HP/MP stat colours,
  the item tip), and everything past the menus: hub, run, HUD and overlays.
- **Panels in the world (HUD, popups over the hub and the run):** dark vellum and carved-stone
  panels with 1px brass borders, in the palette above. Smooth fills and soft edges match the
  linearly filtered world; no pixel-grid frames.
- **World-object UI can be baked art.** The container view has one face per container kind
  (FS-1D6BX): a chest opens into the **coffer**, a plain open box seen from the front and a little
  above, with the items inside; a sack opens into the **satchel**, a leather satchel whose flap
  lifts and whose item icons drop in (FS-2325V §D); a slain monster's drop pile opens into the
  **bone heap**, the items lying on top. Only the satchel animates; the coffer and the bone heap
  pop in. Every face keeps the satchel's footprint and item slots. Item icons are baked, with a
  generic fallback.
- **Item marks in the gear and bag overlay.** A held item's rarity shows only as its **rarity
  edge**, a thin bar down the left side of its bag cell or worn slot. Two more marks sit beside
  it and never take a rarity colour. In a run, an **unsafe find** (picked up this run, lost if
  the player dies before escaping) gets a lifted-oxblood **inner edge** inside its well, clear of
  the rarity edge, and its tip adds "Found this run: lost if you die before you escape." in the
  same tone (`palette.unsafeFind`, the danger channel). Field worlds and the hub show no unsafe
  mark. In the hub, an item **still in a delve** is drawn faint, as a listed item is, and its tip
  says "Still in a delve." *(Added by FS-18Z5F §H, 2026-10-31.)*
- **Buttons in the world:** beveled stone / wax-seal feel; brass accents; brass hover glow. (Menu
  buttons follow the Bone & Soot rule above.)
- **Copy voice:** grim, terse. Players = **players**; enemy realm = the **Spire** / **Lich
  Lord**; "Play" → "Delve"; death → "Few return whole."

---

## Out of Scope (do not change as "art")

- Backend, Go, ECS, networking, schemas, or game logic. The projection may never change what
  the client sends: every WS action and payload keeps its shape and meaning.
- World positions themselves. Art moves where things are *drawn*, never where they *are*.

---
---

# Part II — Web / Platform UI (DOM) Design System

**Scope.** Governs the **web platform UI** rendered in React/Next/Tailwind DOM — the marketplace,
profile, leaderboard, auth (login/register), subscription, portal, header/menus, and any future
web surface. This is **not pixel art**: unlike the in-game HUD (Part I), the platform UI uses
modern web layout, smooth CSS, rounded corners, and blur. The medieval feel is carried by
**type, colour, iron detailing, and micro-ornament, not textures or 9-slice pixel frames.**
(The Part I "9-slice pixel border" rule is game-canvas-HUD only. The "drop Cinzel" rule now
applies here too: the web platform uses **Pirata One + EB Garamond** — see Typography.)

**The web UI has its own palette.** It is separate from the Part I game palette, and the two are
not required to agree
([ADR-0025](../../docs/adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md)).
Going from the menus into a delve is a deliberate change of register: the bone-and-soot web UI is
the gate, and the torch-lit barrow is the place. UI drawn over the canvas as DOM (the `/game`
page's chrome, the header) belongs to the UI palette. The Phaser HUD inside the canvas belongs to
the game palette. The canvas menus (main menu, character creation) are part of the gate,
so they take the Bone & Soot values through game-palette mirror tokens (Part I "UI Chrome").

**Direction: Bone & Soot.** *Modern web design, medieval aesthetics.* A neutral soot base,
bone-white as the single torch per view, grey stone surfaces, and iron framing, finished with the
Atmosphere layer (see Material & depth). Fast, scannable, keyboard- and mobile-friendly: the
medievalism is in the finish, never at the cost of usability.

**How it was chosen.** On 2026-10-21 the owner compared 18 candidate palettes live on the home
page, through a throwaway switcher over the real `:root` tokens, and chose Bone & Soot with the
Atmosphere layer on
([FS-8TCN2](../../docs/specs/8TCN2-bone-and-soot-web-ui-palette.md)). It replaced torch amber on
warm umber, which read as busy on pages people look at for long stretches. The choice was made
by eye. A later reskin should start from this record rather than relitigate it blind.

**Iron is the structure role, and its tokens are named "brass".** `--color-brass`,
`--color-brass-bright`, `--color-border` and `--color-border-strong` hold iron-grey values. The
names stay as they are (a semantic rename is a separate, mechanical follow-up), so **in a token
name, "brass" is a role, not a hue.** The prose in this part says *iron* for that role. Brass as
a colour belongs to the game palette.

**Runtime source of truth.** The UI palette is defined in
[`../src/app/globals.css`](../src/app/globals.css) `:root`. Where DOM code needs the same values
as JS strings (Stripe Elements' `appearance`, which cannot read CSS variables), it reads the
**UI table** in [`../src/utils/theme.ts`](../src/utils/theme.ts), which mirrors `:root` and must
agree with it. The UI table is separate from `BARROW` / `BARROW_HEX`, which are the game palette
only. **DOM code never reads `BARROW`, and Phaser code never reads the UI table.** This doc is the
*intent*; `:root` and the UI table are the *runtime*. Keep them in sync: add a token here, then
add it to `:root` and to the UI table.

**Which side each seam is on** (FS-8TCN2 slice 3). The Stripe card field and Payment Element on
`/subscription` read the UI table. The `/portal` particle title (`ParticleText`) is a 2D canvas
inside the web UI, so it reads the UI table too: bone motes and a bone, bone-bright and iron-bright
title. The `/game` page's DOM chrome around the canvas is styled by `globals.css` and is UI. The
Phaser game config's canvas clear colour (`PhaserGame`, `BARROW.umber`) is the first pixel of the
game canvas, so it stays on the game palette with every scene.

---

## Principles

1. **Soot, never black.** The base is a **neutral soot** (`--color-bg-dark` `#121212`), never
   `#000`. What makes it read as a surface rather than an absence is the material layer: grain,
   surface gradients, carved edges and the vignette (see Material & depth).
   *Why this changed, deliberately.* This principle used to read "dark, never black" and forbade
   near-black outright, asking for a warm umber base. Its reason was that a base with no value
   above the floor makes every accent read as emission, which is how a palette that already said
   "no neon" produced neon anyway. Bone & Soot was chosen by eye from a live comparison, and the
   neutral ground is what lets bone carry the torch without reading as emission: bone is a
   low-chroma light, so on a neutral ground it reads as lit material, where a saturated accent on
   the same ground read as neon. The material layer and the Atmosphere bounds now carry the
   emission risk that the warm base used to carry. Pure `#000` stays forbidden.
2. **One torch per view.** Bone (`--color-primary` `#e9dfc9`) marks the single most important
   thing: primary CTA, active nav, page `h1`, the focal number. Overuse dilutes it. Text on a
   bone fill is always `--color-bg-dark`.
3. **Iron is structure, not fill.** Iron (`--color-brass` `#5c5a55`) lives in 1px hairline
   borders, dividers, focus rings, and hover glows, and is rarely a solid fill. Panels are dark;
   iron frames them.
4. **Modern layout, medieval finish.** Grid/flex, responsive, generous spacing, real interaction
   affordances. Medieval means blackletter display, uppercase spaced labels, bone-grey text, iron
   rules, small carved/wax-seal badges, and the CSS material layer below. No image textures.
5. **Motion communicates.** Entrance/hover/focus show *what changed*; ≤0.3s; honor
   `prefers-reduced-motion`. No decorative animation.

---

## Color tokens (semantic → CSS var → value)

| Token | CSS var | Value | Use |
|---|---|---|---|
| Primary (bone, the torch) | `--color-primary` | `#e9dfc9` | the four torch uses: primary CTA, active nav, page `h1`, focal number |
| Primary bright | `--color-primary-bright` | `#f6efdf` | hover and emphasis on bone; top stop of the Atmosphere title gradient |
| Accent (ash grey) | `--color-accent` | `#8c8c84` | secondary, cancel, subtitle |
| Danger (oxblood) | `--color-danger` | `#6e1f1f` | fill: errors, destructive, death |
| Danger text | `--color-danger-text` | `#d07a6a` | error copy (oxblood lifted so it reads as text) |
| Page bg (soot) | `--color-bg-dark` | `#121212` | body / page background; text on a bone fill |
| Page bg (deepest) | `--color-bg-darker` | `#0a0a0a` | splash, wells, dropdown base |
| Ground, well | `--color-bg-well` | `#0a0a0a` (the `--color-bg-darker` step) | inputs, card-entry wells, panels over the page; used translucent via `color-mix()` |
| Ground, inset | `--color-bg-inset` | `#0e0e0e` | inset control groups on the game page chrome; used translucent via `color-mix()` |
| Ground, dropdown | `--color-bg-dropdown` | `#070707` | dropdown and popover base (user menu, notification panel); used translucent via `color-mix()` |
| Surface / card | `--color-bg-card` | `rgba(28, 28, 27, 0.88)` | cards, panels, modals (with blur) |
| Surface raised | `--color-bg-card-2` | `rgba(38, 37, 35, 0.92)` | hovered/elevated card, nested panel |
| Surface, opaque | `--color-bg-card-opaque` / `--color-bg-card-2-opaque` | `#1b1b1a` / `#242322`: each surface composited over soot, read back in the browser | `prefers-reduced-transparency` |
| Iron (structure) | `--color-brass` | `#5c5a55` | borders, dividers, focus rings, hover glows |
| Iron bright | `--color-brass-bright` | `#8a8780` | hover/focus structure; `h2` section titles under the Atmosphere |
| Border (iron hairline) | `--color-border` | `--color-brass` at 30% (1.26:1 on soot) | default 1px borders/dividers |
| Border strong | `--color-border-strong` | `--color-brass` at 60% (1.73:1 on soot) | hover/focus/active border |
| Text primary (bone-grey) | `--color-text` | `#cfc9bb` | body text, item names, values |
| Text dim | `--color-text-dim` | `#9b968b` | labels, secondary info |
| Text muted | `--color-text-muted` | `#85817a` | footnotes, hints, small labels |
| Text placeholder | `--color-text-placeholder` | `#5e5b55` | input placeholder |

**`--color-text` (bone-grey) is the default body colour.** Pure white is off-palette: bone is the
brightest thing on the page, and bone is the torch. The material tokens were re-derived against
soot rather than carried over from the amber palette:

| Token | Bone & Soot value | Why |
|---|---|---|
| `--color-border` / `-strong` | `--color-brass` at 30% / 60% | under amber the hairlines sat at 1.20:1 and 1.62:1 on the page; these land at 1.26:1 and 1.73:1 on soot, the same quiet frame |
| `--focus-ring` | 2px of `--color-brass-bright` at 70% | 3.17:1 on soot, over the 3:1 non-text floor (amber's ring was 1.90:1) |
| `--glow-brass` | 18px of `--color-brass-bright` at 22% | plain iron is too dark on soot to read as a glow at all |
| `--glow-torch` | 22px of `--color-primary` at 16% | bone is lighter than amber, so it takes a lower alpha to stay a glow and not an emission |
| `--surface-gradient`, `--edge-carved`, `--edge-engraved` | the same stops in neutral white (`255,255,255`) | the warm highlights (`255,245,225`, `255,240,214`) were the amber palette's cast and read as a tint on soot |

The two borders, the glows and the focus ring are written with `color-mix()` from the tokens. A
browser without `color-mix()` gets an `@supports not` fallback in `:root`: borders drop to the
plain iron tokens, the glows to none, and the focus ring to solid iron bright. It never falls
back to an old raw triple.

### Contrast floor (the bases are chosen against it)

**Body and label text ≥ 4.5:1. Decorative, hint and disabled text ≥ 3:1.** Measured in the
browser against `--color-bg-dark` `#121212`:

| Text token | Value | Ratio | Tier |
|---|---|---|---|
| `--color-text` (bone-grey) | `#cfc9bb` | 11.35:1 | body |
| `--color-primary` (bone) | `#e9dfc9` | 14.15:1 | body |
| `--color-primary-bright` | `#f6efdf` | 16.35:1 | body |
| `--color-bg-dark` on bone fill | `#121212` | 14.15:1 | body |
| `--color-text-dim` | `#9b968b` | 6.36:1 | body |
| `--color-text-muted` | `#85817a` | 4.83:1 | body |
| `--color-danger-text` | `#d07a6a` | 5.95:1 | body |
| `--color-accent` (ash grey) | `#8c8c84` | 5.53:1 | body |
| `--color-brass-bright` (iron bright, `h2`) | `#8a8780` | 5.23:1 | body |
| `--color-text-placeholder` | `#5e5b55` | 2.77:1 | placeholder only |

Measured in the browser on the running app (FS-8TCN2 slice 3, 2026-10-21): each token resolved
through `getComputedStyle` and its WCAG ratio taken against the resolved `--color-bg-dark`. The
preview estimated text 11.4, dim 6.4, muted 4.8 and torch 14.2, and the browser agrees.
`--color-text-placeholder` is below the floor on purpose: it marks an empty input and never
carries copy, so nothing that has to be read may use it (the auth footer, which used it, now
uses `--color-text-muted`).

**The value range moves with the base.** Under the amber palette, `--color-text-dim` and
`--color-text-muted` had to be lifted when the base changed, because both failed their tier
against the new ground. The same holds here: if a text token fails against soot, lift the token
within its role. Never fix it by changing the ground behind the text.

**Every text token clears 4.5:1**, including `--color-text-muted`. An earlier draft parked it in
the 3:1 decorative tier, but measurement in the browser showed it carrying real body copy, hint
lines and the version footer. Those are labels, not decoration. The 3:1 tier is reserved for
genuinely disabled controls, which are expressed with opacity rather than this token.

The **rarity badge is small text** (11px uppercase), so the ramp is held to the 4.5:1 body floor
too. The browser figures are in the rarity table; one colour, Runed, was lifted within its hue.

**Text on a bone fill is always `--color-bg-dark`, never white.**

---

## Accent vs structure — what carries what

"One torch per view" says what the torch is *for*. It never said what carries everything else, so
under the old amber palette amber became the entire accent system by default: **49 occurrences in
`globals.css` against 4 brass and 1 oxblood.** One saturated hue on a dark ground, repeated
everywhere, is neon regardless of what the token is called. This rule closed that gap, and it
holds with bone as the torch: a light repeated everywhere stops being a torch.

**Bone (`--color-primary`) is permitted on exactly four things, at most one instance each per
view:**

1. the **primary CTA**
2. the **active nav item**
3. the **page `h1`**
4. the **single focal number** the view exists to show (a price, a rank, a balance)

**Nothing else.** Not borders, not dividers, not labels, not hover states on secondary controls,
not icons, not decorative rules.

*One* clarification, because long pages hit it immediately: a **single CTA identity may repeat
once at the foot of a long page** (the same button, the same words, the same action). That is one
torch shown twice for reach, not two torches competing. Two *different* bone CTAs in one view
still break the rule.

**What carries the rest (these are load-bearing, not decoration):**

| Role | Colour | Used for |
|---|---|---|
| Structure | **iron** `--color-brass` `#5c5a55` / `--color-border` | borders, dividers, focus rings, hairlines, hover glows |
| Structure, bright | **iron bright** `--color-brass-bright` `#8a8780` | hover/focus structure, `h2` section titles |
| Text | **bone-grey** `--color-text` / `-dim` / `-muted` | all body, label and value text |
| Surface | **soot / stone** `--color-bg-*` | pages, cards, panels, wells |
| Secondary action | **ash grey** `--color-accent` | cancel, secondary, subtitle |
| Danger | **oxblood** `--color-danger` (fill), `--color-danger-text` (copy) | errors, destructive, death |

A view that needs a second emphasis colour reaches for **iron bright**, never a second bone.

---

## Rarity ramp (marketplace)

Items carry a rarity. Express it on the **accent edge (a card's, or a listing row's), the rarity
badge, and a faint hover glow** — never as a full card or row fill (keeps the grid and the table
calm). **Always pair color with the text label** (colorblind safety).

| Rarity | Server tier (label) | CSS var | Value | Palette source |
|---|---|---|---|---|
| Common | Normal | `--rarity-common` | `#a2946d` | vellum-dark, lifted to clear 4.5:1 at badge size |
| Uncommon | Uncommon | `--rarity-uncommon` | `#6f8f4a` | arcane green |
| Rare | Rare | `--rarity-rare` | `#688b8f` | necrotic teal, lifted to clear 4.5:1 at badge size |
| Epic | Runed | `--rarity-epic` | `#a58243` | brass, lifted within its hue to clear 4.5:1 at badge size on soot |
| Legendary | Fabled | `--rarity-legendary` | `#f2b866` | amber-bright |

The server names its five tiers (items-service `CONTEXT.md` "Rarity tier"); the badge shows the
**server tier as its label** in the token's colour, matched by name in one place
(`src/marketplace/rarity.ts`) and drawn by one component (`RarityBadge`). A tier the client does not
know renders as Common, labelled with its raw name — never hidden, never guessed.

Make these the **canonical rarity colours**: align `items-service` `item_rarities.color_hex` to
them (or map at the API) so server data and UI agree. Add the vars to `globals.css`.

**Rarity is data, not theme.** These values are not drawn from the UI palette; the "Palette
source" column records the game-ramp hue each one came from. One that drops under 4.5:1 is lifted
within its own hue and the new value recorded in this table, never fixed by changing the
background behind the badge.

Measured in the browser at badge size (11px, 700, uppercase), FS-8TCN2 slice 3. "Badge on soot"
is the badge as the landing page renders it: the colour on soot plus the badge's own 6% tint.
"Badge on card" is the same badge composited over `--color-bg-card`, the Bazaar table's ground.

| Rarity | Value | On `--color-bg-dark` | Badge on soot | Badge on card |
|---|---|---|---|---|
| Common | `#a2946d` | 6.24:1 | 5.81:1 | 5.30:1 |
| Uncommon | `#6f8f4a` | 5.09:1 | 4.78:1 | 4.37:1 |
| Rare | `#688b8f` | 5.07:1 | 4.76:1 | 4.35:1 |
| Epic (Runed) | `#a58243` | 5.24:1 | 4.92:1 | 4.50:1 |
| Legendary (Fabled) | `#f2b866` | 10.55:1 | 9.55:1 | 8.67:1 |

Runed was `#9c7b3f`. It cleared soot itself (4.74:1) but its rendered badge measured 4.48:1, so it
was lifted three lightness points within the brass hue. The client value now differs from the
game ramp's brass and from the server's `item_rarities.color_hex`, as Common and Rare already did.
Uncommon and Rare clear the floor on soot but sit at about 4.35:1 on a card surface. That is
recorded here, not fixed: the slice measured against `--color-bg-dark`, and lifting either is a
data-colour decision for the owner.

### The rarity ramp is exempt from one-torch-per-view

`--rarity-legendary` is a warm amber-bright, one of the most saturated colours on a soot page, so
a grid of legendary relics repeats a bright hue across a view, which the one-torch rule otherwise
forbids. Without this clause the two rules contradict each
other and whoever implements the grid picks one at random. The exemption, and its reasoning:

**Rarity colour is data, not emphasis.** It encodes a property of an item rather than directing
attention to one thing, so it is not competing for the torch — it is a different channel that
happens to share a hue. Repetition across a grid is correct behaviour for data, and would be
wrong behaviour for emphasis.

**The exemption is scoped, not general.** Rarity colours may appear only on:
- the **rarity badge**
- the **accent edge**: a card's top or left border, or a listing row's left edge
- a **faint hover glow** on that card or row

They may **never** be used as a CTA, nav, heading, or link colour, and a rarity colour never
becomes a card fill. Outside those three places a rarity colour does not appear at all: it is
never a stand-in for the torch or for iron.

---

## Typography

- **Display:** **Pirata One** (`--font-heading`, `.font-display`) — blackletter. Cinzel is
  dropped: a classical Roman serif reads *museum*, not *medieval*, and was a large part of why
  the platform read modern. Pirata One over UnifrakturMaguntia deliberately — authentic Fraktur
  is markedly harder to read, and blackletter legibility is the one user-facing risk here.
- **Body / values / labels / nav / buttons / inputs:** EB Garamond (`--font-body`) — old-style
  serif, genuinely legible. Unchanged; it was never the problem.

**Blackletter bound — both conditions, not either.** Blackletter is permitted only at
**≥ 28px** *and* only on these surfaces: **the logo, the hero, and the page `h1`.** Everything
else uses `--font-body`, including `h2` and below, nav, labels, buttons, table cells, badges and
footnotes. The size test alone is insufficient — `h2` tops out at 29px and would otherwise
qualify; 28px is the line that cleanly separates `h1` (29–32) from `h2` (24–29).

**`h1` is bone, one per view.** A blackletter `h1` takes the Atmosphere's gradient fill (see
Material & depth); a heading in the body face never does.

**The face is bound to `--font-heading`, and component code never names a face directly.** That
indirection is deliberate: if blackletter does not hold up in practice, the recorded fallback is
a warmer medieval serif (Grenze, MedievalSharp, IM Fell) and the swap is a two-file change.
- **Labels / meta:** uppercase, letter-spacing `0.05–0.1em`, `--color-text-dim`. A signature.
- **No emoji** in UI — use line icons or small carved/wax-seal badges.

Type scale (px, desktop; functional base ~14px). Prefer these steps:

| Step | Size / line | Use |
|---|---|---|
| Caption / meta | 12 / 16 | badges, hints, footer |
| Label | 13–14 / 18 | uppercase labels, nav |
| Body | 14–16 / 22 | body, values, inputs |
| Lead | 18 / 26 | card titles, item names |
| Title (`h2`) | 24–29 / 34 | section / page subheads |
| Page `h1` | 29–32 / 38 | page title (bone) |
| Hero | 40+ | splash only |

---

## Spacing, layout, radius

- **Base unit 4px.** Steps: `4 / 8 / 12 / 16 / 24 / 32 / 48`. Avoid arbitrary values.
- **Control padding:** buttons `~0.6rem 1.5rem`; inputs `~0.85rem 1rem`. **Card padding** `2rem`
  (`1.5rem` ≤ mobile).
- **Container:** centered, max `1400px`, `2rem` horizontal padding (`1rem` mobile).
- **Breakpoints:** primary mobile cut at **640px**; standard Tailwind `sm/md/lg/xl` above.
- **Radius:** `6px` buttons/inputs/small chips · `8px` cards/status · `10–12px`
  panels/modals/dropdowns · `full` pills & avatars. No oversized modern radii.

---

## Elevation, borders, motion

- **Shadows:** cards `0 8px 32px rgba(0,0,0,0.4)`; dropdowns/modals `0 10px 40px rgba(0,0,0,0.6)`.
  Deep and soft (crypt depth), never bright.
- **Glows (hover/focus):** structure-tinted `box-shadow` derived from `--color-brass` /
  `--color-brass-bright`, opacity `0.1–0.4`. A torch-tinted glow belongs only to the primary CTA
  (see the Atmosphere layer). Focus ring is `--focus-ring`, derived from the iron structure role
  (2px of `--color-brass-bright` at 70%, 3.17:1 on soot); it must stay plainly visible on soot.
  **Never neon.**
- **Borders:** 1px iron hairline (`--color-border`); raise to `--color-border-strong` on
  hover/focus/active.
- **Blur:** floating surfaces (header, dropdown, modal, card) use `backdrop-filter: blur(20px)`.
- **Motion:** micro `0.2s`, standard `0.3s ease`. Button/card hover `translateY(-2px)` + glow.
  Entrances slide in from where the surface belongs (`globals.css` "Entrances"): a drawer from
  the edge it docks to (`.enter-from-right`), a modal up from below (`.enter-from-below`), a
  dropdown down from its bar; the scrim fades (`.scrim-in`). `slideIn` for inline notes. Spinner =
  iron ring.
  Respect `prefers-reduced-motion: reduce`.

---

## Material & depth

The half this document never specified, and the reason a palette that already forbade neon
produced it anyway. **Medievalism comes from material and hue range, not from an accent colour.**
Flat dark surfaces plus one saturated hue will read as a dark web app with a brand colour no
matter how the hue is named. Material is what reads as a world: under Bone & Soot that is stone,
bone, soot and iron.

**Everything here is CSS. No image assets** — no textures, no 9-slice frames, no background
images. `public/` stays empty. That constraint is deliberate: the material layer must ship
without waiting on art.

### The five primitives

1. **Grain.** A single low-opacity noise field over the page, via an inline SVG
   `feTurbulence` `data:` URI. It breaks the flatness of large dark fills, which is what makes a
   dark page read as a surface rather than an absence. Keep it *barely* visible — if you can see
   the noise as noise, it is too strong. Grain shows more on neutral soot than it did on warm
   umber: the amber palette's opacity of `0.035` read as visible speckle on soot, so it is now
   **`0.025`** (FS-8TCN2 slice 3).
2. **Surface gradients.** Cards, panels, modals, header and dropdowns carry a shallow layered
   gradient so they read as carved stone or parchment rather than a flat fill. Subtle: a surface
   should look lit from somewhere, not shaded.
3. **Carved edges.** Inset shadows — a light top edge and a dark bottom edge, or the inverse for
   engraved — within the existing radius scale. This is what makes a panel read as cut *into*
   or *out of* material rather than pasted on it.
4. **Vignette.** The page edges darken. The world presses in at the borders of the light; this
   is the single cheapest way to make a screen feel torch-lit. Its strength is set by the
   Atmosphere layer below.
5. **Ornament.** Corner marks, iron rules, and dividers, drawn with borders and pseudo-elements.
   Small and sparse — ornament reads as craft in ones and twos, and as clutter in fives.

### Rules

- **Material is finish, never structure.** With grain, gradients and vignette all suppressed,
  every view must remain legible and correctly laid out. If suppressing the layer breaks a
  layout, that layout was depending on decoration.
- **It must degrade under user preference.** `prefers-reduced-transparency` resolves blurred
  translucent surfaces to opaque ones that still read as distinct layers; `forced-colors` must
  never leave text on an unreadable ground.
- **Grain has a measurable cost.** A full-page noise overlay composited under several
  `backdrop-filter: blur(20px)` surfaces is real compositing work. If it degrades scroll
  performance at high-DPI or large viewports, scope the grain to surfaces rather than the page
  — and say so, rather than shipping a quietly slower page.
- **No glow may read as emission.** Structure-tinted `box-shadow` at 0.1–0.4 opacity marks a
  hover or focus state. A glow bright enough to look like a light source is neon by another name.
  The Atmosphere's torch-tinted glows are the only glows that take the torch colour, and they are
  bounded below.

### The Atmosphere layer

The finish chosen with Bone & Soot (FS-8TCN2 §D): five pieces on top of the material layer. It is
part of "Material & depth", so every rule above applies to it, plus the bounds here.

| Piece | What it is | Where it may appear |
|---|---|---|
| **Hero title** | a vertical gradient fill from `--color-primary-bright` through `--color-primary` to a darkened primary, with a soft torch-tinted drop shadow and a hard 2px dark shadow | the landing hero `h1`, and any other page `h1` set in blackletter. Never a heading in the body face |
| **Hero glow** | a low-opacity radial glow in the torch colour, plus a faint structure-tinted glow rising from the bottom edge | hero sections only |
| **Section headings** | `h2` section titles in `--color-brass-bright` | any page. This is structure, not a second torch |
| **Primary CTA glow** | an inset bright-bone hairline and a soft outer torch-tinted glow | the primary CTA only, one per view. Secondary buttons get nothing |
| **Vignette** | the page vignette, deepened so the edges reach about 60% black | every page, as a fixed, pointer-events-none overlay below the header and popups |

**Everything is derived from tokens.** No piece introduces a raw colour. Gradients and glows are
built from `var(--color-*)`, for example with `color-mix()` (ADR-0025), so a palette change
carries the Atmosphere with it and its rules need no edits.

**It is finish, never structure.** With the whole layer removed, every view stays legible and laid
out the same.

**Fallbacks:**
- **`prefers-reduced-transparency`:** the gradient title falls back to solid `--color-primary`,
  and translucent surfaces resolve to opaque ones as above.
- **`forced-colors`:** the Atmosphere is suppressed entirely, and text sits on a readable ground.
- **No `background-clip: text`:** the title falls back to solid `--color-primary`, never to
  transparent text.
- **No `color-mix()`:** a derived glow or border degrades to the plain token or to transparent,
  decided per site. It never falls back to a raw value from the old palette.

**Why it does not breach "no glow may read as emission".** Emission is a saturated colour
spreading light across a ground with nothing else on it; that is how the amber palette read as
neon. The Atmosphere's glows differ in three ways, and those three ways are its bounds:

1. they take **bone**, a low-chroma light, not a saturated hue;
2. they stay at **low opacity**, on a ground the material layer already reads as a surface;
3. they appear **only where the torch already is** (the hero `h1`, the hero, the one primary
   CTA), so they add no new focal point.

A glow outside those places, a glow in a saturated colour, or a glow bright enough to light the
ground around it is a breach.

---

## Components

Barrowspire web UI is **custom Tailwind + CSS classes** (no shadcn — that's the Fireplace repo).
Prefer Tailwind utilities driven by the tokens above; extract a shared class only when a pattern
repeats; use a `cn()` helper for conditional classes.

**Buttons** — *Primary:* bone fill, dark text (`--color-bg-dark`), uppercase, letter-spacing
`0.1em`, radius 6, hover `translateY(-2px)`, with the Atmosphere's CTA glow (inset bright-bone
hairline, soft outer torch glow) (`.btn-primary`, `.login-button`). *Secondary:* transparent,
iron border, `text-dim` to `--color-text` on hover, never bone (`.btn-secondary`).
*Destructive:* oxblood. *Disabled:* opacity `0.5–0.6`, no transform. *Loading:* inline iron
spinner, stable width.

**Inputs / forms** — dark well derived from `--color-bg-darker` (about 80%), iron border `0.1`
to focus `0.4` plus the iron focus ring, bone-grey text, placeholder `--color-text-placeholder`,
radius 6. Label above: uppercase, `text-dim`, small.

**Cards & panels** — `bg-card`, 1px iron border, radius `8–12`, `backdrop-blur`, card shadow,
`2rem` padding. Interactive cards: hover raises border + faint glow + `translateY(-2px)`.

**Item card (marketplace — the List-a-relic item picker)**
- Layout (approved direction): thumb/icon · **rarity badge** (top-right) · **item name**
  (bone-grey, lead size) · thin iron divider · **stat row** (attack / crit / defense, each a
  line icon — not emoji). No price: the picker chooses a relic to list, it does not sell one.
- **Rarity** = top/left accent border in the rarity color + the badge + a faint rarity glow on
  hover. Card body stays dark soot (no rarity fill).
- Sizing: min width `~220–260px`, internal `gap-2/gap-3`, radius 8.
- States: default (border `0.15`) · hover (border-strong + lift + rarity glow) · focus-visible
  (iron ring) · owned/disabled (reduced opacity + "Owned" badge on the card).

**Item grid** — the **List-a-relic item picker** (the player's own relics, one to choose) keeps
the card grid: responsive `grid` `auto-fill minmax(220px, 1fr)`, gap `1rem–1.25rem`; collapses
to 1–2 cols ≤640px. A relic already listed or in escrow is the owned/disabled card state, with a
"Listed" or "In escrow" badge on the card.

**Filter / toolbar bar** — search input (left) · **filter chips** (rarity/type/slot) as pills
(iron border; active = iron bright for every chip, rarity included: a rarity chip names its
tier by label, never by rarity color; never bone, which the view's CTA already holds) · **sort** dropdown (right), or the column headers where the view
is the listing table. Sticky under the header when long.

**Badges & pills** — small, uppercase, letter-spacing, radius `3–4`. Rarity badge uses the rarity
color (text or hairline on a dark chip). Status badges (New/Owned/Sold) share the shape.

**Price display** — tabular number, muted currency/coin glyph. **Bone-grey** wherever prices
repeat (the listing table); **bone** only as the view's focal price in the item detail modal (the
"one torch").

**Tabs / segmented control** — underline-on-active or iron-outlined segments; active =
**iron bright** text and underline, never bone (the view's primary CTA already holds the torch;
the All / Mine toggle is a segmented control).

**Listing table (marketplace — the listing browser)** — the Bazaar browses listings as a
**table**, not a card grid: a buyer compares many relics on a few facts (price, time left,
rarity), and columns line those facts up where a grid scatters them.
- **Rows** on `bg-card`, an iron hairline between them; hover raises the row to `bg-card-2`. A
  row is one listing and activates (click, Enter) to open the item detail modal.
- **Columns:** Item (icon · name · rarity badge) · Type or slot · Current price · Bids · Time
  left · Action. Price, bids and time left are right-aligned, tabular figures. The action cell
  holds the row's CTA, or plain text ("Your listing", "Sign in to bid").
- **Sort** from the column headers — price, time left, rarity — with the active column and its
  direction shown (a Heroicons chevron plus `aria-sort`), never by colour alone. Default: time
  left, ascending.
- **Filter chips** above the table, per the toolbar bar below: the five rarity tiers and item type,
  every active chip iron bright: a rarity chip carries its tier by label, not colour.
- **Accent edge:** a 2–3px left edge in the row's rarity colour; the only rarity colour on the
  row besides the badge and the faint hover glow.
- **Price** in the table is **bone-grey** with the muted `⟡` glyph, and no bone anywhere in a row,
  so a column of prices does not become a column of torches. The price turns bone only in the
  detail modal, where it is the view's focal number.
- **Loading:** skeleton rows at row height, iron shimmer. **Empty:** the muted copy and one
  action, in the table's place.
- Keyboard: rows are focusable in order with a visible iron focus ring; headers are buttons.
  Targets ≥40px. Below 640px the lesser columns (type, bids) drop, never the price or time left.

**Modal / item detail** — `bg-card` (or `bg-darker`), iron border, `blur(20px)`, deep shadow,
radius `10–12`, rises in from below (`.enter-from-below`) over a fading scrim; close top-right;
trap focus; `Esc` closes.

**Feedback** — *inline:* error → oxblood tint, copy in `--color-danger-text`
(`.login-error`/`.profile-error`); success → **bone/iron, not green** (success uses the torch,
per palette rules). *Toasts:* dark panel, iron border, auto-dismiss. *Empty state:* muted
bone-grey copy + one action ("The coffers are bare — return after the next delve"). *Loading:*
skeletons shimmer with a faint **iron** sweep, never a bright one; spinner = iron ring.

**Tooltips** — dark chip, iron hairline, small bone-grey text, short delay.

---

## Iconography

Clean **line icons** (`@heroicons/react`, already a dep), `18–24px`, stroke, bone-grey (bone
only inside one of the four torch uses),
consistent grid & weight. Prefer small carved/wax-seal badges over emoji. **No emoji in UI.**

---

## Voice & tone (web)

- Reuse the player/Spire lore (Part I copy voice). Marketplace naming may lean lore — "The
  Trove" / "Bazaar of the Deep"; items are "relics/plunder"; currency is "gold".
- **Money-clarity exception:** for real-money / subscription flows, use unambiguous verbs
  ("Subscribe", "Pay", the price) over lore — never hide a paid action behind flavor. Reserve
  "Acquire/Claim" for in-game-currency purchases.

---

## Accessibility

- **Contrast:** every text token, and bone, must clear 4.5:1 on soot (browser figures in the
  contrast floor table). **Text on bone fills is `--color-bg-dark`**
  (`#121212`), never white. No body text on saturated fills.
- **Never rely on rarity color alone** — always pair with the text label.
- **Focus-visible** iron ring on every interactive element; full keyboard path through grid,
  filters, and modal (tab/arrow, `Esc` to close, focus trap in dialogs).
- **Targets** ≥ `40px`. Honor `prefers-reduced-motion`.

---

## Known drift (fix toward this doc; do not extend)

`globals.css` carried **off-palette, pre-barrow leftovers**. FS-SWMNW migrates them; this list is
kept as the record of what was wrong, not as outstanding work:
- `body { color: #fff }` → **vellum `#cdbf9a`** (`--color-text`). Pure white is too cold.
- Cold **bluish** text `#e0e8f0` (`.profile-name`, `.sub-plan-name`) and `#889aaa`
  (`.sub-feature-item`) → **vellum / vellum-dark**.
- Pink error text `#ff6688` (`.profile-error`, `.sub-error`) → **oxblood** family.
- Neon purple `#bf5fff` in the landing rarity map, mint `#4ecca3` and `#0f0f23` in the Stripe
  Elements appearance object, cyan `#00d4e6` in the notification bell gradient.
- **Tokens only, no raw hex.** This is now ADR-0013 and is enforced by a lint fence, not by
  attention. A new UI colour is a token in `globals.css` `:root` *and* the UI table in `theme.ts`
  first, then referenced (ADR-0025).
- **Raw rgba triples of the amber palette** outside `:root` (brass, arcane, oxblood, amber, the
  umber surfaces, the warm highlights and darks, and leftover cold blues) slipped past the hex
  fence. FS-8TCN2 §B.11 retired them in slice 2 (I-8TCN2-2): each became a token or a
  `color-mix(in srgb, var(--color-*) N%, transparent)` derived from one, the warm darks became
  the three `--color-bg-*` ground tokens, and the cold blues folded into the nearest warm token.
  The fence now rejects non-neutral `rgb()` / `rgba()` literals outside `:root`, in CSS and in
  TS/TSX alike.

---

## Implementation notes

- **Tailwind v4** (CSS-first). UI tokens live in `globals.css` / `@theme` so utilities resolve;
  the existing `--color-*` vars are the pattern.
- Keep `:root` and the UI table in `theme.ts` agreeing: they are the UI palette in two forms (CSS
  variables and JS strings). `BARROW` / `BARROW_HEX` are the game palette and do not track them
  (ADR-0025). Nothing forces `:root` and the UI table to agree except review: the fence proves a
  colour came from *a* palette, not from the right one.
- Reuse existing class patterns (`.btn-primary`, `.login-*`, `.profile-*`, `.sub-*`) as the
  reference implementation; the marketplace should read as the same family.
