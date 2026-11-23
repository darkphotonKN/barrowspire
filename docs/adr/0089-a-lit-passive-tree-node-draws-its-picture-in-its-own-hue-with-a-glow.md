# ADR-0089 — A lit passive-tree node draws its picture in its own hue, glowing; every other HUD icon stays bronze

Status: accepted
Date: 2026-11-23
Scope: `game-client` only: the inks of the passive tree overlay's node pictures
(`src/ui/PassiveTreeOverlay.ts`, `src/ui/knockout.ts`), the tree's hue tokens (`src/utils/theme.ts`,
`src/utils/canvasPalette.ts`) and the design guideline's HUD icons rule. Not the icons' shapes, the
plates, the links, the lock mark, the corner row's Tree icon, the ability bar's icons, or any other
canvas HUD icon.
Specified by: [FS-8RZ51](../specs/8RZ51-passive-skill-tree.md) § Change: A lit node glows in its own
colour.
Amends: [ADR-0080](0080-canvas-hud-icons-are-embossed-bronze-knockouts-from-one-shared-renderer.md)
Decision, the **Colour** clause ("bronze ... Tokens only") and the **Hover** clause, for the passive
tree's node pictures only. ADR-0080's shape, rendering, emboss, Unavailable and Fallback clauses, and
its one-renderer rule, stand unchanged.
Builds on: [ADR-0013](0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md)
(tokens only, a new colour is a token first), [ADR-0025](0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md)
(the canvas is on the game palette), [ADR-0086](0086-which-interface-goes-in-the-ui-scene-and-which-stays-in-the-world.md)
(the tree is a UI-scene piece).

## Context

The owner, 2026-11-23, on the tree overlay: 「介面ui的tree天賦點亮後 內容icon要跟著變亮 顏色可以根據內容是什麼加一些色彩 例如
法師第一個是Hardened Frame 是愛心 點亮後 愛心會是紅色的 顏色配色可以模仿徽章的古銅質感有漸層 你再看看其他徽章適合搭配什麼顏色」
(once a talent is lit its picture should brighten too, coloured by what it is: the heart turns red;
the colours should copy the badges' bronze with its gradient). On the charter: 「ok 重點是激活後裡面要是有active發亮的」
(the point is that once active, the inside glows). ("Hardened Frame" was tree v1's name; in tree v2
the heart is Vitality.)

What the tree draws today (FS-8RZ51 § Change: Tree v2, V29): every picture that is not greyed is the
same near-white vellum (`TREE_INK`, `palette.hudText`, flat), whether the node is held or only
open to take. A held node differs from an open one only by its plate's edge and fill. The owner reads
that as "not lit": a talent the character holds should look switched on, and its colour should say
what kind of talent it is.

ADR-0080 says every canvas HUD icon is bronze. V29 already left that rule for the tree (vellum),
without an ADR. This decision records the tree's inks as a whole, so the exception is written down
once, not twice.

Forces:

- **Colour is a readability channel** on the canvas (design guideline "Gameplay accent"). Amber means
  interactable; arcane green means safe and allies; health is red. A tree hue must not borrow any of
  those meanings it does not have.
- **No neon** (guideline palette rules). The hues are mixed with bronze and carried by the same
  top-lit gradient, so they read as tinted bronze badges, not plastic.
- **The overlay draws once per change** (R41). A glow that animates, or that costs a filter pass on
  every frame the overlay stands, is not wanted for v1. Phaser 4's Glow filter
  (`FilterList#addGlow`) is a framebuffer pass each time its object renders, so it is rejected.
- **The fallback.** Where a scene cannot make the knockout's texture, the picture is drawn in lines
  (ADR-0080 "Fallback"). The glow must still show there.

Recorded without adversarial review: the decisions are charter defaults the owner approved, and no
`challenge-me` pass was run.

## Decision

**1. Canvas HUD icons stay embossed bronze knockouts from the one shared renderer** (ADR-0080). The
one exception is the passive tree's node pictures, and only while a node is lit.

**2. A tree node's picture takes one of three inks, by its state:**

- **Greyed** (closed, locked, or open with no point to take it): `GREYED`, as today.
- **Open to take, rank 0** (available and spendable): the HUD's plain bronze (`BRONZE`'s tint and
  gradient), a step dimmer than a lit picture. This replaces V29's near-white ink.
- **Lit** (held or max, rank > 0): its own hue. Every rank above 0 wears the same hue.

**3. A hue is a palette token mixed with bronze.** The ink's tint is the hue mixed about 35% toward
the HUD bronze, laid through the renderer's existing top-lit gradient, at full alpha. Its highlight
is brighter than bronze's: the top is lifted further, toward the hue's own light end rather than
toward amber, so the hue stays itself. Tokens only (ADR-0013): a hue reuses a token whose meaning
matches it, and anything new is a token in `BARROW` / `BARROW_HEX` first. A tree hue is never amber
and never arcane green.

**4. A lit picture glows.** A soft halo in its hue stands behind the picture, inside its plate, over
the plate's fill:

- static, drawn once with the plate, never animated, never redrawn per frame, no Phaser filter;
- drawn beside the renderer, on the overlay's plate graphics, so it shows whether the picture is a
  knockout or its line fallback;
- inside the plate, so it never reads as the plate's edge, which carries the node's state.

**5. The renderer gains only optional ink fields.** `KnockoutInk` may carry how far and toward what
its top is lifted. No new pipeline, no change to the shadow, the supersampling, the cuts or the
rebuild. Every other icon, and every ink it does not set, draws as before.

**6. Hover is unchanged in the tree.** The tree marks hover with its ring (V29) and does not redraw a
picture under the pointer.

## Consequences

- **The tree's pictures say what they are once held.** A held Vitality is red, a held Searing ember,
  and an open node is plain bronze, so a glance tells held from open without reading the plates.
- **V29's near-white ink is retired.** `TREE_INK` goes. An open node's bronze is less contrast on its
  amber-lit plate than vellum was (about 2.9:1 against 4.7:1), which is the price of "lit means
  coloured". The review page shows it, and the step can be tuned there.
- **Ten hues, and some are close.** After the bronze mix, the warm hues (health, power, fire) and the
  cool ones (defence, mana, speed, movement) sit about 9–11 ΔE00 apart in the tightest pairs within
  one class. The pictures differ in shape too, but each hue is checked at render scale 1 on the review
  page before it ships, and the owner may retune any single hue there.
- **Two of the hues touch guideline rules** and get a narrow note in the guideline: speed's pale
  frost is not the forbidden neon cyan, and crit's violet is not umbra, which stays the shadow's. Both
  are tree-picture hues only.
- **Cost.** One halo per lit node on graphics the overlay already draws, and no new texture. Nothing
  runs per frame.
- **Other badges are untouched.** The corner row, the ability bar (which shares the tree ability
  nodes' pictures but not their inks), the Mailbox and every future HUD icon stay bronze under
  ADR-0080. A second HUD icon wanting its own hue needs its own ADR.
- **Follow-up:** `game-client/docs/design-guideline.md`'s HUD icons rule names this exception and
  lists the tree's hue tokens.
