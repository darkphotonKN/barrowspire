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
> **Part I — Game Canvas & In-Game HUD (pixel art)**. For the **web / platform DOM UI**
> (marketplace, profile, auth, leaderboard, subscription — React/Next/Tailwind, *not* pixel
> art) jump to **[Part II — Web / Platform UI Design System](#part-ii--web--platform-ui-dom-design-system)**
> at the end. The Part I "9-slice pixel border" rule applies to the game canvas HUD **only**,
> not the web platform. The "drop Cinzel" rule now applies to **both** — see Part II Typography.

---

## Identity & Mood

- **The Age of Barrowspire** — a dark, gothic, medieval dungeon-crawl. Torch-lit,
  oppressive, barrow-deep, rumor-haunted. Players are **delvers** who descend into the
  **Spire** and escape with relics.
- Reference feel: a 2D tile-based medieval CRPG world — earthy, lived-in, hand-built
  environments read from a fixed game camera. **Dark fantasy, not bright high-fantasy.**
- The world should feel cold and dangerous, with warmth only where torches burn. Dread
  and rumor over spectacle.

---

## Art Technique — Pixel Art (the chosen medium)

- **Clean pixel art:** chunky, readable pixels — mid-resolution. Not micro 8-bit, not
  hi-res painterly.
- **Nearest-neighbor only.** No anti-aliasing, smoothing, or blur on game art.
  - Phaser: `pixelArt: true` / `roundPixels`.
  - DOM: `image-rendering: pixelated` on pixel assets.
  - These are render-config flags only (presentation), and are allowed.
- **Shading via hand-placed clusters and dithering**, not gradient filters.
- **Selective dark outlining** on sprites so they read against dark backgrounds.
- **Preserve the existing rig:** keep current sprite/tile dimensions, frame counts, and
  directions. Restyle the art *within* them. Do **not** change tile grid size or
  projection/camera — that is layout/logic, out of scope for art.

---

## Perspective

- Whatever projection the engine currently uses (top-down 3/4 or isometric) **stays
  as-is**. The pixel style applies within it. **Do not re-project the world.**

---

## Palette (fixed, limited global ramp)

Pixel art needs a tight shared palette. Base everything on this barrow ramp. (These
values are mirrored in code by `src/utils/theme.ts` — `BARROW` / `BARROW_HEX`.)

| Role | Values |
|------|--------|
| **Darks** (bases, NOT pure black) | charcoal `#161310`, deep umber `#241a12` |
| **Stone** | slate `#3a3d42`, `#54585f` |
| **Earth / barrow** | browns `#5a4632`, `#3e2f22` |
| **Torch warmth** (the only real light) | amber `#e8a14d`, ember `#c2611f` |
| **Arcane / Lich corruption** | sickly green `#6f8f4a`, necrotic teal `#4a6b6f` |
| **Blood / danger** | oxblood `#6e1f1f` |
| **Parchment / UI** | vellum `#cdbf9a`, darkened `#8a7d5c`, ink `#1c1712` |
| **Brass** | `#9c7b3f`, `#c9a14e` |

**Rules:**
- Keep darks as bases, **never pure black** — preserve enough value range that pixel
  detail still reads in dim scenes.
- Low-key, desaturated overall. Warm torch pools against cold dark.
- **No bright saturated primaries.** No neon, no cyan, no electric glows.

---

## In-Game Canvas / World Art

- **Environment:** dark dungeon stone, cracked flagstone, mossy/wet walls, wooden doors
  with iron banding, barrow earth, bone piles, rubble, cobwebs.
  - Tiles must tile seamlessly.
  - Clear floor/wall distinction.
- **Props:** wall torches and braziers (2–4 frame flicker), chests, broken pillars,
  hanging chains. Keep prop animation limited.
- The world reads as a **torch-lit crypt:** pooled warm light, deep shadow, with shading
  baked into the tiles so it looks lit *before* any overlay is applied.

---

## Characters / Enemies

- **Delver (player):** cloaked/armored figure with a lantern or torch; strong silhouette;
  limited walk/idle frames matching the existing rig.
- **Enemies (restyle whatever exists):** barrow/undead themes — skeletons, wraiths,
  revenants. Dark palette; **glowing eyes as the readable accent.**

---

## Lighting

- **Pixel-friendly approach:** bake shading into tiles/sprites first, then add a soft
  torch **glow** + **vignette** overlay on top.
- The glow/vignette overlay **may be a separate soft (non-pixel) layer** so it does not
  smear the art.
- **Keep all sprite/tile rendering crisp and nearest-neighbor** regardless of the overlay.

---

## Typography — push fully medieval

The current fonts read too modern. Target:

- **Display / titles / menu headers:** a true **blackletter** — UnifrakturMaguntia or
  UnifrakturCook (overtly medieval). Large text only, since blackletter is hard to read
  small. Pirata One is a lighter alternative.
- **In-game HUD / functional / body text:** a medieval **pixel/bitmap font** to match the
  art — e.g. **Alagard** (free pixel fantasy font, ideal here) or a similar pixel serif.
  This is the readable workhorse.
- **Drop clean Roman serifs (e.g. Cinzel) as the primary** — too modern/classical for the
  target. Keep one legible fallback in the stack.

---

## UI Chrome (align to pixel art)

- **Panels / menus:** pixel-art parchment and carved-stone frames using **9-slice pixel
  borders** — not smooth CSS gradients or rounded rectangles. Use `image-rendering:
  pixelated` on UI sprite assets.
- **Buttons:** beveled stone / wax-seal feel in pixel style; brass accents; pixel hover
  states.
- **Icons:** pixel iconography on a consistent grid.
- **Copy voice:** grim, terse. Players = **delvers**; enemy realm = the **Spire** / **Lich
  Lord**; "Play" → "Delve"; death → "Few return whole."
  - (Captured here for consistency; actual string swaps happen in the reskin pass.)

---

## Out of Scope (do not change as "art")

- Tile grid size, world projection, and camera — these are layout/logic.
- Backend, Go, ECS, networking, schemas, or game logic.
- The existing animation rig's frame counts and directions — restyle within them.

---
---

# Part II — Web / Platform UI (DOM) Design System

**Scope.** Governs the **web platform UI** rendered in React/Next/Tailwind DOM — the marketplace,
profile, leaderboard, auth (login/register), subscription, portal, header/menus, and any future
web surface. This is **not pixel art**: unlike the in-game HUD (Part I), the platform UI uses
modern web layout, smooth CSS, rounded corners, and blur. The medieval feel is carried by
**type, color, brass detailing, and micro-ornament — not textures or 9-slice pixel frames.**
(The Part I "9-slice pixel border" rule is game-canvas-HUD only. The "drop Cinzel" rule now
applies here too: the web platform uses **Pirata One + EB Garamond** — see Typography.)

**Direction:** *modern web design, medieval aesthetics.* Dark-first (torch-lit crypt), brass as
structural accent, a single amber "torchlight" moment per view. Fast, scannable, keyboard- and
mobile-friendly — the medievalism is in the finish, never at the cost of usability.

**Runtime source of truth:** the CSS variables in [`../src/app/globals.css`](../src/app/globals.css)
`:root` and the palette in [`../src/utils/theme.ts`](../src/utils/theme.ts) (`BARROW` /
`BARROW_HEX`). This doc is the *intent*; those files are the *runtime* — keep them in sync (add a
token here → add the CSS variable too).

---

## Principles

1. **Dark, never black.** Base surfaces are warm umber/stone (`#1c1613` / `#100c0a`), not `#000`
   and not near-black. A base with no value above the floor makes every accent read as emission,
   which is how a palette that already said "no neon" produced neon anyway.
2. **One torch per view.** Amber (`--color-primary` `#e8a14d`) marks the single most important
   thing — primary CTA, active nav, page `h1`, the price to notice. Overuse dilutes it.
3. **Brass is structure, not fill.** Brass (`#9c7b3f`) lives in 1px hairline borders, dividers,
   focus rings, and hover glows — rarely a solid fill. Panels are dark; brass frames them.
4. **Modern layout, medieval finish.** Grid/flex, responsive, generous spacing, real interaction
   affordances. Medieval = blackletter display, uppercase spaced labels, vellum text, brass
   rules, small carved/wax-seal badges, and the CSS material layer below. No image textures.
5. **Motion communicates.** Entrance/hover/focus show *what changed*; ≤0.3s; honor
   `prefers-reduced-motion`. No decorative animation.

---

## Color tokens (semantic → CSS var → value)

| Token | CSS var | Value | Use |
|---|---|---|---|
| Primary (torch amber) | `--color-primary` | `#e8a14d` | CTAs, active states, `h1`, price, focus |
| Primary bright *(new)* | `--color-primary-bright` | `#f2b866` | hover/emphasis on amber; legendary rarity |
| Accent (arcane green) | `--color-accent` | `#6f8f4a` | secondary highlight, subtitle, cancel/secondary |
| Danger (oxblood) | `--color-danger` | `#6e1f1f` | errors, destructive, death |
| Page bg | `--color-bg-dark` | `#1c1613` | body / page background |
| Page bg (deepest) | `--color-bg-darker` | `#100c0a` | splash, dropdown base, wells |
| Surface / card | `--color-bg-card` | `rgba(42,33,26,0.88)` | cards, panels, modals (with blur) |
| Surface raised *(new)* | `--color-bg-card-2` | `rgba(54,43,34,0.92)` | hovered/elevated card, nested panel |
| Border (brass hairline) | `--color-border` | `rgba(156,123,63,0.15)` | default 1px borders/dividers |
| Border strong *(new)* | `--color-border-strong` | `rgba(156,123,63,0.35)` | hover/focus/active border |
| Text primary *(new)* | `--color-text` | `#cdbf9a` (vellum) | body text, item names, values |
| Text muted | `--color-text-dim` | `#9b8e6a` | labels, secondary info |
| Text dim | `--color-text-muted` | `#8d8362` | footnotes, hints, small labels |
| Brass | (`theme.ts` `brass`/`brassBright`) | `#9c7b3f` / `#c9a14e` | borders, accents, glows |

Add the *(new)* tokens to `globals.css` before building the marketplace — the palette already
implies them (`theme.ts` `umber`, `vellum`, `amberBright`, `brass`). **`--color-text` (vellum)
is the default body colour** — pure white is off-palette and reads cold.

### Contrast floor (the bases are chosen against it)

**Body and label text ≥ 4.5:1. Decorative, hint and disabled text ≥ 3:1.** Measured against
`--color-bg-dark` `#1c1613`:

| Text token | Value | Ratio | Tier |
|---|---|---|---|
| `--color-text` (vellum) | `#cdbf9a` | 9.81:1 | body ✓ |
| `--color-primary` (amber) | `#e8a14d` | 8.21:1 | body ✓ |
| `--color-bg-dark` on amber fill | `#1c1613` | 8.21:1 | body ✓ |
| `--color-text-dim` | `#9b8e6a` | 5.52:1 | body ✓ |
| `--color-text-muted` | `#8d8362` | 4.73:1 | body ✓ |

`--color-text-dim` and `--color-text-muted` were **lifted from `#8a7d5c` / `#6f6647`**, which
measured 4.41:1 and 3.16:1 — both already failing their tier against the *old* `#0d0b0a` base,
before any lift. The value range moves with the base; these are not independent choices.

**Every text token clears 4.5:1**, including `--color-text-muted`. An earlier draft parked it in
the 3:1 decorative tier, but measurement in the browser showed it carrying real body copy, hint
lines and the version footer — those are labels, not decoration. The 3:1 tier is reserved for
genuinely disabled controls, which are expressed with opacity rather than this token.

The **rarity badge is small text** (11px uppercase), so the ramp is held to the 4.5:1 body floor
too. Common and Rare were lifted for this reason; both failed at badge size otherwise.

**Text on an amber fill is always `--color-bg-dark`, never white.**

---

## Accent vs structure — what carries what

"One torch per view" says what amber is *for*. It never said what carries everything else, so
amber became the entire accent system by default: **49 occurrences in `globals.css` against 4
brass and 1 oxblood.** One saturated hue on a near-black ground, repeated everywhere, is neon
regardless of what the token is called. This rule closes that gap.

**Amber (`--color-primary`) is permitted on exactly four things, at most one instance each per
view:**

1. the **primary CTA**
2. the **active nav item**
3. the **page `h1`**
4. the **single focal number** the view exists to show (a price, a rank, a balance)

Plus the rarity exemption below. **Nothing else.** Not borders, not dividers, not labels, not
hover states on secondary controls, not icons, not decorative rules.

*One* clarification, because long pages hit it immediately: a **single CTA identity may repeat
once at the foot of a long page** (the same button, the same words, the same action). That is one
torch shown twice for reach, not two torches competing — two *different* amber CTAs in one view
still breaks the rule.

**What carries the rest — these are load-bearing, not decoration:**

| Role | Colour | Used for |
|---|---|---|
| Structure | **brass** `#9c7b3f` / `--color-border` | borders, dividers, focus rings, hairlines, hover glows |
| Text | **vellum** `--color-text` / `-dim` / `-muted` | all body, label and value text |
| Surface | **stone / umber** `--color-bg-*` | pages, cards, panels, wells |
| Secondary action | **arcane green** `--color-accent` | cancel, secondary, subtitle |
| Danger | **oxblood** `--color-danger` | errors, destructive, death |

A view that needs a second emphasis colour reaches for **brass**, never a second amber.

---

## Rarity ramp (marketplace)

Items carry a rarity. Express it on the **card accent border, the rarity badge, and a faint
hover glow** — never as a full card fill (keeps the grid calm). **Always pair color with the
text label** (colorblind safety).

| Rarity | CSS var | Value | Palette source |
|---|---|---|---|
| Common | `--rarity-common` | `#a2946d` | vellum-dark, lifted to clear 4.5:1 at badge size |
| Uncommon | `--rarity-uncommon` | `#6f8f4a` | arcane green |
| Rare | `--rarity-rare` | `#688b8f` | necrotic teal, lifted to clear 4.5:1 at badge size |
| Epic | `--rarity-epic` | `#9c7b3f` | brass |
| Legendary | `--rarity-legendary` | `#f2b866` | amber-bright |

Make these the **canonical rarity colours**: align `items-service` `item_rarities.color_hex` to
them (or map at the API) so server data and UI agree. Add the vars to `globals.css`.

### The rarity ramp is exempt from one-torch-per-view

`--rarity-legendary` is amber-bright, so a grid of legendary relics repeats amber across a view
— which the one-torch rule otherwise forbids. Without this clause the two rules contradict each
other and whoever implements the grid picks one at random. The exemption, and its reasoning:

**Rarity colour is data, not emphasis.** It encodes a property of an item rather than directing
attention to one thing, so it is not competing for the torch — it is a different channel that
happens to share a hue. Repetition across a grid is correct behaviour for data, and would be
wrong behaviour for emphasis.

**The exemption is scoped, not general.** Rarity colours may appear only on:
- the **rarity badge**
- the **card accent border** (top or left edge)
- a **faint hover glow** on the card

They may **never** be used as a CTA, nav, heading, or link colour, and a rarity colour never
becomes a card fill. Outside those three places, `--rarity-legendary` is amber like any other
amber and the one-torch rule applies in full.

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

**`h1` is amber, one per view.**

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
| Page `h1` | 29–32 / 38 | page title (amber) |
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
- **Glows (hover/focus):** warm amber/brass `box-shadow`, opacity `0.1–0.4`. Focus ring
  `0 0 0 2px rgba(156,123,63,0.25)`. **Never neon.**
- **Borders:** 1px brass hairline (`--color-border`); raise to `--color-border-strong` on
  hover/focus/active.
- **Blur:** floating surfaces (header, dropdown, modal, card) use `backdrop-filter: blur(20px)`.
- **Motion:** micro `0.2s`, standard `0.3s ease`. Button/card hover `translateY(-2px)` + glow.
  Entrances: `slideIn` / `fadeInScale` (already in `globals.css`). Spinner = brass ring.
  Respect `prefers-reduced-motion: reduce`.

---

## Material & depth

The half this document never specified, and the reason a palette that already forbade neon
produced it anyway. **Medievalism comes from material and hue range, not from an accent colour.**
Flat dark surfaces plus one saturated hue will read as a dark web app with a brand colour no
matter how the hue is named; stone, parchment, leather and brass patina are what read as a world.

**Everything here is CSS. No image assets** — no textures, no 9-slice frames, no background
images. `public/` stays empty. That constraint is deliberate: the material layer must ship
without waiting on art.

### The five primitives

1. **Grain.** A single low-opacity noise field over the page, via an inline SVG
   `feTurbulence` `data:` URI. It breaks the flatness of large dark fills, which is what makes a
   dark page read as a surface rather than an absence. Keep it *barely* visible — if you can see
   the noise as noise, it is too strong.
2. **Surface gradients.** Cards, panels, modals, header and dropdowns carry a shallow layered
   gradient so they read as carved stone or parchment rather than a flat fill. Subtle: a surface
   should look lit from somewhere, not shaded.
3. **Carved edges.** Inset shadows — a light top edge and a dark bottom edge, or the inverse for
   engraved — within the existing radius scale. This is what makes a panel read as cut *into*
   or *out of* material rather than pasted on it.
4. **Vignette.** The page edges darken. The world presses in at the borders of the light; this
   is the single cheapest way to make a screen feel torch-lit.
5. **Ornament.** Corner marks, brass rules, and dividers, drawn with borders and pseudo-elements.
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
- **No glow may read as emission.** Warm brass/amber `box-shadow` at 0.1–0.4 opacity marks a
  hover or focus state. A glow bright enough to look like a light source is neon by another name.

---

## Components

Barrowspire web UI is **custom Tailwind + CSS classes** (no shadcn — that's the Fireplace repo).
Prefer Tailwind utilities driven by the tokens above; extract a shared class only when a pattern
repeats; use a `cn()` helper for conditional classes.

**Buttons** — *Primary:* amber fill, dark text (`--color-bg-dark`), uppercase, letter-spacing
`0.1em`, radius 6, hover `translateY(-2px)` + amber glow (`.btn-primary`, `.login-button`).
*Secondary:* transparent, brass border, `text-dim` → amber on hover (`.btn-secondary`).
*Destructive:* oxblood. *Disabled:* opacity `0.5–0.6`, no transform. *Loading:* inline brass
spinner, stable width.

**Inputs / forms** — dark well `rgba(13,11,10,0.8)`, brass border `0.1` → focus `0.4` + brass
ring, vellum text, placeholder `#5a5238`, radius 6. Label above: uppercase, `text-dim`, small.

**Cards & panels** — `bg-card`, 1px brass border, radius `8–12`, `backdrop-blur`, card shadow,
`2rem` padding. Interactive cards: hover raises border + faint glow + `translateY(-2px)`.

**Item card (marketplace — primary primitive)**
- Layout (approved direction): thumb/icon · **rarity badge** (top-right) · **item name** (vellum,
  lead size) · thin brass divider · **stat row** (attack / crit / defense, each a line icon — not
  emoji) · **price** (amber number + coin glyph `⟡`) · **Acquire** CTA (primary; full-width on
  compact cards).
- **Rarity** = top/left accent border in the rarity color + the badge + a faint rarity glow on
  hover. Card body stays dark charcoal (no rarity fill).
- Sizing: min width `~220–260px`, internal `gap-2/gap-3`, radius 8.
- States: default (border `0.15`) · hover (border-strong + lift + rarity glow) · focus-visible
  (brass ring) · owned/disabled (reduced opacity + "Owned" badge replacing price).

**Item grid** — responsive `grid` `auto-fill minmax(220px, 1fr)`, gap `1rem–1.25rem`; collapses
to 1–2 cols ≤640px.

**Filter / toolbar bar** — search input (left) · **filter chips** (rarity/type/slot) as pills
(brass border; active = amber or the rarity color) · **sort** dropdown (right). Sticky under the
header when long.

**Badges & pills** — small, uppercase, letter-spacing, radius `3–4`. Rarity badge uses the rarity
color (text or hairline on a dark chip). Status badges (New/Owned/Sold) share the shape.

**Price display** — amber number (tabular), muted currency/coin glyph. Prominent but singular per
card (the "one torch").

**Tabs / segmented control** — underline-on-active (amber, like `.nav-link`) or brass-outlined
segments; active = amber text.

**List / table view (alt layout)** — rows on `bg-card`, brass divider between, hover raises row
bg; right-aligned price + CTA.

**Modal / item detail** — `bg-card` (or `bg-darker`), brass border, `blur(20px)`, deep shadow,
radius `10–12`, `fadeInScale` entrance; close top-right; trap focus; `Esc` closes.

**Feedback** — *inline:* error → oxblood tint (`.login-error`/`.profile-error`); success →
**amber/brass, not green** (success uses the torch, per palette rules). *Toasts:* dark panel,
brass border, auto-dismiss. *Empty state:* muted vellum copy + one action ("The coffers are
bare — return after the next delve"). *Loading:* skeletons shimmer with a faint **brass** sweep
(not bright gray); spinner = brass ring.

**Tooltips** — dark chip, brass hairline, small vellum text, short delay.

---

## Iconography

Clean **line icons** (`@heroicons/react`, already a dep), `18–24px`, stroke, amber/vellum,
consistent grid & weight. Prefer small carved/wax-seal badges over emoji. **No emoji in UI.**

---

## Voice & tone (web)

- Reuse the delver/Spire lore (Part I copy voice). Marketplace naming may lean lore — "The
  Trove" / "Bazaar of the Deep"; items are "relics/plunder"; currency is "gold".
- **Money-clarity exception:** for real-money / subscription flows, use unambiguous verbs
  ("Subscribe", "Pay", the price) over lore — never hide a paid action behind flavor. Reserve
  "Acquire/Claim" for in-game-currency purchases.

---

## Accessibility

- **Contrast:** vellum (`#cdbf9a`) and amber on charcoal pass for text; **text on amber fills
  must be dark** (`#0d0b0a`), never white. No body text on saturated fills.
- **Never rely on rarity color alone** — always pair with the text label.
- **Focus-visible** brass ring on every interactive element; full keyboard path through grid,
  filters, and modal (tab/arrow, `Esc` to close, focus trap in dialogs).
- **Targets** ≥ `40px`. Honor `prefers-reduced-motion`.

---

## Known drift (fix toward this doc; do not extend)

`globals.css` carried **off-palette, pre-barrow leftovers**. FS-0004 migrates them; this list is
kept as the record of what was wrong, not as outstanding work:
- `body { color: #fff }` → **vellum `#cdbf9a`** (`--color-text`). Pure white is too cold.
- Cold **bluish** text `#e0e8f0` (`.profile-name`, `.sub-plan-name`) and `#889aaa`
  (`.sub-feature-item`) → **vellum / vellum-dark**.
- Pink error text `#ff6688` (`.profile-error`, `.sub-error`) → **oxblood** family.
- Neon purple `#bf5fff` in the landing rarity map, mint `#4ecca3` and `#0f0f23` in the Stripe
  Elements appearance object, cyan `#00d4e6` in the notification bell gradient.
- **Tokens only, no raw hex.** This is now ADR-0013 and is enforced by a lint fence, not by
  attention. A new colour is a token in `globals.css` *and* `theme.ts` first, then referenced.

---

## Implementation notes

- **Tailwind v4** (CSS-first). Define the new tokens (`--color-bg-card-2`,
  `--color-border-strong`, `--color-text`, `--color-primary-bright`, `--rarity-*`) in
  `globals.css` / `@theme` so utilities resolve; the existing `--color-*` vars are the pattern.
- Keep `theme.ts` (`BARROW_HEX`) and the CSS vars agreeing — same palette in two forms (Phaser
  ints vs CSS strings).
- Reuse existing class patterns (`.btn-primary`, `.login-*`, `.profile-*`, `.sub-*`) as the
  reference implementation; the marketplace should read as the same family.
