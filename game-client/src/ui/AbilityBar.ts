/**
 * The ability bar on the UI scene (FS-Q18Q3 §B, §C, §E, §L R41): three squares above the XP bar, [1 potion]
 * [right-click] [3 tree ability], drawn from the plain view the world hands through the bridge
 * (`abilityBar`, `runOwnHud`). It decides nothing: the world judged every flag.
 *
 * Each square is a well of the HUD panel in a brass rim with a carved inner line, its key plaque set into
 * its top edge ("1", the right-mouse glyph, "3", read from `RUN_ACTIONS`), its bronze knockout icon from the
 * shared renderer (`Knockout`, ADR-0080; `abilityIcons.ts`) and, under it, its cost as a bare stroked
 * numeral in the resource bar's own colour. Greyed, the icon takes the renderer's unavailable ink and the
 * key and the cost fall to the faint vellum; active, the rim is lit 2 px bright brass and the icon takes the
 * hover ink. The potion square carries its count in its bottom-right corner; the 3 square stands locked, a
 * padlock and a faint "Lv 10" (R25). Where a scene cannot make the knockout's texture, the icon's line glyph.
 *
 * Each square lays its own ground on the UI scene, so a press there is the bar's and never the world's, and
 * a move over it reaches the world only as a move on the UI (R33); the pointer over a lit square lifts its
 * bronze. At the corner row's depth (ADR-0086 Decision 4), under every window, the menu and the notices.
 */

import type Phaser from "phaser";
import { crispen, viewport } from "@/render/viewport";
import { RUN_ACTIONS } from "@/scenes/runActions";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import type { AbilityBarView } from "./abilityBarView";
import { ABILITY_BAR_SQUARES, abilityBarFrame, type AbilityBarFrame, type AbilityBarSquare, type AbilitySquareFrame } from "./abilityBarLayout";
import { ABILITY_ICONS, drawAbilityIconLines, type AbilityIconKey } from "./abilityIcons";
import { BRONZE, GREYED, GREYED_ALPHA, Knockout } from "./knockout";
import type { HudChannel } from "./resources";
import type { AbilityBarPiece } from "./uiSceneHud";
import type { XpBarView } from "./xpBarLayout";

/** The corner row's band on the UI scene (R11; ADR-0086 Decision 4). */
const BAR_DEPTH = 1000;
/** The level at which the skill tree's third tier, and its ability, can first be taken (R25; FS-8RZ51). */
export const TREE_ABILITY_LEVEL = 10;
/** What the locked 3 square reads in its cost slot (R25). */
const LOCKED_LINE = `Lv ${TREE_ABILITY_LEVEL}`;
/** The well's fill and rim (R13), the carved line inside it, and the lit rim of the active state (R17). */
const WELL_ALPHA = 0.85;
const RIM_ALPHA = 0.6;
const CARVE_INSET = 3;
const CARVE_ALPHA = 0.5;
const ACTIVE_RIM_W = 2;
/** The right-mouse glyph, drawn small enough to sit in its plaque (R14): the card's mouse, scaled down. */
const MOUSE_W = 8;
const MOUSE_H = 10;
const MOUSE_BUTTON_H = 4;
const MOUSE_RADIUS = 3;
/** Each cost's colour, by its resource bar's channel; an unknown kind's in vellum (R15). */
const COST_INK: Readonly<Record<HudChannel, number>> = {
  health: palette.hudText,
  mana: palette.hudMana,
  stamina: palette.hudStamina,
  parry: palette.hudParry,
  unknown: palette.hudText,
};

/** One square as drawn from the view: what it shows, whatever square it is. */
interface SquareLook {
  icon: AbilityIconKey | null;
  greyed: boolean;
  active: boolean;
  /** The plaque's key, or none for the right-mouse glyph. */
  key: string | null;
  /** Under the square: its cost, "Lv 10", or nothing. */
  under: { words: string; ink: number } | null;
  /** In the bottom-right corner: the potion count, or nothing. */
  corner: string | null;
}

interface DrawnSquare {
  ground: Phaser.GameObjects.Zone;
  key: Phaser.GameObjects.Text;
  under: Phaser.GameObjects.Text;
  corner: Phaser.GameObjects.Text;
  knockout?: Knockout;
  /** The icon and ink the knockout was made for. */
  inked?: string;
  hovered: boolean;
  look?: SquareLook;
}

export class AbilityBar implements AbilityBarPiece {
  private frame: AbilityBarFrame;
  private graphics?: Phaser.GameObjects.Graphics;
  private squares?: Record<AbilityBarSquare, DrawnSquare>;
  /** What the bar last drew, so the states that change nothing redraw nothing. */
  private shown: AbilityBarView | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly view: XpBarView = viewport,
  ) {
    this.frame = abilityBarFrame(view);
  }

  show(view: AbilityBarView | null): void {
    if (JSON.stringify(view) === JSON.stringify(this.shown)) return;
    this.shown = view;
    if (!view) return this.takeDown();
    this.draw();
  }

  /** The bar's top while it stands, for the level-up cue (R12); none while it is down. */
  top(): number | null {
    return this.shown ? this.frame.top : null;
  }

  /** The logical view changed: back over the XP bar by the same rule, its words re-crispened (R10). */
  relayout(): void {
    this.frame = abilityBarFrame(this.view);
    if (!this.squares) return;
    for (const s of ABILITY_BAR_SQUARES) {
      const ground = groundOf(this.frame, this.frame.squares[s]);
      this.squares[s].ground.setPosition(ground.x, ground.y);
    }
    this.draw();
  }

  /** Taken down for good: its world left the UI scene (R41). */
  destroy(): void {
    this.takeDown();
    this.shown = null;
  }

  private draw(): void {
    const view = this.shown;
    if (!view) return;
    const squares = (this.squares ??= this.build());
    const g = this.graphics!.clear();
    for (const s of ABILITY_BAR_SQUARES) {
      const drawn = squares[s];
      drawn.look = lookOf(s, view);
      this.drawSquare(g, this.frame.squares[s], drawn);
    }
    // moved by a re-layout after a render-scale change: rasterised again (FS-ZAJMH R5)
    crispen(ABILITY_BAR_SQUARES.flatMap((s) => [squares[s].key, squares[s].under, squares[s].corner]));
  }

  private drawSquare(g: Phaser.GameObjects.Graphics, f: AbilitySquareFrame, drawn: DrawnSquare): void {
    const look = drawn.look!;
    const { well, plaque } = f;
    g.fillStyle(palette.hudPanel, WELL_ALPHA);
    g.fillRect(well.x, well.y, well.width, well.height);
    g.lineStyle(1, palette.hudPanelDeep, CARVE_ALPHA);
    g.strokeRect(well.x + CARVE_INSET, well.y + CARVE_INSET, well.width - CARVE_INSET * 2, well.height - CARVE_INSET * 2);
    if (look.active) g.lineStyle(ACTIVE_RIM_W, palette.frameBright, 1);
    else g.lineStyle(1, palette.frame, RIM_ALPHA);
    g.strokeRect(well.x, well.y, well.width, well.height);

    // the plaque, set into the top edge over the rim (R14)
    g.fillStyle(palette.hudPanel, 1);
    g.fillRect(plaque.x, plaque.y, plaque.width, plaque.height);
    g.lineStyle(1, palette.frame, RIM_ALPHA);
    g.strokeRect(plaque.x, plaque.y, plaque.width, plaque.height);
    const keyInk = look.greyed ? palette.hudFaint : palette.hudText;
    const [px, py] = [plaque.x + plaque.width / 2, plaque.y + plaque.height / 2];
    if (look.key === null) drawRightMouse(g, px - MOUSE_W / 2, py - MOUSE_H / 2, keyInk);
    drawn.key.setPosition(px, py).setText(look.key ?? "").setColor(toCss(keyInk));

    const { under, corner } = look;
    drawn.under
      .setPosition(f.cost.x + f.cost.width / 2, f.cost.y + f.cost.height / 2)
      .setText(under?.words ?? "")
      .setColor(toCss(under?.ink ?? palette.hudFaint));
    drawn.corner
      .setPosition(f.corner.x, f.corner.y)
      .setText(corner ?? "")
      .setColor(toCss(look.greyed ? palette.hudFaint : palette.hudText));

    this.drawIcon(g, f, drawn);
  }

  /** The icon: its knockout in the ink its state takes (R17), or its line glyph where none can be made. */
  private drawIcon(g: Phaser.GameObjects.Graphics, f: AbilitySquareFrame, drawn: DrawnSquare): void {
    const { icon, greyed, active } = drawn.look!;
    const inked = icon ? `${icon}:${greyed}` : undefined;
    if (inked !== drawn.inked) {
      drawn.knockout?.destroy();
      drawn.knockout = undefined;
      drawn.inked = inked;
      if (icon)
        drawn.knockout = new Knockout({
          scene: this.scene,
          depth: BAR_DEPTH,
          picture: ABILITY_ICONS[icon].picture,
          ink: greyed ? GREYED : BRONZE,
          name: `the ${icon} square`,
          lost: () => this.draw(),
        });
    }
    if (!icon || !drawn.knockout) return;
    // active, the hover ink while the state lasts (R17); greyed, it never brightens (ADR-0080)
    const lifted = drawn.hovered || active;
    if (drawn.knockout.show(f.icon, lifted)) return;
    const [cx, cy] = [f.icon.x + f.icon.width / 2, f.icon.y + f.icon.height / 2];
    if (greyed) drawAbilityIconLines(g, icon, cx, cy, palette.hudFaint, GREYED_ALPHA);
    else drawAbilityIconLines(g, icon, cx, cy, lifted ? palette.interactableBright : palette.interactable, lifted ? 1 : 0.85);
  }

  /** The bar's objects, made once while it is up; only their content changes. */
  private build(): Record<AbilityBarSquare, DrawnSquare> {
    this.graphics = this.scene.add.graphics().setScrollFactor(0).setDepth(BAR_DEPTH);
    const made = ABILITY_BAR_SQUARES.map((s) => {
      const f = this.frame.squares[s];
      const ground = groundOf(this.frame, f);
      const drawn: DrawnSquare = {
        // its ground (R33): an interactive zone that draws nothing, so the UI scene takes the press
        ground: this.scene.add
          .zone(ground.x, ground.y, ground.width, ground.height)
          .setOrigin(0)
          .setScrollFactor(0)
          .setDepth(BAR_DEPTH)
          .setInteractive(),
        key: this.text(0.5, 0.5),
        under: this.text(0.5, 0.5, true),
        corner: this.text(1, 1, true),
        hovered: false,
      };
      drawn.ground.on("pointerover", () => this.hover(f, drawn, true));
      drawn.ground.on("pointerout", () => this.hover(f, drawn, false));
      return [s, drawn] as const;
    });
    return Object.fromEntries(made) as Record<AbilityBarSquare, DrawnSquare>;
  }

  private hover(f: AbilitySquareFrame, drawn: DrawnSquare, on: boolean): void {
    if (drawn.hovered === on) return;
    drawn.hovered = on;
    if (!this.shown || !drawn.look?.icon) return;
    // the knockout alone is re-inked; a line glyph is drawn with every square, so the bar is drawn again
    if (drawn.knockout?.show(f.icon, on || drawn.look.active)) return;
    this.draw();
  }

  /** A 12 px body-serif word: a plaque's key in its panel, or a bare stroked numeral over the world (R14, R15). */
  private text(ox: number, oy: number, stroked = false): Phaser.GameObjects.Text {
    return this.scene.add
      .text(0, 0, "", {
        fontFamily: CANVAS_FONT.body,
        fontSize: "12px",
        color: toCss(palette.hudText),
        ...(stroked ? { stroke: toCss(palette.markerStroke), strokeThickness: 2 } : {}),
      })
      .setOrigin(ox, oy)
      .setScrollFactor(0)
      .setDepth(BAR_DEPTH);
  }

  private takeDown(): void {
    if (this.squares)
      for (const s of ABILITY_BAR_SQUARES) {
        const drawn = this.squares[s];
        drawn.knockout?.destroy();
        drawn.ground.destroy();
        drawn.key.destroy();
        drawn.under.destroy();
        drawn.corner.destroy();
      }
    this.graphics?.destroy();
    this.graphics = undefined;
    this.squares = undefined;
  }
}

/** A square's ground: its column from the plaques' top to its cost slot's foot, so no part of it reaches the world. */
function groundOf(bar: AbilityBarFrame, f: AbilitySquareFrame) {
  return { x: f.well.x, y: bar.top, width: f.well.width, height: f.cost.y + f.cost.height - bar.top };
}

/** What square `s` shows of `view` (§E): its icon, flags, plaque key, the words under it and in its corner. */
function lookOf(s: AbilityBarSquare, view: AbilityBarView): SquareLook {
  const costInk = (greyed: boolean) => (greyed ? palette.hudFaint : COST_INK[view.costChannel ?? "unknown"]);
  switch (s) {
    case "potion": {
      const { count, greyed } = view.potion;
      return { icon: "potion", greyed, active: false, key: RUN_ACTIONS.drinkPotion.label, under: null, corner: String(count) };
    }
    case "ability": {
      const { icon, greyed, active, cost } = view.ability;
      const under = cost === null ? null : { words: String(cost), ink: costInk(greyed) };
      return { icon, greyed, active, key: null, under, corner: null };
    }
    case "tree":
      // locked until the character holds its tree's ability (R25): the padlock, the key and "Lv 10" faint
      return {
        icon: "locked",
        greyed: true,
        active: false,
        key: RUN_ACTIONS.treeAbility.label,
        under: { words: LOCKED_LINE, ink: palette.hudFaint },
        corner: null,
      };
  }
}

type GlyphGraphics = Pick<Phaser.GameObjects.Graphics, "fillStyle" | "fillRoundedRect" | "lineStyle" | "strokeRoundedRect" | "lineBetween">;

/** The right-mouse glyph (R14): a mouse outline split into two buttons, the right one filled, in `ink`. */
function drawRightMouse(g: GlyphGraphics, x: number, y: number, ink: number): void {
  const mid = x + MOUSE_W / 2;
  g.fillStyle(ink, 1);
  g.fillRoundedRect(mid, y, MOUSE_W / 2, MOUSE_BUTTON_H, { tl: 0, tr: MOUSE_RADIUS, bl: 0, br: 0 });
  g.lineStyle(1, ink, 1);
  g.strokeRoundedRect(x, y, MOUSE_W, MOUSE_H, MOUSE_RADIUS);
  g.lineBetween(mid, y, mid, y + MOUSE_BUTTON_H);
  g.lineBetween(x, y + MOUSE_BUTTON_H, x + MOUSE_W, y + MOUSE_BUTTON_H);
}
