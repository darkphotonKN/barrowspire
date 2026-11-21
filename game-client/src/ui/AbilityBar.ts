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
 * padlock and a faint "Lv 10" (R25), until the character holds its tree's ability, then shows that ability's
 * icon and cost as the right-click square does, never active (R26). Where a scene cannot make the knockout's
 * texture, the icon's line glyph.
 *
 * Each square lays its own ground on the UI scene, so a press there is the bar's and never the world's, and
 * a move over it reaches the world only as a move on the UI (R33); the pointer over a lit square lifts its
 * bronze. At the corner row's depth (ADR-0086 Decision 4), under every window, the menu and the notices.
 *
 * The pointer over a square, greyed or not, shows its tooltip (§F R28; `abilityBarTip`), heard by the
 * square's own ground's over and out, drawn in the item-tip band (2200) and taken down on leave and with the
 * bar. A window or the menu over a square stands higher on the UI scene and takes the pointer first, so the
 * ground hears it leave; while a tooltip shows the scene polls the pointer, so one opening over a still
 * pointer takes it too.
 *
 * While a cooldown runs, a dark wedge sweeps the right-click square or the held 3 square (§D R18–R21, §E
 * R26; `abilityCooldown`): stamped on the UI scene's clock as a `bar` message whose cooldown changed is
 * heard (the bridge is synchronous, so that is the state's arrival, R41), run down from there by the scene's
 * own frames, and corrected by the next. It lies on its own layer over the well's ground and under its rim, plaque and icon, and it alone is
 * redrawn each frame, only while a sweep runs; nothing else, the tooltip included, follows the frames.
 */

import type Phaser from "phaser";
import { crispen, viewport } from "@/render/viewport";
import { RUN_ACTIONS } from "@/scenes/runActions";
import type { CooldownState } from "@/types/gameState";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import type { AbilityBarView } from "./abilityBarView";
import { ABILITY_BAR_SQUARES, abilityBarFrame, type AbilityBarFrame, type AbilityBarSquare, type AbilitySquareFrame } from "./abilityBarLayout";
import { ABILITY_TIP_MAX_W, abilityTip, abilityTipPlace } from "./abilityBarTip";
import { cooldownSwept, sweepPolygon } from "./abilityCooldown";
import { TREE_ABILITY_LEVEL } from "./abilityCopy";
import { ABILITY_ICONS, drawAbilityIconLines, type AbilityIconKey } from "./abilityIcons";
import { BRONZE, GREYED, GREYED_ALPHA, Knockout } from "./knockout";
import type { HudChannel } from "./resources";
import type { AbilityBarPiece } from "./uiSceneHud";
import type { Point, XpBarView } from "./xpBarLayout";

/** The corner row's band on the UI scene (R11; ADR-0086 Decision 4). */
const BAR_DEPTH = 1000;
/** The item-tip band, over the windows and the menu (R28; ADR-0086 Decision 4). */
const TIP_DEPTH = 2200;
/** Inside the tooltip's rim, and between its lines. */
const TIP_PAD = 10;
const TIP_LINE_GAP = 4;
/** What the locked 3 square reads in its cost slot (R25). */
const LOCKED_LINE = `Lv ${TREE_ABILITY_LEVEL}`;
/** The well's fill and rim (R13), the carved line inside it, and the lit rim of the active state (R17). */
const WELL_ALPHA = 0.85;
const RIM_ALPHA = 0.6;
const CARVE_INSET = 3;
const CARVE_ALPHA = 0.5;
const ACTIVE_RIM_W = 2;
/** The sweep's wedge over a cooling square (R18). */
const SWEEP_ALPHA = 0.55;
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

/** The tooltip's three lines, each in the card's size and tone (R28). */
const TIP_LINES = [
  { part: "name", size: 16, ink: palette.hudText },
  { part: "line", size: 13, ink: palette.hudLabel },
  { part: "note", size: 13, ink: palette.hudFaint },
] as const;

/** The tooltip standing over a square. */
interface ShownTip {
  ground: Phaser.GameObjects.Graphics;
  lines: Phaser.GameObjects.Text[];
}

/**
 * The squares a cooldown sweeps, each read from the view (R18, R21, R26): the right-click and the held 3
 * square, never the locked one; not the potion, as its drink cooldown is not on the wire.
 */
const SWEPT: Partial<Record<AbilityBarSquare, (view: AbilityBarView) => CooldownState | null>> = {
  ability: (view) => view.cooldowns.ability,
  tree: (view) => (view.tree.locked ? null : view.cooldowns.tree),
};

/** What of a Phaser Graphics the sweep draws with: its wedge's points are plain ones, as Phaser reads them. */
interface SweepGraphics {
  clear(): SweepGraphics;
  fillStyle(color: number, alpha?: number): unknown;
  fillPoints(points: Point[], closeShape?: boolean): unknown;
  destroy(): void;
}

/** A square's cooldown as last heard, and when on the UI scene's clock. */
interface HeardCooldown {
  cooldown: CooldownState;
  at: number;
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
  /** The wells' fill and carved line, under the sweep. */
  private wells?: Phaser.GameObjects.Graphics;
  /** The sweep's wedges, the one layer redrawn each frame while a cooldown runs (R18, R19). */
  private sweep?: SweepGraphics;
  /** Over the sweep: the rims, the plaques and the icons' line glyphs. */
  private face?: Phaser.GameObjects.Graphics;
  /** Each swept square's cooldown as last heard (R41). */
  private heard: Partial<Record<AbilityBarSquare, HeardCooldown>> = {};
  /** Listening to the UI scene's frames, exactly while a sweep runs. */
  private ticking = false;
  private squares?: Record<AbilityBarSquare, DrawnSquare>;
  private tip?: ShownTip;
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
    this.hear(view);
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

  /** Stamps each swept square's cooldown that changed with the time it is heard; one unchanged keeps its stamp (R19, R41). */
  private hear(view: AbilityBarView): void {
    for (const [s, of] of Object.entries(SWEPT) as [AbilityBarSquare, (v: AbilityBarView) => CooldownState | null][]) {
      const cooldown = of(view);
      const was = this.heard[s]?.cooldown;
      if (!cooldown) delete this.heard[s];
      else if (!was || was.remaining !== cooldown.remaining || was.total !== cooldown.total)
        this.heard[s] = { cooldown: { ...cooldown }, at: this.scene.time.now };
    }
  }

  /** The wedges as they stand on the UI scene's clock now; listening to the frames exactly while one runs. */
  private readonly drawSweep = (): void => {
    const g = this.sweep?.clear();
    let running = false;
    if (g)
      for (const [s, heard] of Object.entries(this.heard) as [AbilityBarSquare, HeardCooldown][]) {
        const points = sweepPolygon(this.frame.squares[s].well, cooldownSwept(heard.cooldown, heard.at, this.scene.time.now));
        if (points.length === 0) continue;
        running = true;
        g.fillStyle(palette.ink, SWEEP_ALPHA);
        g.fillPoints(points, true);
      }
    this.tick(running);
  };

  private tick(on: boolean): void {
    if (on === this.ticking) return;
    this.ticking = on;
    if (on) this.scene.events.on("update", this.drawSweep);
    else this.scene.events.off("update", this.drawSweep);
  }

  private draw(): void {
    const view = this.shown;
    if (!view) return;
    const squares = (this.squares ??= this.build());
    const wells = this.wells!.clear();
    const face = this.face!.clear();
    for (const s of ABILITY_BAR_SQUARES) {
      const drawn = squares[s];
      drawn.look = lookOf(s, view);
      this.drawSquare(wells, face, this.frame.squares[s], drawn);
    }
    this.drawSweep();
    // moved by a re-layout after a render-scale change: rasterised again (FS-ZAJMH R5)
    crispen(ABILITY_BAR_SQUARES.flatMap((s) => [squares[s].key, squares[s].under, squares[s].corner]));
    this.drawTip();
  }

  /** A square: its well on `wells`, under the sweep; its rim, plaque and icon over it on `g`, the face. */
  private drawSquare(
    wells: Phaser.GameObjects.Graphics,
    g: Phaser.GameObjects.Graphics,
    f: AbilitySquareFrame,
    drawn: DrawnSquare,
  ): void {
    const look = drawn.look!;
    const { well, plaque } = f;
    wells.fillStyle(palette.hudPanel, WELL_ALPHA);
    wells.fillRect(well.x, well.y, well.width, well.height);
    wells.lineStyle(1, palette.hudPanelDeep, CARVE_ALPHA);
    wells.strokeRect(well.x + CARVE_INSET, well.y + CARVE_INSET, well.width - CARVE_INSET * 2, well.height - CARVE_INSET * 2);
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
    // made in this order, so at one depth the sweep stands over the wells and under the face and the icons
    this.wells = this.scene.add.graphics().setScrollFactor(0).setDepth(BAR_DEPTH);
    this.sweep = this.scene.add.graphics().setScrollFactor(0).setDepth(BAR_DEPTH);
    this.face = this.scene.add.graphics().setScrollFactor(0).setDepth(BAR_DEPTH);
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
    const look = drawn.look;
    // the knockout alone is re-inked; a line glyph is drawn with every square, so the bar is drawn again
    if (this.shown && look?.icon && !drawn.knockout?.show(f.icon, on || look.active)) return this.draw();
    this.drawTip();
  }

  /** The hovered square's tooltip, drawn anew from the view (R28); none where nothing is hovered or it has none. */
  private drawTip(): void {
    this.takeTipDown();
    const s = ABILITY_BAR_SQUARES.find((sq) => this.squares?.[sq].hovered);
    const tip = s && this.shown && abilityTip(s, this.shown);
    if (!s || !tip) return;
    // the ground first, so the words stand over it in the same band
    const ground = this.scene.add.graphics().setScrollFactor(0).setDepth(TIP_DEPTH);
    const lines = TIP_LINES.flatMap(({ part, size, ink }) => {
      const words = tip[part];
      return words ? [this.tipText(words, size, ink)] : [];
    });
    const width = Math.min(ABILITY_TIP_MAX_W, Math.ceil(Math.max(...lines.map((t) => t.width))) + TIP_PAD * 2);
    const textH = lines.reduce((h, t) => h + Math.ceil(t.height), 0) + TIP_LINE_GAP * (lines.length - 1);
    const height = textH + TIP_PAD * 2;
    const at = abilityTipPlace(this.frame, s, { width, height }, this.view);
    ground.fillStyle(palette.hudPanel, WELL_ALPHA);
    ground.fillRect(at.x, at.y, width, height);
    ground.lineStyle(1, palette.frame, RIM_ALPHA);
    ground.strokeRect(at.x, at.y, width, height);
    let y = at.y + TIP_PAD;
    for (const t of lines) {
      t.setPosition(at.x + TIP_PAD, y);
      y += Math.ceil(t.height) + TIP_LINE_GAP;
    }
    crispen(lines);
    this.tip = { ground, lines };
    // heard every frame while it shows: a window or the menu opening over a still pointer takes it (R28)
    this.scene.input.setPollAlways();
  }

  /** A tooltip line in the body serif, wrapping inside the tooltip's widest. */
  private tipText(words: string, size: number, ink: number): Phaser.GameObjects.Text {
    return this.scene.add
      .text(0, 0, words, {
        fontFamily: CANVAS_FONT.body,
        fontSize: `${size}px`,
        color: toCss(ink),
        wordWrap: { width: ABILITY_TIP_MAX_W - TIP_PAD * 2, useAdvancedWrap: true },
      })
      .setScrollFactor(0)
      .setDepth(TIP_DEPTH);
  }

  private takeTipDown(): void {
    if (!this.tip) return;
    this.tip.ground.destroy();
    for (const t of this.tip.lines) t.destroy();
    this.tip = undefined;
    this.scene.input.setPollOnMove();
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
    this.tick(false);
    this.heard = {};
    this.takeTipDown();
    if (this.squares)
      for (const s of ABILITY_BAR_SQUARES) {
        const drawn = this.squares[s];
        drawn.knockout?.destroy();
        drawn.ground.destroy();
        drawn.key.destroy();
        drawn.under.destroy();
        drawn.corner.destroy();
      }
    for (const g of [this.wells, this.sweep, this.face]) g?.destroy();
    this.wells = this.sweep = this.face = undefined;
    this.squares = undefined;
  }
}

/** A square's ground: its column from the plaques' top to its cost slot's foot, so no part of it reaches the world. */
function groundOf(bar: AbilityBarFrame, f: AbilitySquareFrame) {
  return { x: f.well.x, y: bar.top, width: f.well.width, height: f.cost.y + f.cost.height - bar.top };
}

/** What square `s` shows of `view` (§E): its icon, flags, plaque key, the words under it and in its corner. */
function lookOf(s: AbilityBarSquare, view: AbilityBarView): SquareLook {
  // a cost under its square, in its pool's colour, faint when greyed; none to draw for none (R15)
  const costUnder = (cost: number | null, greyed: boolean) =>
    cost === null ? null : { words: String(cost), ink: greyed ? palette.hudFaint : COST_INK[view.costChannel ?? "unknown"] };
  switch (s) {
    case "potion": {
      const { count, greyed } = view.potion;
      return { icon: "potion", greyed, active: false, key: RUN_ACTIONS.drinkPotion.label, under: null, corner: String(count) };
    }
    case "ability": {
      const { icon, greyed, active, cost } = view.ability;
      return { icon, greyed, active, key: null, under: costUnder(cost, greyed), corner: null };
    }
    case "tree": {
      const key = RUN_ACTIONS.treeAbility.label;
      // locked until the character holds its tree's ability (R25): the padlock, the key and "Lv 10" faint
      if (view.tree.locked)
        return { icon: "locked", greyed: true, active: false, key, under: { words: LOCKED_LINE, ink: palette.hudFaint }, corner: null };
      // held (R26): the class's tree ability and its cost, as the right-click's; never active
      const { ability, greyed, cost } = view.tree;
      return { icon: ability, greyed, active: false, key, under: costUnder(cost, greyed), corner: null };
    }
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
