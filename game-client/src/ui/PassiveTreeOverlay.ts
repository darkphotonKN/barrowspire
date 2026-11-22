/**
 * The passive tree overlay (FS-8RZ51 §G R34–R37, R41, R42): a canvas window in the gear overlay's
 * family, on the UI scene (ADR-0084; ADR-0086 rules 1.1, 1.2), drawn from `passiveTreeModel` into
 * `passiveTreeLayout`'s rects. The shared panel frame and title (`drawPanelFrame`, `drawPanelTitle`), the
 * header with the class and the unspent points, the six tiers with their gates, each node a plate with
 * its picture and `r / max`, inked by its state, the "or" between the tier-6 nodes; outside the town the
 * footer says points are spent in town (R38). It stands in the window band between the gear overlay
 * (1100–1103) and the party panel (1110), with its own interactive ground over its rect (`uiGround`), so
 * a press or a hover on it never reaches the world or a party frame under it; its tooltips stand in the
 * item tips' band (2200), on the gear overlay's tip ground and placement (`tipGround`, `itemTipRow`).
 *
 * Node pictures (R40): each node draws its picture (`nodePicture`: the tree's own from `passiveIcons.ts`,
 * the tier-3 node its tree ability's from the ability bar's `ABILITY_ICONS`) through the one knockout
 * renderer (`Knockout`, ADR-0080), in `BRONZE` or, greyed, in `GREYED`, its lines where the scene
 * cannot; a node the copy lacks draws the fallback glyph (`drawUnknownGlyph`) with its id as its name
 * (R42). Every colour is a palette token (ADR-0013,
 * ADR-0025).
 *
 * In town a press on a node spends through `TreeSpend` and the wiring's `spend`, the tree's own commands
 * (R38): the tier-6 ask and a refusal's reason stand in the footer band, the ask with its Yes and No.
 * Outside it nodes take no press. Its pointer is handed in by the UI scene in logical units
 * (`uiSceneTree.ts`), hit-tested by hand.
 */

import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { drawIconLines, type AbilityIcon } from "./abilityIcons";
import { itemTipRow } from "./gearOverlayLayout";
import { tipGround } from "./itemTip";
import { BRONZE, GREYED, GREYED_ALPHA, Knockout } from "./knockout";
import { nodeIcon, type NodeIconKey } from "./passiveIcons";
import { GLYPH_LINE_W } from "./MailboxEnvelope";
import { drawPanelFrame, drawPanelTitle, lightClose, type FrameRect } from "./panelFrame";
import { TREE_RANK_GAP, nodeAt, treeLayout, type TreeLayout } from "./passiveTreeLayout";
import { SPENT_IN_TOWN, TreeSpend, treeView, type NodeView, type TipLine, type TreeSource, type TreeView } from "./passiveTreeModel";
import type { World } from "./uiBridge";
import { uiGround } from "./uiGround";
import type { TreePiece, TreeWiring } from "./uiSceneTree";

/**
 * The overlay's depths (ADR-0086 Decision 4): its ground and frame over the gear overlay's 1100–1103,
 * its contents and hover ring over them, all under the party panel (1110).
 */
export const TREE_DEPTH = 1104;
const CONTENT_DEPTH = TREE_DEPTH + 1;
const HOVER_DEPTH = TREE_DEPTH + 2;
/** The item tips' band (ADR-0086 Decision 4). */
const TIP_DEPTH = 2200;

/** The window's one title (FS-3EBCA R20). */
export const TREE_TITLE = "Passive Tree";
/** What a class the client does not know shows in place of its tiers (R42). */
export const NO_TREE = "No tree is known for this class.";

const TIP_PAD = 8;
const TIP_LINE_GAP = 2;
const TIP_WRAP = 240;

/** A plate's edge, by the node's state and whether its next rank could be taken now (R35). */
function plateEdge(node: NodeView): { color: number; alpha: number; width: number } {
  if (node.state === "max") return { color: palette.frameBright, alpha: 1, width: 2 };
  if (node.state === "held") return { color: palette.frame, alpha: 1, width: 1.5 };
  if (node.state === "available" && node.spendable) return { color: palette.interactable, alpha: 1, width: 1.5 };
  if (node.state === "available") return { color: palette.hudLabel, alpha: 0.8, width: 1 };
  return { color: palette.hudFaint, alpha: GREYED_ALPHA, width: 1 };
}

/** Whether a node draws greyed: locked, closed, or open with no point to take it (§Edge States). */
const greyed = (node: NodeView) => node.state === "locked" || node.state === "closed" || (node.state === "available" && !node.spendable);

/** A tip line's colour (R37): the held ranks marked in brass, a refusal's reason muted. */
function tipColour(line: TipLine): number {
  if (line.tone === "name") return palette.frameBright;
  if (line.tone === "kind" || line.tone === "reason") return palette.hudLabel;
  if (line.tone === "effect" || line.tone === "kicker" || line.tone === "grant") return line.held ? palette.frameBright : palette.hudText;
  return palette.hudText;
}

/**
 * The picture a node draws (R40), where it has one: the tree's own (`passiveIcons.ts`), or the tier-3
 * node's tree ability's from the ability bar. Slice 11 gives the archer's and the mercenary's own six.
 */
export function nodePicture(icon: NodeIconKey | undefined): AbilityIcon | undefined {
  return icon ? nodeIcon(icon) : undefined;
}

/** What a line glyph draws with: lines only, never a fill (FS-J1672 R3). */
type Pen = Pick<Phaser.GameObjects.Graphics, "lineStyle" | "beginPath" | "moveTo" | "lineTo" | "strokePath" | "strokeRect">;

/** A node the copy lacks, in lines (R42): a square crossed, nothing filled, never a crash. */
export function drawUnknownGlyph(g: Pen, cx: number, cy: number, ink: number, alpha: number): void {
  g.lineStyle(GLYPH_LINE_W, ink, alpha);
  g.strokeRect(cx - 8, cy - 8, 16, 16);
  g.beginPath();
  g.moveTo(cx - 8, cy - 8);
  g.lineTo(cx + 8, cy + 8);
  g.strokePath();
}

/** What the overlay is built with in one world. */
export type PassiveTreeDeps = TreeWiring;

export class PassiveTreeOverlay implements TreePiece {
  private shown = false;
  private source: TreeSource | undefined;
  /** What was drawn, as a key: a tick that changes nothing draws nothing again (R41). */
  private drawnKey = "";
  private pointer = { x: -1, y: -1 };
  private layout?: TreeLayout;
  private view?: TreeView;
  private parts: Phaser.GameObjects.GameObject[] = [];
  private knockouts: Knockout[] = [];
  private ground?: { destroy(): void };
  private closeMark?: { box: FrameRect; glyph: Phaser.GameObjects.Text; lit: boolean };
  private hoverRing?: Phaser.GameObjects.Graphics;
  /** The node under the pointer, as [row, node], and its tip. */
  private hovered?: [number, number];
  private tip?: { container: Phaser.GameObjects.Container; width: number; height: number };
  /** Its spends: the ones in flight, the tier-6 ask, a refusal's reason (R38). */
  private readonly spend: TreeSpend;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly deps: PassiveTreeDeps,
  ) {
    this.spend = new TreeSpend(deps.spend);
  }

  isOpen(): boolean {
    return this.shown;
  }

  open(): void {
    if (this.shown) return;
    this.shown = true;
    this.build();
  }

  close(): void {
    this.spend.clear();
    if (!this.shown) return;
    this.shown = false;
    this.teardown();
  }

  show(source: TreeSource | undefined): void {
    this.source = source;
    this.redraw();
  }

  /** A refusal heard (R38): its reason in the footer band, in town, where spends are sent from. */
  refused(reason: string): void {
    if (this.world !== "hub") return;
    this.spend.refused(reason);
    if (this.shown) this.redraw();
    else this.spend.clear();
  }

  pointerMove(x: number, y: number): void {
    this.pointer = { x, y };
    this.updateHover();
  }

  /**
   * A press: the × closes it; in town the tier-6 ask's Yes or No answers it, a node's plate spends on it
   * (R38), and anywhere else on the panel clears the ask and a refusal. Every press on the panel is the
   * overlay's.
   */
  pointerDown(x: number, y: number): boolean {
    const layout = this.layout;
    const view = this.view;
    if (!this.shown || !layout || !view) return false;
    if (this.closeMark && inside(this.closeMark.box, x, y)) {
      this.deps.dismiss();
      return true;
    }
    if (!inside(layout.panel, x, y)) return false;
    if (this.world !== "hub") return true;
    const at = nodeAt(layout, x, y);
    if (this.spend.asking() && inside(layout.answers.yes, x, y)) this.spend.answer(true);
    else if (this.spend.asking() && inside(layout.answers.no, x, y)) this.spend.answer(false);
    else if (at) this.spend.press(view.tiers[at[0]].nodes[at[1]], view);
    else this.spend.clear();
    this.redraw();
    return true;
  }

  relayout(): void {
    if (this.shown) this.rebuild();
  }

  owns(object: unknown): boolean {
    return !!this.ground && object === this.ground;
  }

  destroy(): void {
    this.shown = false;
    this.teardown();
  }

  /** The world it stands in: outside the town the footer says points are spent in town (R38). */
  private get world(): World {
    return this.deps.world;
  }

  private rebuild(): void {
    this.teardown();
    this.build();
  }

  /** Draws again while open, if what it draws from changed: the state, the ask, the refusal (R38, R41). */
  private redraw(): void {
    if (this.shown && this.key() !== this.drawnKey) this.rebuild();
  }

  private key(): string {
    return JSON.stringify([keyOf(this.source), this.spend.asking() ?? "", this.spend.line() ?? ""]);
  }

  private build(): void {
    const view = treeView(this.source ?? { class: "" });
    this.view = view;
    // a node now showing the rank its spend went for takes clicks again
    this.spend.seen(view);
    this.drawnKey = this.key();
    const layout = treeLayout(viewport, view.tiers.map((t) => t.nodes.length));
    this.layout = layout;
    const { panel } = layout;
    this.ground = uiGround(this.scene, TREE_DEPTH)(panel);
    const frame = this.scene.add.graphics();
    const { close, glyph } = drawPanelFrame(this.scene, frame, panel);
    this.closeMark = { box: close, glyph, lit: false };
    const chrome = this.scene.add.container(0, 0, [frame, drawPanelTitle(this.scene, panel, TREE_TITLE), glyph]);
    chrome.setDepth(TREE_DEPTH).setScrollFactor(0);
    const content = this.scene.add.container(0, 0, this.contentParts(view, layout));
    content.setDepth(CONTENT_DEPTH).setScrollFactor(0);
    this.hoverRing = this.scene.add.graphics().setDepth(HOVER_DEPTH).setScrollFactor(0);
    this.parts = [chrome, content, this.hoverRing];
    this.hovered = undefined;
    this.updateHover();
  }

  private contentParts(view: TreeView, layout: TreeLayout): Phaser.GameObjects.GameObject[] {
    const parts: Phaser.GameObjects.GameObject[] = [];
    const text = (x: number, y: number, words: string, px: number, color: number, origin: [number, number] = [0.5, 0.5]) => {
      const t = this.scene.add
        .text(x, y, words, { fontFamily: CANVAS_FONT.body, fontSize: `${px}px`, color: toCss(color) })
        .setOrigin(...origin);
      parts.push(t);
      return t;
    };
    text(layout.header.x, layout.header.y, view.header, 13, palette.hudText);
    if (!view.known) text(layout.panel.x + layout.panel.width / 2, layout.footer.y - 40, NO_TREE, 12, palette.hudLabel);
    const g = this.scene.add.graphics();
    parts.push(g);
    view.tiers.forEach((tier, r) => {
      const row = layout.rows[r];
      text(row.gate.x, row.gate.y - 2, `TIER ${tier.tier}`, 10, palette.hudLabel, [0, 1]);
      text(row.gate.x, row.gate.y + 2, tier.gate, 11, palette.hudText, [0, 0]).setWordWrapWidth(row.nodes[0].x - row.gate.x - 12);
      if (row.between) text(row.between.x, row.between.y, "or", 11, palette.hudLabel);
      tier.nodes.forEach((node, n) => {
        const plate = row.nodes[n];
        this.drawPlate(g, node, plate);
        const rankInk = node.rank > 0 ? palette.frameBright : greyed(node) ? palette.hudFaint : palette.hudLabel;
        text(plate.x + plate.width / 2, plate.y + plate.height + TREE_RANK_GAP, `${node.rank} / ${node.maxRank}`, 10, rankInk, [0.5, 0]);
      });
    });
    if (this.world !== "hub") text(layout.footer.x, layout.footer.y, SPENT_IN_TOWN, 11, palette.hudLabel);
    else this.spendFooter(g, layout, text);
    return parts;
  }

  /** In town, the footer band: the tier-6 ask with its Yes and No, or a refusal's reason (R38). */
  private spendFooter(
    g: Phaser.GameObjects.Graphics,
    layout: TreeLayout,
    text: (x: number, y: number, words: string, px: number, color: number, origin?: [number, number]) => Phaser.GameObjects.Text,
  ): void {
    const asking = this.spend.asking();
    const line = this.spend.line();
    if (asking) {
      const { words, yes, no } = layout.answers;
      text(words.x, words.y, asking, 11, palette.hudText, [0, 0.5]).setWordWrapWidth(words.width);
      for (const [box, word] of [
        [yes, "Yes"],
        [no, "No"],
      ] as const) {
        g.fillStyle(palette.hudPanelDeep, 0.9);
        g.fillRoundedRect(box.x, box.y, box.width, box.height, 3);
        g.lineStyle(1, palette.interactable, 1);
        g.strokeRoundedRect(box.x, box.y, box.width, box.height, 3);
        text(box.x + box.width / 2, box.y + box.height / 2, word, 11, palette.interactableBright);
      }
    } else if (line) {
      text(layout.footer.x, layout.footer.y, line, 11, palette.hudLabel).setWordWrapWidth(layout.panel.width - 32);
    }
  }

  /** A node's plate, its edge by its state, and its picture, or the fallback glyph for a node the copy lacks (R35, R40, R42). */
  private drawPlate(g: Phaser.GameObjects.Graphics, node: NodeView, plate: FrameRect): void {
    g.fillStyle(palette.hudPanelDeep, 0.9);
    g.fillRoundedRect(plate.x, plate.y, plate.width, plate.height, 4);
    const edge = plateEdge(node);
    g.lineStyle(edge.width, edge.color, edge.alpha);
    g.strokeRoundedRect(plate.x, plate.y, plate.width, plate.height, 4);
    const cx = plate.x + plate.width / 2;
    const cy = plate.y + plate.height / 2;
    const dim = greyed(node);
    const picture = nodePicture(node.icon);
    if (picture) {
      // its lines where the knockout cannot stand, now or at a new render scale (ADR-0080 "Fallback")
      const lines = () => drawIconLines(g, picture, cx, cy, dim ? palette.hudFaint : palette.interactable, dim ? GREYED_ALPHA : 0.85);
      const knockout = new Knockout({
        scene: this.scene,
        depth: CONTENT_DEPTH,
        picture: picture.picture,
        ink: dim ? GREYED : BRONZE,
        name: `the ${node.id} node`,
        lost: lines,
      });
      this.knockouts.push(knockout);
      if (!knockout.show(plate, false)) lines();
      return;
    }
    drawUnknownGlyph(g, cx, cy, dim ? palette.hudFaint : palette.frame, dim ? GREYED_ALPHA : 0.9);
  }

  /** The × lit under the pointer; the node under it ringed and its tooltip beside it (R37). */
  private updateHover(): void {
    const layout = this.layout;
    const view = this.view;
    if (!this.shown || !layout || !view) return;
    const mark = this.closeMark;
    if (mark) {
      const lit = inside(mark.box, this.pointer.x, this.pointer.y);
      if (lit !== mark.lit) lightClose(mark.glyph, (mark.lit = lit));
    }
    const at = nodeAt(layout, this.pointer.x, this.pointer.y);
    if (at?.[0] !== this.hovered?.[0] || at?.[1] !== this.hovered?.[1]) {
      this.hovered = at;
      this.hideTip();
      this.hoverRing?.clear();
      if (at) {
        const plate = layout.rows[at[0]].nodes[at[1]];
        this.hoverRing?.lineStyle(1, palette.interactableBright, 1).strokeRoundedRect(plate.x - 2, plate.y - 2, plate.width + 4, plate.height + 4, 5);
        this.tip = this.buildTip(view.tiers[at[0]].nodes[at[1]].tip);
      }
    }
    if (this.tip) {
      const [place] = itemTipRow([this.tip], this.pointer, viewport);
      this.tip.container.setPosition(place.x, place.y);
    }
  }

  /** A node's tooltip on the item tip's ground (R37): one line per tip line, the held ranks marked. */
  private buildTip(lines: readonly TipLine[]) {
    let y = TIP_PAD;
    const texts = lines.map((line) => {
      const marked = line.held !== undefined && (line.tone === "effect" || line.tone === "kicker") ? `${line.held ? "• " : "  "}${line.text}` : line.text;
      const t = this.scene.add.text(TIP_PAD, y, marked, {
        fontFamily: CANVAS_FONT.body,
        fontSize: `${line.tone === "name" ? 13 : 11}px`,
        color: toCss(tipColour(line)),
        fontStyle: line.tone === "reason" ? "italic" : undefined,
        wordWrap: { width: TIP_WRAP },
      });
      y += t.height + TIP_LINE_GAP;
      return t;
    });
    const width = Math.round(Math.max(0, ...texts.map((t) => t.width)) + TIP_PAD * 2);
    const height = Math.round(y - TIP_LINE_GAP + TIP_PAD);
    const container = this.scene.add.container(0, 0, [tipGround(this.scene, width, height), ...texts]);
    container.setDepth(TIP_DEPTH).setScrollFactor(0);
    return { container, width, height };
  }

  private hideTip(): void {
    this.tip?.container.destroy();
    this.tip = undefined;
  }

  private teardown(): void {
    this.hideTip();
    for (const k of this.knockouts) k.destroy();
    this.knockouts = [];
    for (const p of this.parts) p.destroy();
    this.parts = [];
    this.ground?.destroy();
    this.ground = undefined;
    this.closeMark = undefined;
    this.hoverRing = undefined;
    this.layout = undefined;
    this.view = undefined;
    this.hovered = undefined;
    this.drawnKey = "";
  }
}

function inside(r: FrameRect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

/** What the tree draws from, as a key (R41). */
function keyOf(source: TreeSource | undefined): string {
  if (!source) return "none";
  const ranks = Object.entries(source.passive_ranks ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([source.class, source.level ?? 1, source.passive_points ?? 0, ranks]);
}

/** The tree for its world on `scene` (the UI scene), as `uiSceneTree.ts` keeps it. */
export function mountPassiveTree(scene: Phaser.Scene, wiring: TreeWiring): TreePiece {
  return new PassiveTreeOverlay(scene, wiring);
}

