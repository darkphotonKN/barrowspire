/**
 * The passive tree overlay (FS-8RZ51 §G R34, R36, R37, R41, R42; §Change: Tree v2 V23–V25, V27): a
 * canvas window in the gear overlay's family, on the UI scene (ADR-0084; ADR-0086 rules 1.1, 1.2), drawn
 * from `passiveTreeModel` into `passiveTreeLayout`'s rects. The shared panel frame and title
 * (`drawPanelFrame`, `drawPanelTitle`), the header with the class and the unspent points, then the tree
 * as a graph: its links under the plates, lit when both ends are held (V24); each node a plate sized by
 * its kind, round for a traversal node, with its picture and `r / max`, inked by its state, a locked
 * one dimmed under a lock mark (V25); outside the town the footer says points are spent in town (R38). It stands in the window band between the gear overlay
 * (1100–1103) and the party panel (1110), with its own interactive ground over its rect (`uiGround`), so
 * a press or a hover on it never reaches the world or a party frame under it; its tooltips stand in the
 * item tips' band (2200), on the gear overlay's tip ground and placement (`tipGround`, `itemTipRow`).
 *
 * Node pictures (R40, V29): each node draws its picture (`nodePicture`: the tree's own from
 * `passiveIcons.ts`, the ability node its tree ability's from the ability bar's `ABILITY_ICONS`), fitted to
 * its plate (`fitIcon`), through the one knockout renderer (`Knockout`, ADR-0080), inked by its state
 * (§Change: A lit node glows in its own colour, ADR-0089): an open node in the near-white `TREE_INK`, a
 * held or max node in its own hue's lit ink (`treeLitInk`) over a static halo in that hue, greyed in
 * `GREYED`; its lines where the scene cannot, in the same ink. A lit node's whole plate fill is lit
 * in its edge's token. A locked node's lock mark is the padlock (`LOCK_ICON`) on a dark backing, drawn the
 * same way. A node the copy lacks draws the fallback glyph (`drawUnknownGlyph`) with its id as its name
 * (R42). Every colour is a palette token (ADR-0013, ADR-0025).
 *
 * In town a press on a node spends through `TreeSpend` and the wiring's `spend`, the tree's own commands
 * (R38): the ask before a spend that takes a side (V27) and a refusal's reason stand in the footer band, the
 * ask with its Yes and No.
 * Outside it nodes take no press. Its pointer is handed in by the UI scene in logical units
 * (`uiSceneTree.ts`), hit-tested by hand.
 */

import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { CANVAS_FONT, palette, toCss, type TreeHue } from "@/utils/canvasPalette";
import { drawIconLines, type AbilityIcon } from "./abilityIcons";
import { itemTipRow } from "./gearOverlayLayout";
import { tipGround } from "./itemTip";
import { GREYED, GREYED_ALPHA, Knockout, TREE_BRONZE_MIX, TREE_INK, TREE_LIT_LIFT, treeLitInk, type KnockoutInk } from "./knockout";
import { LOCK_ICON, fitIcon, nodeIcon, type NodeIconKey } from "./passiveIcons";
import { GLYPH_LINE_W } from "./MailboxEnvelope";
import { drawPanelFrame, drawPanelTitle, lightClose, type FrameRect } from "./panelFrame";
import { TREE_RANK_GAP, nodeAt, treeLayout, type PlateLayout, type TreeLayout } from "./passiveTreeLayout";
import { SPENT_IN_TOWN, TreeSpend, treeView, type LinkView, type NodeView, type TipLine, type TreeSource, type TreeView } from "./passiveTreeModel";
import type { World } from "./uiBridge";
import { uiGround } from "./uiGround";
import type { TreePiece, TreeWiring } from "./uiSceneTree";

/**
 * The overlay's depths (ADR-0086 Decision 4): its ground and frame over the gear overlay's 1100–1103,
 * its contents over them, the node pictures over the plates' fills (a picture made while the contents are
 * drawn would stand under them at one depth), the lock marks over the pictures, the hover ring over all,
 * all under the party panel (1110).
 */
export const TREE_DEPTH = 1104;
const CONTENT_DEPTH = TREE_DEPTH + 1;
export const PICTURE_DEPTH = TREE_DEPTH + 2;
export const LOCK_DEPTH = TREE_DEPTH + 3;
const HOVER_DEPTH = TREE_DEPTH + 4;
/** The item tips' band (ADR-0086 Decision 4). */
const TIP_DEPTH = 2200;

/** The window's one title (FS-3EBCA R20). */
export const TREE_TITLE = "Passive Tree";
/** What a class the client does not know shows in place of its nodes (R42). */
export const NO_TREE = "No tree is known for this class.";

const TIP_PAD = 8;
const TIP_LINE_GAP = 2;
const TIP_WRAP = 240;

/** A plate's edge, by the node's state and whether its next rank could be taken now (V25). */
function plateEdge(node: NodeView): { color: number; alpha: number; width: number } {
  if (node.state === "max") return { color: palette.frameBright, alpha: 1, width: 2 };
  if (node.state === "held") return { color: palette.frame, alpha: 1, width: 1.5 };
  if (node.state === "available" && node.spendable) return { color: palette.interactable, alpha: 1, width: 1.5 };
  if (node.state === "available") return { color: palette.hudLabel, alpha: 0.8, width: 1 };
  return { color: palette.hudFaint, alpha: GREYED_ALPHA, width: 1 };
}

/**
 * How strongly a lit node's plate fill takes its edge's token over the panel ground (V29): available and
 * spendable, held, or at max. Tuned at the contact sheet.
 */
export const LIT_PLATE_ALPHA = 0.35;

/** A link's line (V24): bright brass when both ends are held, faint otherwise, dimmer still with a locked far end. */
function linkLine(link: LinkView): { color: number; alpha: number; width: number } {
  if (link.lit) return { color: palette.frameBright, alpha: 1, width: 2 };
  if (link.dim) return { color: palette.hudFaint, alpha: GREYED_ALPHA / 2, width: 1 };
  return { color: palette.hudFaint, alpha: GREYED_ALPHA, width: 1 };
}

/** Whether a node draws greyed: closed, locked, or open with no point to take it (V25, §Edge States). */
const greyed = (node: NodeView) => node.state === "locked" || node.state === "closed" || (node.state === "available" && !node.spendable);

/** A node's `r / max` ink: brass once it holds a rank, faint when greyed, muted otherwise (V25). */
export const rankInk = (node: NodeView) => (node.rank > 0 ? palette.frameBright : greyed(node) ? palette.hudFaint : palette.hudLabel);

/**
 * A lit node's halo (L10): `discs` stacked discs in its hue, from just inside the plate's edge line down
 * to `inner` of that radius, coming to about `alpha` at the centre. Tuned at the review page (L13).
 */
export const TREE_HALO = { discs: 4, inner: 0.4, alpha: 0.45 } as const;

/**
 * What a lit node is drawn with (§Change: A lit node glows in its own colour, L4, L7, L8, L10): each hue's
 * colour, the light touch of bronze, the lift at the top, the halo. The tree draws `TREE_LOOK`; the review
 * page (L13) hands another, a preview that is never saved.
 */
export interface TreeLook {
  hues: Readonly<Record<TreeHue, number>>;
  bronzeMix: number;
  lift: number;
  halo: { readonly discs: number; readonly inner: number; readonly alpha: number };
}

/** The tuned look: the palette's hues and the constants above. */
export const TREE_LOOK: TreeLook = { hues: palette.treeHue, bronzeMix: TREE_BRONZE_MIX, lift: TREE_LIT_LIFT, halo: TREE_HALO };

/**
 * A lit node's hue (§Change: A lit node glows in its own colour, L1, L2): held or at max, so rank > 0,
 * every rank alike; none for any other state, or for a node the copy gives none (R42). A locked node
 * is never lit, whatever its rank: the model rules it locked first (V25).
 */
function litHue(node: NodeView, look: TreeLook): number | undefined {
  return (node.state === "held" || node.state === "max") && node.hue ? look.hues[node.hue] : undefined;
}

/** A node picture's ink by its state (L1): greyed, lit in its hue, or open in V29's near-white. */
function pictureInk(node: NodeView, look: TreeLook): KnockoutInk {
  if (greyed(node)) return GREYED;
  const hue = litHue(node, look);
  return hue === undefined ? TREE_INK : treeLitInk(hue, look.bronzeMix, look.lift);
}

/** Each halo disc's alpha, so `discs` of them stacked come to `alpha` where they all overlap. */
export function haloDiscAlpha(alpha: number = TREE_HALO.alpha, discs: number = TREE_HALO.discs): number {
  return 1 - (1 - alpha) ** (1 / discs);
}

/**
 * The halo behind a lit picture (L10, L11), on the plate's graphics `g` about (cx, cy): its first disc
 * stops at `outer`, inside the edge line, and each after it is smaller, so the glow is brightest at the
 * centre. Drawn once with the plate; never a filter, never redrawn per frame.
 */
function drawHalo(g: Phaser.GameObjects.Graphics, cx: number, cy: number, outer: number, hue: number, halo: TreeLook["halo"]): void {
  const { discs, inner, alpha } = halo;
  g.fillStyle(hue, haloDiscAlpha(alpha, discs));
  for (let k = 0; k < discs; k++) g.fillCircle(cx, cy, outer * (1 - ((1 - inner) * k) / Math.max(1, discs - 1)));
}

/** A tip line's colour (R37): the held ranks marked in brass, a refusal's reason muted. */
function tipColour(line: TipLine): number {
  if (line.tone === "name") return palette.frameBright;
  if (line.tone === "kind" || line.tone === "reason") return palette.hudLabel;
  if (line.tone === "note") return palette.hudFaint;
  if (line.tone === "effect" || line.tone === "kicker" || line.tone === "grant") return line.held ? palette.frameBright : palette.hudText;
  return palette.hudText;
}

/**
 * The picture a node draws (R40), where it has one: the tree's own (`passiveIcons.ts`), or the ability
 * node's tree ability's from the ability bar.
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

/**
 * A node's plate on `g`, round for a traversal node (V23), its edge by its state, its whole fill lit when
 * the node is (V29), a lit node's halo in its hue (L10), and its picture fitted to it in its state's ink,
 * or the fallback glyph for a node the copy lacks (V25, R40, R42). Drawn in `look`, the tree's own unless
 * the review page previews another (L13), so what is approved there is what ships. Returns the picture's
 * knockout, for its owner to take down; none for the fallback glyph.
 */
export function drawNodePlate(
  scene: Phaser.Scene,
  g: Phaser.GameObjects.Graphics,
  node: NodeView,
  { rect: plate, round }: PlateLayout,
  look: TreeLook = TREE_LOOK,
): Knockout | undefined {
  const edge = plateEdge(node);
  const dim = greyed(node);
  const fill = (color: number, alpha: number) => {
    g.fillStyle(color, alpha);
    if (round) g.fillCircle(plate.x + plate.width / 2, plate.y + plate.height / 2, plate.width / 2);
    else g.fillRoundedRect(plate.x, plate.y, plate.width, plate.height, 4);
  };
  fill(palette.hudPanelDeep, 0.9);
  if (!dim) fill(edge.color, LIT_PLATE_ALPHA);
  const [cx, cy] = [plate.x + plate.width / 2, plate.y + plate.height / 2];
  g.lineStyle(edge.width, edge.color, edge.alpha);
  if (round) g.strokeCircle(cx, cy, plate.width / 2);
  else g.strokeRoundedRect(plate.x, plate.y, plate.width, plate.height, 4);
  const picture = nodePicture(node.icon);
  if (picture) {
    const hue = litHue(node, look);
    // round on a square plate too, clear of its edge line
    if (hue !== undefined) drawHalo(g, cx, cy, plate.width / 2 - edge.width, hue, look.halo);
    return drawPicture(scene, g, fitIcon(picture, plate.width), plate, pictureInk(node, look), `the ${node.id} node`, PICTURE_DEPTH);
  }
  drawUnknownGlyph(g, cx, cy, dim ? palette.hudFaint : palette.frame, dim ? GREYED_ALPHA : 0.9);
  return undefined;
}

/**
 * `icon` on the box `at` as its knockout in `ink`, at `depth`; its lines on `g` in that ink's idle tint
 * and alpha where the knockout cannot stand, now or at a new render scale (ADR-0080 "Fallback"; L12).
 */
function drawPicture(
  scene: Phaser.Scene,
  g: Phaser.GameObjects.Graphics,
  icon: AbilityIcon,
  at: FrameRect,
  ink: KnockoutInk,
  name: string,
  depth: number,
): Knockout {
  const lines = () => drawIconLines(g, icon, at.x + at.width / 2, at.y + at.height / 2, ink.idle.tint, ink.idle.alpha);
  const knockout = new Knockout({ scene, depth, picture: icon.picture, ink, name, lost: lines });
  if (!knockout.show(at, false)) lines();
  return knockout;
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
  /** The node under the pointer, by id, and its tip. */
  private hovered?: string;
  private tip?: { container: Phaser.GameObjects.Container; width: number; height: number };
  /** Its spends: the ones in flight, the specialization's ask, a refusal's reason (R38). */
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
   * A press: the × closes it; in town the ask's Yes or No answers it, a node's plate spends on it
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
    const at = view.nodes.find((n) => n.id === nodeAt(layout, x, y));
    if (this.spend.asking() && inside(layout.answers.yes, x, y)) this.spend.answer(true);
    else if (this.spend.asking() && inside(layout.answers.no, x, y)) this.spend.answer(false);
    else if (at) this.spend.press(at);
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
    const layout = treeLayout(viewport, view.nodes, view.links);
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
    const locks = this.scene.add.graphics().setDepth(LOCK_DEPTH).setScrollFactor(0);
    view.nodes.forEach((node, i) => {
      if (node.state === "locked") this.drawLock(locks, layout.plates[i].lock);
    });
    this.hoverRing = this.scene.add.graphics().setDepth(HOVER_DEPTH).setScrollFactor(0);
    this.parts = [chrome, content, locks, this.hoverRing];
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
    // the links first, so they stand under the plates (V24)
    const lines = this.scene.add.graphics();
    view.links.forEach((link, i) => {
      const { a, b } = layout.links[i];
      const line = linkLine(link);
      lines.lineStyle(line.width, line.color, line.alpha);
      lines.lineBetween(a.x, a.y, b.x, b.y);
    });
    const g = this.scene.add.graphics();
    parts.push(lines, g);
    view.nodes.forEach((node, i) => {
      const plate = layout.plates[i];
      const picture = drawNodePlate(this.scene, g, node, plate);
      if (picture) this.knockouts.push(picture);
      const { rect } = plate;
      text(rect.x + rect.width / 2, rect.y + rect.height + TREE_RANK_GAP, `${node.rank} / ${node.maxRank}`, 10, rankInk(node), [0.5, 0]);
    });
    if (this.world !== "hub") text(layout.footer.x, layout.footer.y, SPENT_IN_TOWN, 11, palette.hudLabel);
    else this.spendFooter(g, layout, text);
    return parts;
  }

  /** In town, the footer band: the ask with its Yes and No (V27), or a refusal's reason (R38). */
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

  /** A locked node's lock mark in its `box` (V25, V29): the padlock on a dark disc that parts it from the plate's edge. */
  private drawLock(g: Phaser.GameObjects.Graphics, box: FrameRect): void {
    g.fillStyle(palette.hudPanelDeep, 0.95);
    g.fillCircle(box.x + box.width / 2, box.y + box.height / 2, box.width / 2 + 1.5);
    this.knockouts.push(drawPicture(this.scene, g, fitIcon(LOCK_ICON, box.width, 0), box, TREE_INK, "a lock mark", LOCK_DEPTH));
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
    if (at !== this.hovered) {
      this.hovered = at;
      this.hideTip();
      this.hoverRing?.clear();
      const i = view.nodes.findIndex((n) => n.id === at);
      if (i >= 0) {
        const { rect, round } = layout.plates[i];
        const ring = this.hoverRing?.lineStyle(1, palette.interactableBright, 1);
        if (round) ring?.strokeCircle(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2 + 2);
        else ring?.strokeRoundedRect(rect.x - 2, rect.y - 2, rect.width + 4, rect.height + 4, 5);
        this.tip = this.buildTip(view.nodes[i].tip);
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

