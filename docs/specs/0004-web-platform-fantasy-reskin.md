# FS-0004: Fantasy-medieval presentation on the web platform

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "## Capabilities" → "### Presentation" → "Fantasy-medieval presentation on the web platform" → this FS · Art SSOT: [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md) Part II · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) · Sibling: [FS-0005](0005-game-canvas-fantasy-reskin.md) (game canvas) · Related ADRs: [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (token-only styling, fence-enforced)

## Summary

The web platform — landing, auth, profile, leaderboard, subscription, header and menus — reads
as amber neon on a black background rather than as a dark medieval world. This feature makes the
DOM surface look and read like The Age of Barrowspire: blackletter display type, a palette where
brass and stone carry structure and amber is reserved for one thing per view, surfaces lifted off
black so they read as material, and a CSS-only texture layer that gives the page grain, depth and
carved edges without a single image file.

The direction is not new. `design-guideline.md` Part II and `game-client/CLAUDE.md` already
prescribe most of it, including "no neon", "dark never black", "one torch per view", and an exact
list of lore copy swaps. **None of it was enforceable, so none of it held.** This work order
therefore does three things in sequence: closes the gaps in the guideline where it was genuinely
under-specified (material and depth), brings the code into conformance with the guideline as
amended, and — via ADR-0013 — leaves behind a gate so the conformance survives.

Scope is presentation only: colour, type, texture, and the words on screen. No layout
restructuring, no image assets, no endpoint changes. The Phaser canvas is [FS-0005](0005-game-canvas-fantasy-reskin.md).

## Requirements

### A. Amend the visual SSOT (prerequisite to everything else)

The design guideline wins over any other document on a visual decision, so the values cannot be
pinned here — that would create two sources of truth. These requirements state the **properties**
the amendment must satisfy; the amendment authors the actual values into the guideline's token
table, and the code then reads them from there.

1. **Part II typography rule is replaced.** The guideline currently reserves blackletter for the
   game canvas and keeps Cinzel for the web. Amend it to specify a blackletter display face
   (UnifrakturMaguntia or Pirata One) for web display type, paired with a readable old-style
   serif for body and labels.
2. **The amendment states a hard minimum size for blackletter.** Blackletter is permitted only
   at display sizes and named surfaces — logo, hero, page `h1`. The guideline already warns it is
   "hard to read small"; the amendment converts that warning into a bound the implementation and
   review can both check.
3. **A new "Material & depth" section is added** — the half the guideline never specified. It
   defines the CSS-only material vocabulary: grain, surface gradients, carved/beveled edges,
   vignette, and ornament, with the rule that all of it is expressible without image assets.
4. **An accent-vs-structure rule is added.** The guideline says "one torch per view" but does not
   say what carries everything else. The amendment names brass, stone-slate, barrow-brown,
   oxblood and vellum as load-bearing surface and border colours, and enumerates the surfaces
   amber is still permitted on.
5. **Base surface values are lifted off near-black** into a warm umber/stone range, authored as
   new values for the existing background tokens. The amendment must state the contrast floor the
   lifted values are chosen against (see R31), because lifting the base narrows contrast with
   vellum text.
6. **`game-client/CLAUDE.md`'s "### Color Palette", "### Typography" and "### Visual Rules"
   sections are updated to mirror the amended guideline.** They currently restate the old values
   and would contradict the SSOT the moment it changes.

### B. Tokens

7. The tokens the guideline already names as *(new)* are defined in `globals.css`:
   `--color-bg-card-2`, `--color-border-strong`, `--color-text`, `--color-primary-bright`, and
   the five `--rarity-*` variables. The guideline flags these as required before further UI work.
8. `src/utils/theme.ts` (`BARROW` / `BARROW_HEX`) and the `globals.css` custom properties define
   the same palette and must agree value-for-value. A value present in one and absent from the
   other is a defect.
9. Tailwind v4 `@theme` declarations exist for every token that needs to resolve as a utility.
10. **No raw hex outside those two definition sites** (ADR-0013). This includes `styled-jsx`
    blocks and inline `style={{}}` objects, not only `globals.css`.

### C. Typography

11. The blackletter display face and the body serif are loaded via `next/font/google` in
    `layout.tsx`, following the existing `Cinzel` / `EB_Garamond` pattern, each exposed as a CSS
    variable.
12. Every font stack declares a real fallback chain ending in a generic family. A blackletter face
    that fails to load must degrade to something legible, never to the browser default sans.
13. Blackletter appears **only** on the surfaces R2 permits. Nav, labels, buttons, body copy,
    inputs, table cells, badges and footnotes use the body serif.
14. The `--font-heading` / `--font-body` variable names remain the styling contract, so component
    code does not need to know which face is bound to them.

### D. Palette and the amber demotion

15. Amber is reduced to one-torch-per-view: the primary CTA, the active nav item, the page `h1`,
    and the single number a view exists to show. Every other current amber use becomes brass or
    vellum. (Reference: `globals.css` currently carries 49 amber occurrences against 4 brass and
    1 oxblood.)
16. The rarity ramp in `src/app/page.tsx` is reconciled to the guideline's rarity table. The
    current map contradicts it on every entry — `Rare` is amber (burning the one-torch colour),
    `Epic` is a neon purple in no palette, `Legendary` is the arcane green the guideline assigns
    to `Uncommon`, and `Uncommon` is missing entirely. Rarity colours come from the `--rarity-*`
    tokens after this change, not from a component-local object.
17. Rarity is never signalled by colour alone; the text label is always present (guideline
    accessibility rule).
18. Base and card surfaces use the lifted values from R5.
19. `body { color: #fff }` becomes vellum via `--color-text`. Pure white is off-palette.
20. The enumerated off-palette values are removed: `#e0e8f0` (`globals.css:659,1250`), `#ff6688`
    (`globals.css:718,1360`), `#889aaa` (`globals.css:1288`, `leaderboard/page.tsx:332`),
    `#bf5fff` (`page.tsx:358`), `#00d4e6` (`NotificationBell.tsx:248`). This list is the known
    set, not a cap — R10's fence defines completeness.
21. Glow and shadow declarations (34 in `globals.css`) are re-tuned to the guideline's warm
    brass/amber range at low opacity. No glow reads as emission.

### E. Third-party and canvas surfaces

22. **The Stripe Elements appearance object is re-themed** (`subscription/page.tsx:107-111,
    262-279`). It currently declares a wholly separate sci-fi theme — `colorPrimary: #4ecca3`,
    `colorBackground: #0f0f23`, `colorText: #e2e8f0`, plus `#64748b`, `#94a3b8`, `#ef4444` — which
    no CSS change reaches. Values derive from the tokens.
23. **`ParticleText.tsx` is brought into the setting or removed.** It renders a mouse-reactive
    canvas starfield (`Star`, `twinkleSpeed`, `twinkleOffset`) on the landing page. A starfield is
    the wrong world; if a particle effect is kept, it must read as embers, dust or falling ash in
    palette colours. This is a judgment call the implementer makes explicitly, not silently.
24. The two `styled-jsx` surfaces (`leaderboard/page.tsx`, `NotificationBell.tsx`) receive the
    same treatment as `globals.css`. They are outside the main stylesheet and are the likeliest
    place for drift to survive a sweep.

### F. Material layer

25. A page-level grain is applied via an inline SVG `data:` URI. No image files.
26. Surfaces (cards, panels, modals, header, dropdowns) carry layered gradients that read as
    carved stone or parchment rather than flat fills.
27. Edges use inset shadows to read as beveled or engraved, within the guideline's radius scale.
28. A page vignette darkens the edges, per the guideline's lighting rule.
29. Ornament — corner marks, brass rules, dividers — is CSS-drawn.
30. The material layer degrades safely: with grain, gradients and vignette suppressed, every view
    remains legible and correctly laid out.

### G. Accessibility

31. Contrast is re-verified after the base lift, not assumed. The guideline's claim that vellum
    and amber "pass" was made against `#0d0b0a`; the lifted bases invalidate it. Body text,
    muted text, and text on amber fills are each measured. Text on amber fills stays dark.
32. `prefers-reduced-motion: reduce` is honoured by every transition and entrance animation.
33. `prefers-reduced-transparency` and `forced-colors` are handled: the material layer and
    `backdrop-filter` blur do not render content unreadable under either.
34. Focus-visible brass ring on every interactive element survives the reskin.

### H. Voice

35. Copy conforms to [`CONTEXT.md`](../../game-client/CONTEXT.md) and `game-client/CLAUDE.md`'s
    "Wording & Tone" section, which already specifies the swaps. `operator` and `Sector` are on
    its explicit **never use** list and are still in the code: `operator` at `page.tsx:151` and
    `leaderboard/page.tsx:85`; `SECTOR` at `login/page.tsx:189` and `register/page.tsx:232`.
    `Transmitting` (`register/page.tsx:207`) is the same sci-fi register.
36. The version footer becomes `v0.1 // The Barrow-Deep` per CLAUDE.md. The `v0.1` itself stays.
37. The money-clarity rule overrides lore on paid flows: "Subscribe", "Pay", and the real price
    stay unambiguous. Lore verbs are reserved for in-game-gold actions.
38. The `package.json` name changes from `void-raiders`. No other field changes.

### I. Enforcement

39. A lint check rejects raw hex outside the two definition sites, covering TS/TSX and CSS.
40. The check is proven with the `lint-fence.sh` pattern — asserted to reject a violating fixture
    *and* to accept the real tree — per ADR-0013. An unproven gate does not satisfy this
    requirement.
41. The fence lands last, once the tree can go green. It must not ship with an allowlist.

## User Stories

1. As a **prospective delver** landing on the site for the first time, I want the page to look
   like a dark medieval world, so that I understand what kind of game this is before reading a
   word.
2. As a **prospective delver**, I want the hero and logo set in blackletter, so that the brand
   reads as a barrow-crawl rather than a tech product.
3. As a **prospective delver**, I want the landing page not to show me a starfield, so that the
   first thing I see is not from a different genre.
4. As a **delver**, I want surfaces that read as stone and parchment, so that panels feel like
   objects in a world rather than dark rectangles.
5. As a **delver**, I want exactly one thing on each page to glow amber, so that I can tell at a
   glance what the page wants me to do.
6. As a **delver**, I want body text in vellum rather than pure white, so that the page reads warm
   and lit rather than cold and backlit.
7. As a **delver reading a long leaderboard**, I want body and label text in a legible serif, so
   that atmosphere never costs me the ability to read a name.
8. As a **delver**, I want page edges to darken, so that the screen feels torch-lit and pressed in
   by dark.
9. As a **returning delver**, I want the header, menus and notification bell restyled with
   everything else, so that no corner of the site is left in the old theme.
10. As a **delver browsing relics**, I want rarity colours that match the rest of the world, so
    that a legendary relic does not read as neon purple.
11. As a **delver browsing relics**, I want the rarity name written next to its colour, so that I
    can tell rarities apart regardless of how I see colour.
12. As a **colourblind delver**, I want no information carried by hue alone, so that the whole
    interface remains usable.
13. As a **delver on a subscription page**, I want the payment form to match the rest of the site,
    so that the paid surface does not look like it belongs to another product.
14. As a **delver about to pay**, I want the price and the verb stated plainly, so that lore never
    obscures what I am agreeing to.
15. As a **delver who cannot log in**, I want the error to say what went wrong in plain words, so
    that atmosphere does not cost me the ability to recover.
16. As a **delver**, I want to be called a delver everywhere, so that the site does not call me an
    operator on one page and a delver on the next.
17. As a **delver with reduced-motion enabled**, I want animations suppressed, so that the reskin
    does not make the site painful to use.
18. As a **delver with reduced-transparency or high-contrast enabled**, I want the material layer
    to step aside, so that grain and blur never render text unreadable.
19. As a **keyboard-only delver**, I want a visible focus ring on every control, so that the
    restyle does not strand me.
20. As a **delver on a slow connection**, I want a legible fallback face while fonts load, so that
    a failed blackletter download does not leave the page in a browser default sans.
21. As a **delver on a phone**, I want the material layer and type scale to hold at 640px, so that
    the reskin is not desktop-only.
22. As an **implementer**, I want the palette defined in exactly two files, so that changing a
    colour is one edit rather than a search across a 1.4k-line stylesheet.
23. As an **implementer**, I want the guideline amended before I write CSS, so that I am not
    choosing values that the SSOT will later contradict.
24. As a **reviewer**, I want a lint failure rather than a judgment call when someone types a raw
    hex, so that review attention goes to composition instead of colour-spotting.
25. As a **reviewer**, I want the fence proven to reject, so that a green check means the rule ran
    rather than that the rule was absent.
26. As the **next person to change the theme**, I want the guideline to describe the material
    layer, so that "make it feel medieval" is a specification rather than a taste argument.

## Acceptance Criteria

- [ ] `design-guideline.md` Part II carries the amended typography rule, the blackletter size
      bound, a "Material & depth" section, an accent-vs-structure rule, and lifted base values
- [ ] `game-client/CLAUDE.md`'s palette, typography and visual-rules sections match the amended guideline
- [ ] All `*(new)*` tokens and the five `--rarity-*` variables exist in `globals.css`
- [ ] `theme.ts` and `globals.css` define the same palette, value-for-value
- [ ] Blackletter and body serif load via `next/font/google`, each with a legible fallback chain
- [ ] No blackletter below the size bound from R2; nav, labels, buttons, inputs and body use the serif
- [ ] Amber appears only on the surfaces R15 permits, on every page
- [ ] The rarity map matches the guideline's table, includes `Uncommon`, and reads from tokens
- [ ] Every rarity badge shows its text label
- [ ] `body` colour is vellum; no `#fff` text remains
- [ ] Each hex listed in R20 is gone
- [ ] The Stripe Elements appearance object derives from tokens
- [ ] `ParticleText` is removed, or reworked to embers/ash in palette colours
- [ ] Both `styled-jsx` blocks are reskinned
- [ ] Grain, surface gradients, beveled edges, vignette and CSS ornament are present
- [ ] Every view stays legible and correctly laid out with the material layer suppressed
- [ ] Contrast is measured against the lifted bases for body, muted, and on-amber text
- [ ] `prefers-reduced-motion`, `prefers-reduced-transparency` and `forced-colors` are handled
- [ ] Focus-visible ring present on every interactive element
- [ ] No `operator`, `Sector`, or `Transmitting` in user-facing strings
- [ ] Version footer reads `v0.1 // The Barrow-Deep`
- [ ] `package.json` no longer names `void-raiders`
- [ ] A lint check rejects raw hex outside the two definition sites, in TS/TSX and CSS
- [ ] That check is proven with the `lint-fence.sh` pattern to reject a fixture and accept the tree
- [ ] The fence passes with no allowlist
- [ ] Every page renders correctly at 640px and below
- [ ] `npm run build`, `npm run lint` and `npm test` pass

## Edge States

- **Font fails to load.** Blackletter is the most likely failure (single-purpose display face). The
  fallback chain must land on a legible serif, never the browser default sans. Verify with the
  font blocked, not only with a warm cache.
- **Very long delver name in a blackletter surface.** Blackletter is wide and low-legibility;
  a long name in the logo or hero must wrap or truncate rather than overflow or shrink below R2's
  bound.
- **Material layer under `forced-colors`.** The OS replaces colours wholesale. Grain, vignette and
  `backdrop-filter` must not leave text on an unreadable ground.
- **Material layer with transparency reduced.** `backdrop-filter: blur(20px)` on header,
  dropdowns, modals and cards is a stack of translucent surfaces; with transparency reduced they
  must resolve to opaque surfaces that still read as distinct layers.
- **Grain on a high-DPI or very large viewport.** A full-page SVG-noise overlay composited with
  multiple blurred surfaces is an unmeasured cost. If it degrades scroll performance, scope the
  grain to surfaces rather than the page, and say so.
- **Contrast after the lift, at the muted end.** `--color-text-muted` (`#6f6647`) is already the
  dimmest token; against a *lifted* base it may fall below the floor. It may need to move — which
  is a token change, not a per-call-site override.
- **Rarity `Legendary` against the one-torch rule.** Legendary is amber-bright. A grid of
  legendary relics reintroduces amber across the view, which R15 otherwise forbids. The rarity
  ramp is an explicit, documented exception to the one-torch rule; the guideline amendment must
  say so rather than leaving the two rules in silent conflict.
- **Empty states.** Leaderboard with no entries, profile with no avatar, notification bell with
  nothing unread — each must look composed rather than like a broken surface.
- **Unauthenticated view of a gated page.** `AuthGuard` is a hydration gate; the pre-hydration
  frame must not flash the old theme or an unstyled page.
- **Stripe Elements refuses a value.** Its appearance API accepts a constrained set; a token that
  Stripe rejects must fall back to a legible default rather than silently reverting the whole form
  to Stripe's stock theme.
- **A raw hex is genuinely required.** If a third-party API needs a literal the fence forbids, the
  value is defined as a token and referenced — not exempted. If that proves impossible, it is an
  ADR-0013 amendment, not a local override.

## Risks and fallbacks

- **Blackletter legibility is the one decision here with user-facing rather than aesthetic risk.**
  The size bound in R2 is a reasoned guess, unvalidated against real rendering. If it does not
  hold in practice, the recorded fallback is a warmer medieval serif — Grenze, MedievalSharp or
  IM Fell — in the display slot, keeping every other requirement unchanged. Because R14 keeps
  `--font-heading` as the contract, this swap is a change to two files.
- **The base-surface lift is the most visible change in the pass** and the most likely to feel
  wrong on first sight to anyone acclimatised to the near-black. It is deliberate, and it is the
  primary fix for the neon read; judge it against R31's measurements rather than first impression.
- **The fence enforces vocabulary, not composition** (ADR-0013). A tree that passes can still be
  entirely amber. R15 remains a human review judgment, and it is the requirement most likely to
  regress silently.

## Out of Scope

- **The Phaser game canvas** — [FS-0005](0005-game-canvas-fantasy-reskin.md).
- **All image assets** — pixel tiles, sprites, 9-slice frames, textures, logos, illustration.
  Parked as a later FS. Guideline Part I rules that presuppose assets are not discharged here.
- **Layout and structural change** — grids, page composition, navigation structure, responsive
  breakpoints, information architecture. Restyle in place.
- **Component restructuring, React refactors, routing, new views** — including the marketplace the
  guideline anticipates.
- **Endpoint changes.** This feature adds and changes no HTTP or WS surface, which is why this
  spec carries no API surface section.
- **The `item_rarities.color_hex` alignment in `items-service`.** The guideline proposes making
  the rarity ramp canonical server-side; that is a backend change and belongs to its own FS. This
  work order reconciles the client only.
- **Deleting dead code** — `GameScene`, `GameOverScene`, `src/game/`, `gameSession.ts`.
- **Anything under `game-server/`.**
