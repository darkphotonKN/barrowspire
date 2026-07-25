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
> at the end. The Part I "drop Cinzel" and "9-slice pixel border" rules apply to the game
> canvas HUD **only**, not the web platform.

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
(The Part I "drop Cinzel" and "9-slice pixel border" rules are game-canvas-HUD only; the web
platform keeps **Cinzel + EB Garamond**.)

**Direction:** *modern web design, medieval aesthetics.* Dark-first (torch-lit crypt), brass as
structural accent, a single amber "torchlight" moment per view. Fast, scannable, keyboard- and
mobile-friendly — the medievalism is in the finish, never at the cost of usability.

**Runtime source of truth:** the CSS variables in [`../src/app/globals.css`](../src/app/globals.css)
`:root` and the palette in [`../src/utils/theme.ts`](../src/utils/theme.ts) (`BARROW` /
`BARROW_HEX`). This doc is the *intent*; those files are the *runtime* — keep them in sync (add a
token here → add the CSS variable too).

---

## Principles

1. **Dark, never black.** Base surfaces are charcoal/umber (`#0d0b0a` / `#1a1410`), not `#000`.
2. **One torch per view.** Amber (`--color-primary` `#e8a14d`) marks the single most important
   thing — primary CTA, active nav, page `h1`, the price to notice. Overuse dilutes it.
3. **Brass is structure, not fill.** Brass (`#9c7b3f`) lives in 1px hairline borders, dividers,
   focus rings, and hover glows — rarely a solid fill. Panels are dark; brass frames them.
4. **Modern layout, medieval finish.** Grid/flex, responsive, generous spacing, real interaction
   affordances. Medieval = Cinzel titles, uppercase spaced labels, vellum text, brass rules,
   small carved/wax-seal badges. No skeuomorphic textures.
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
| Page bg | `--color-bg-dark` | `#0d0b0a` | body / page background |
| Page bg (deepest) | `--color-bg-darker` | `#070605` | splash, dropdown base, wells |
| Surface / card | `--color-bg-card` | `rgba(20,16,12,0.85)` | cards, panels, modals (with blur) |
| Surface raised *(new)* | `--color-bg-card-2` | `rgba(28,23,17,0.9)` | hovered/elevated card, nested panel |
| Border (brass hairline) | `--color-border` | `rgba(156,123,63,0.15)` | default 1px borders/dividers |
| Border strong *(new)* | `--color-border-strong` | `rgba(156,123,63,0.35)` | hover/focus/active border |
| Text primary *(new)* | `--color-text` | `#cdbf9a` (vellum) | body text, item names, values |
| Text muted | `--color-text-dim` | `#8a7d5c` | labels, secondary info |
| Text dim | `--color-text-muted` | `#6f6647` | footnotes, hints, disabled |
| Brass | (`theme.ts` `brass`/`brassBright`) | `#9c7b3f` / `#c9a14e` | borders, accents, glows |

Add the *(new)* tokens to `globals.css` before building the marketplace — the palette already
implies them (`theme.ts` `umber`, `vellum`, `amberBright`, `brass`). **`--color-text` (vellum)
should also become the default body colour** — see Known Drift.

---

## Rarity ramp (marketplace)

Items carry a rarity. Express it on the **card accent border, the rarity badge, and a faint
hover glow** — never as a full card fill (keeps the grid calm). **Always pair color with the
text label** (colorblind safety).

| Rarity | CSS var | Value | Palette source |
|---|---|---|---|
| Common | `--rarity-common` | `#8a7d5c` | vellum-dark |
| Uncommon | `--rarity-uncommon` | `#6f8f4a` | arcane green |
| Rare | `--rarity-rare` | `#4a6b6f` | necrotic teal |
| Epic | `--rarity-epic` | `#9c7b3f` | brass |
| Legendary | `--rarity-legendary` | `#f2b866` | amber-bright |

Make these the **canonical rarity colours**: align `items-service` `item_rarities.color_hex` to
them (or map at the API) so server data and UI agree. Add the vars to `globals.css`.

---

## Typography

- **Display / headings:** Cinzel (`--font-heading`, `.font-display`) — weathered serif, wide
  letter-spacing (`0.05em`+), often uppercase. **`h1` is amber, one per view.**
- **Body / values:** EB Garamond (`--font-body`) — old-style serif, kept legible.
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

`globals.css` carries a few **off-palette, pre-barrow leftovers** — migrate them:
- `body { color: #fff }` → **vellum `#cdbf9a`** (`--color-text`). Pure white is too cold.
- Cold **bluish** text `#e0e8f0` (`.profile-name`, `.sub-plan-name`) and `#889aaa`
  (`.sub-feature-item`) → **vellum / vellum-dark**.
- Pink error text `#ff6688` (`.profile-error`, `.sub-error`) → **oxblood** family.
- New marketplace work uses tokens only — no raw hex; add a semantic token here + in
  `globals.css` (and the rarity vars) first.

---

## Implementation notes

- **Tailwind v4** (CSS-first). Define the new tokens (`--color-bg-card-2`,
  `--color-border-strong`, `--color-text`, `--color-primary-bright`, `--rarity-*`) in
  `globals.css` / `@theme` so utilities resolve; the existing `--color-*` vars are the pattern.
- Keep `theme.ts` (`BARROW_HEX`) and the CSS vars agreeing — same palette in two forms (Phaser
  ints vs CSS strings).
- Reuse existing class patterns (`.btn-primary`, `.login-*`, `.profile-*`, `.sub-*`) as the
  reference implementation; the marketplace should read as the same family.
