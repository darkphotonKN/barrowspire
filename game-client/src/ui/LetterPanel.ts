/**
 * The letter panel (FS-1GZGD R36–R38, R40; D14): a centred carved panel over the town, the
 * mailbox's letters on the left (title, how long ago, an enclosure glyph; unread bright with a
 * lit seal dot, read dim) and the open letter on the right (title, sender, sent date, days left,
 * the plain-text body, scrolled with the wheel), with its Enclosed row under the body.
 *
 * The Enclosed row draws each item from the letter's stored snapshot with the bag's icon and the
 * bag's item tip on hover, "x3" for a stack, and gold as a `coins` slot with its amount under it
 * (R37, S8). The one Take button sits at the row's right end (R39, A5): "Take", then "Taking…"
 * and not pressable while the claim is in flight, then gone, the slots dimmed under a "Taken" wax
 * stamp. A refused Take's line (a full stash, a seal that would not break) sits over the button.
 *
 * In-world panel on the game palette (`carvedPanel`, ADR-0025). It reads the mailbox store and
 * decides nothing: the words and the order are `@/mailbox/mailbox`'s, the geometry
 * `letterPanelLayout`'s. Esc is the scene's (the hub's one Esc key); × closes too.
 */

import type Phaser from "phaser";
import type { StoreApi } from "zustand";
import { itemView } from "@/items/itemView";
import {
  EMPTY_MAILBOX,
  MAILBOX_UNREACHABLE,
  TAKEN_STAMP,
  letterDetail,
  letterRow,
  takeView,
  type EnclosureSlot,
  type LetterDetail,
  type LetterRow,
  type TakeView,
} from "@/mailbox/mailbox";
import { artSprite } from "@/render/art/phaser";
import { iconSheet } from "@/render/art/itemIcons";
import type { ArtLibrary } from "@/render/art/library";
import type { MailboxState } from "@/stores/mailboxStore";
import { CANVAS_FONT, palette, shade, toCss } from "@/utils/canvasPalette";
import { carvedPanel } from "./carvedPanel";
import { drawPanelTitle } from "./panelFrame";
import { itemTipRow } from "./gearOverlayLayout";
import { itemShine, strokeWellOutline } from "./itemShine";
import { buildItemTip, rarityEdge, topTier, type ItemTip } from "./itemTip";
import { drawWaxSeal } from "./MailboxEnvelope";
import { fillMaskArea, maskInView, viewport } from "@/render/viewport";
import {
  BODY_SCROLL_GAP,
  BODY_SCROLL_GRAB,
  BODY_SCROLL_W,
  DETAIL_HEAD_H,
  bodyScrollAt,
  bodyScrollThumb,
  bodyScrollTrack,
  letterPanelFrame,
  listWindow,
  scrolledList,
  type LetterPanelFrame,
  type Rect,
} from "./letterPanelLayout";

export interface LetterPanelDeps {
  store: StoreApi<MailboxState>;
  art: ArtLibrary;
  now?: () => number;
  /** The character's level, where known: the item tip tones a requirement above it (FS-BDA7X R45). */
  level?: () => number | undefined;
}

/** Over the HUD (1000) and the gear overlay (1100), under the menus (2000) and item tips (2200). */
const PANEL_DEPTH = 1800;
const TIP_DEPTH = 2200;
/** How much of a slot its icon fills, as in the bag. */
const ICON_FILL = 0.78;
/** Taken enclosures are drawn this faint, under the Taken stamp (R39). */
const TAKEN_ALPHA = 0.4;
/** Body px scrolled per wheel notch. */
const BODY_STEP = 24;
/** The body's type: the chat's size, not the dialogue's, so a long letter reads as a letter. */
const BODY_PX = 13;
const BODY_LINE_SPACING = 2;
const ROW_TITLE_MAX = 28;
const DETAIL_TITLE_MAX = 46;
const WELL_RADIUS = 4;
/** A button that cannot be pressed now ("Taking…") is drawn this faint, as the HUD's are. */
const INERT_ALPHA = 0.45;
const EDGE_W = 3;

const style = (
  colour: number,
  px: number,
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
) => ({
  fontFamily: CANVAS_FONT.body,
  fontSize: `${px}px`,
  color: toCss(colour),
  ...extra,
});

const within = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

/** A title cut to `max` characters with an ellipsis, so it keeps to its line. */
function clip(words: string, max: number): string {
  const chars = Array.from(words);
  return chars.length <= max
    ? words
    : `${chars
        .slice(0, max - 1)
        .join("")
        .trimEnd()}…`;
}

export class LetterPanel {
  private objects: { destroy(): void }[] = [];
  private frame?: LetterPanelFrame;
  private tip?: ItemTip;
  private listOffset = 0;
  private body?: {
    text: Phaser.GameObjects.Text;
    rect: Rect;
    max: number;
    bar: Phaser.GameObjects.Graphics;
  };
  private bodyScroll = 0;
  /** While the body's thumb is held: how far below its top it was caught. */
  private grabbed?: number;
  /** The letter the body was last drawn for: another letter starts at its top. */
  private shownLetter: string | null = null;
  private readonly now: () => number;
  private readonly unsubscribe: () => void;
  /** The body's clip: its shape, its area and the render scale it was last drawn on the grid of. */
  private bodyMask?: {
    shape: Phaser.GameObjects.Graphics;
    rect: Rect;
    scale: number;
  };
  private readonly unwatchScale: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly deps: LetterPanelDeps,
  ) {
    this.now = deps.now ?? Date.now;
    this.unsubscribe = deps.store.subscribe((state, prev) => {
      if (
        state.panelOpen !== prev.panelOpen ||
        state.letters !== prev.letters ||
        state.selectedId !== prev.selectedId ||
        state.lettersStatus !== prev.lettersStatus ||
        state.notice !== prev.notice ||
        state.taking !== prev.taking ||
        state.takeWarning !== prev.takeWarning
      )
        this.draw();
    });
    // the body's clip lies on the backing px grid, so a new render scale alone redraws it
    this.unwatchScale = viewport.onChange((view) => {
      if (this.bodyMask && view.renderScale !== this.bodyMask.scale)
        this.shapeBodyMask();
    });
    scene.input.on("wheel", this.onWheel, this);
    scene.input.on("pointermove", this.onMove, this);
    scene.input.on("pointerup", this.onRelease, this);
    this.draw();
  }

  destroy(): void {
    this.unsubscribe();
    this.unwatchScale();
    this.scene.input?.off("wheel", this.onWheel, this);
    this.scene.input?.off("pointermove", this.onMove, this);
    this.scene.input?.off("pointerup", this.onRelease, this);
    this.clear();
  }

  /** The logical view changed: the open panel is drawn again, centred in it (FS-ZAJMH R13). */
  relayout(): void {
    this.draw();
  }

  /** Whether a screen point lies on the open panel: a wheel or a press there is the panel's alone. */
  covers(x: number, y: number): boolean {
    return this.frame !== undefined && within(this.frame.panel, x, y);
  }

  private clear(): void {
    this.hideTip();
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.body = undefined;
    this.bodyMask = undefined;
    this.frame = undefined;
  }

  private keep<T extends { destroy(): void }>(o: T): T {
    this.objects.push(o);
    return o;
  }

  /**
   * Draws the body's clip on the backing px grid of the render scale now (`fillMaskArea`), so its
   * edge rows and columns let the text through as Phaser 3.90's multisampled stencil did
   * (ADR-0057 §Masks, as the chat's clip). Redrawn in place for a new render scale alone: the
   * mask stays laid, and the body text is not drawn again.
   */
  private shapeBodyMask(): void {
    if (!this.bodyMask) return;
    const { shape, rect } = this.bodyMask;
    this.bodyMask.scale = viewport.renderScale;
    shape.clear();
    // a mask's colour is never drawn, only its alpha; any token keeps the fence's literal ban
    fillMaskArea(shape, rect, palette.hudText, this.bodyMask.scale);
  }

  private text(
    x: number,
    y: number,
    words: string,
    s: Phaser.Types.GameObjects.Text.TextStyle,
  ) {
    return this.keep(
      this.scene.add
        .text(x, y, words, s)
        .setScrollFactor(0)
        .setDepth(PANEL_DEPTH),
    );
  }

  private zone(r: Rect) {
    return this.keep(
      this.scene.add
        .zone(r.x, r.y, r.width, r.height)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(PANEL_DEPTH),
    );
  }

  private draw(): void {
    this.clear();
    const state = this.deps.store.getState();
    if (!state.panelOpen) return;

    const selected = state.letters.find((l) => l.id === state.selectedId);
    if ((selected?.id ?? null) !== this.shownLetter) {
      this.shownLetter = selected?.id ?? null;
      this.bodyScroll = 0;
    }
    const detail = selected ? letterDetail(selected, this.now()) : undefined;
    const frame = letterPanelFrame(viewport, detail?.enclosed.length ?? 0);
    this.frame = frame;

    // the panel takes every press on it, so nothing in the world behind answers one
    this.zone(frame.panel).setInteractive();
    const g = this.keep(
      this.scene.add.graphics().setScrollFactor(0).setDepth(PANEL_DEPTH),
    );
    const { panel, close, list, detail: right } = frame;
    carvedPanel(g, panel.x, panel.y, panel.width, panel.height);
    // the windows' one title, centred (FS-3EBCA R20, R22)
    this.keep(
      drawPanelTitle(this.scene, panel, "MAILBOX").setScrollFactor(0).setDepth(PANEL_DEPTH),
    );
    // amber, as everything that can be pressed is; brighter under the pointer
    const x = this.text(
      close.x + close.width / 2,
      close.y + close.height / 2,
      "×",
      style(palette.interactable, 22),
    )
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    x.on("pointerdown", () => this.deps.store.getState().closePanel());
    x.on("pointerover", () => x.setColor(toCss(palette.interactableBright)));
    x.on("pointerout", () => x.setColor(toCss(palette.interactable)));
    // the gutter between the list and the letter
    const gutter = (list.x + list.width + right.x) / 2;
    g.lineStyle(1, palette.frame, 0.3);
    g.lineBetween(gutter, list.y, gutter, list.y + list.height);

    this.drawList(
      g,
      state.letters.map((l) => letterRow(l, this.now())),
      state.selectedId,
    );

    const centred = (words: string, colour: number) =>
      this.text(
        right.x + right.width / 2,
        right.y + right.height / 2,
        words,
        style(colour, 16, {
          align: "center",
          wordWrap: { width: right.width - 40 },
        }),
      ).setOrigin(0.5);
    if (state.notice) centred(state.notice, palette.hudText);
    else if (state.lettersStatus === "unreachable")
      centred(MAILBOX_UNREACHABLE, palette.hudLabel);
    else if (state.lettersStatus === "ready" && state.letters.length === 0)
      centred(EMPTY_MAILBOX, palette.hudLabel);
    else if (detail) {
      const warning = state.takeWarning;
      this.drawLetter(
        g,
        detail,
        takeView(
          detail,
          state.taking,
          warning?.letterId === detail.id ? warning.text : null,
        ),
      );
    }
  }

  private drawList(
    g: Phaser.GameObjects.Graphics,
    rows: LetterRow[],
    selectedId: string | null,
  ): void {
    const frame = this.frame!;
    const { first, count } = listWindow(
      rows.length,
      this.listOffset,
      frame.rows.length,
    );
    this.listOffset = first;
    for (let i = 0; i < count; i++) {
      const row = rows[first + i];
      const r = frame.rows[i];
      if (row.id === selectedId) {
        g.fillStyle(palette.hudPanelDeep, 0.75);
        g.fillRoundedRect(r.x, r.y + 2, r.width, r.height - 4, WELL_RADIUS);
        g.lineStyle(1, palette.frame, 0.45);
        g.strokeRoundedRect(
          r.x + 0.5,
          r.y + 2.5,
          r.width - 1,
          r.height - 5,
          WELL_RADIUS,
        );
      } else if (i > 0) {
        g.lineStyle(1, palette.frame, 0.12);
        g.lineBetween(r.x + 8, r.y, r.x + r.width - 8, r.y);
      }
      // an unread letter: bright, with a lit seal dot
      if (row.unread) drawWaxSeal(g, r.x + 11, r.y + r.height / 2, 4, true);
      this.text(
        r.x + 24,
        r.y + 6,
        clip(row.title, ROW_TITLE_MAX),
        style(row.unread ? palette.hudText : palette.hudLabel, 14),
      );
      this.text(
        r.x + 24,
        r.y + 25,
        row.time,
        style(row.unread ? palette.hudLabel : palette.hudFaint, 12),
      );
      if (row.glyph !== "none")
        this.drawGlyph(
          g,
          r.x + r.width - 24,
          r.y + r.height / 2 - 5,
          row.glyph === "lit",
        );
      this.zone(r)
        .setInteractive({ useHandCursor: true })
        .on(
          "pointerdown",
          () => void this.deps.store.getState().select(row.id),
        );
    }
  }

  /** The enclosure glyph: a small tied parcel, lit while the letter still holds what it encloses. */
  private drawGlyph(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    lit: boolean,
  ): void {
    const colour = lit ? palette.hudText : palette.hudFaint;
    const alpha = lit ? 0.95 : 0.5;
    g.lineStyle(1, colour, alpha);
    g.strokeRect(x, y, 14, 10);
    g.lineBetween(x + 7, y, x + 7, y + 10);
    g.lineBetween(x, y + 5, x + 14, y + 5);
  }

  private drawLetter(
    g: Phaser.GameObjects.Graphics,
    detail: LetterDetail,
    take: TakeView,
  ): void {
    const frame = this.frame!;
    const right = frame.detail;
    const top = right.y;
    this.text(
      right.x,
      top,
      clip(detail.title, DETAIL_TITLE_MAX),
      style(palette.hudText, 18, { fontStyle: "bold" }),
    );
    this.text(right.x, top + 26, detail.sender, style(palette.hudLabel, 14));
    this.text(right.x, top + 47, detail.sent, style(palette.hudFaint, 12));
    this.text(
      right.x + right.width,
      top + 47,
      detail.expiry.text,
      style(
        detail.expiry.warning ? palette.damageBright : palette.hudLabel,
        12,
      ),
    ).setOrigin(1, 0);
    g.lineStyle(1, palette.frame, 0.35);
    g.lineBetween(
      right.x,
      top + DETAIL_HEAD_H - 9,
      right.x + right.width,
      top + DETAIL_HEAD_H - 9,
    );

    const rect = frame.body;
    const text = this.text(
      rect.x,
      rect.y,
      detail.body,
      style(palette.hudText, BODY_PX, {
        wordWrap: {
          width: rect.width - BODY_SCROLL_W - BODY_SCROLL_GAP,
          useAdvancedWrap: true,
        },
        lineSpacing: BODY_LINE_SPACING,
      }),
    );
    // Clipped by a mask in screen space, not setCrop: a crop is in the text texture's pixels, which
    // crisp text renders at the device pixel ratio, so it no longer lined up with the body's rect.
    const maskShape = this.keep(
      this.scene.make.graphics({}, false).setScrollFactor(0),
    );
    this.bodyMask = { shape: maskShape, rect, scale: viewport.renderScale };
    this.shapeBodyMask();
    maskInView(text, maskShape, this.scene.cameras.main);
    const bar = this.keep(
      this.scene.add.graphics().setScrollFactor(0).setDepth(PANEL_DEPTH),
    );
    this.body = {
      text,
      rect,
      max: Math.max(0, text.height - rect.height),
      bar,
    };
    this.scrollBody(0);
    // a press on the bar: on the thumb it is held where caught, on the bare track the thumb jumps there
    const track = bodyScrollTrack(rect);
    if (this.body.max > 0)
      this.zone({
        x: track.x - BODY_SCROLL_GRAB,
        y: track.y,
        width: track.width + BODY_SCROLL_GRAB * 2,
        height: track.height,
      })
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", (pointer: { x: number; y: number }) =>
          this.grabBar(viewport.toLogical(pointer).y),
        );

    if (frame.enclosed) this.drawEnclosed(g, detail, take);
  }

  /** Moves the body by `delta` px within its rect, cropping what lies outside it. */
  private scrollBody(delta: number): void {
    const body = this.body;
    if (!body) return;
    this.bodyScroll = Math.min(body.max, Math.max(0, this.bodyScroll + delta));
    body.text.setPosition(body.rect.x, body.rect.y - this.bodyScroll);
    this.drawBodyBar();
  }

  /** The body's track and thumb, drawn only while the letter runs longer than its window. */
  private drawBodyBar(): void {
    const body = this.body;
    if (!body) return;
    const g = body.bar;
    g.clear();
    const track = bodyScrollTrack(body.rect);
    const thumb = bodyScrollThumb(
      track,
      body.text.height,
      this.bodyScroll,
      body.rect.height,
    );
    if (!thumb) return;
    g.fillStyle(palette.chatRule, 0.18);
    g.fillRoundedRect(track.x, track.y, track.width, track.height, 2);
    g.fillStyle(palette.chatRule, 0.75);
    g.fillRoundedRect(thumb.x, thumb.y, thumb.width, thumb.height, 2);
  }

  /** A press on the bar: held where caught on the thumb, centred on the press on the bare track. */
  private grabBar(y: number): void {
    const body = this.body;
    if (!body) return;
    const track = bodyScrollTrack(body.rect);
    const thumb = bodyScrollThumb(
      track,
      body.text.height,
      this.bodyScroll,
      body.rect.height,
    );
    if (!thumb) return;
    const onThumb = y >= thumb.y && y <= thumb.y + thumb.height;
    this.grabbed = onThumb ? y - thumb.y : thumb.height / 2;
    this.onDrag({ y });
  }

  /** Phaser's pointer.x/y are backing px; the panel is laid out in logical units (FS-ZAJMH R15). */
  private onMove(pointer: { x: number; y: number }): void {
    this.onDrag(viewport.toLogical(pointer));
  }

  /** While the thumb is held, the body follows the pointer (logical units) up and down, wherever it wanders. */
  private onDrag(pointer: { y: number }): void {
    const body = this.body;
    if (this.grabbed === undefined || !body) return;
    const track = bodyScrollTrack(body.rect);
    const thumb = bodyScrollThumb(
      track,
      body.text.height,
      this.bodyScroll,
      body.rect.height,
    );
    if (!thumb) return;
    const next = bodyScrollAt(
      track,
      body.text.height,
      body.rect.height,
      thumb.height,
      pointer.y - this.grabbed,
    );
    this.scrollBody(next - this.bodyScroll);
  }

  private onRelease(): void {
    this.grabbed = undefined;
  }

  /** The Enclosed row (R37) and its Take button, stamp and warning line (R39). */
  private drawEnclosed(
    g: Phaser.GameObjects.Graphics,
    detail: LetterDetail,
    take: TakeView,
  ): void {
    const enclosed = this.frame!.enclosed!;
    this.text(
      enclosed.caption.x,
      enclosed.caption.y,
      "ENCLOSED",
      style(palette.hudLabel, 11, { letterSpacing: 2 }),
    );
    const alpha = detail.untaken ? 1 : TAKEN_ALPHA;
    detail.enclosed.forEach((slot, i) =>
      this.drawSlot(g, enclosed.slots[i], slot, alpha),
    );

    if (take.stamp) this.drawStamp(enclosed.stamp);
    if (take.warning)
      this.text(
        enclosed.warning.x + enclosed.warning.width,
        enclosed.warning.y,
        take.warning,
        style(palette.damageBright, 12),
      ).setOrigin(1, 0);
    if (take.button) {
      const id = detail.id;
      this.drawButton(g, enclosed.take, take.button, () =>
        this.deps.store.getState().take(id),
      );
    }
  }

  /**
   * A stone button with a brass rim, as the HUD's: amber words while it can be pressed (amber
   * means interactable), faint and inert while not, so a claim in flight is never sent twice.
   */
  private drawButton(
    g: Phaser.GameObjects.Graphics,
    r: Rect,
    button: { label: string; enabled: boolean },
    press: () => void,
  ): void {
    g.fillStyle(palette.hudPanelDeep, 0.85);
    g.fillRoundedRect(r.x, r.y, r.width, r.height, WELL_RADIUS);
    g.lineStyle(1, palette.frame, button.enabled ? 0.8 : 0.3);
    g.strokeRoundedRect(
      r.x + 0.5,
      r.y + 0.5,
      r.width - 1,
      r.height - 1,
      WELL_RADIUS,
    );
    const label = this.text(
      r.x + r.width / 2,
      r.y + r.height / 2,
      button.label,
      style(button.enabled ? palette.interactable : palette.hudFaint, 14),
    ).setOrigin(0.5);
    if (!button.enabled) {
      label.setAlpha(INERT_ALPHA);
      return;
    }
    label.setInteractive({ useHandCursor: true }).on("pointerdown", press);
    label.on("pointerover", () =>
      label.setColor(toCss(palette.interactableBright)),
    );
    label.on("pointerout", () => label.setColor(toCss(palette.interactable)));
  }

  /** The "Taken" wax stamp (A5): a pressed blot of wax over the dimmed slots, the word on it. */
  private drawStamp(at: { x: number; y: number; radius: number }): void {
    const { x, y, radius: r } = at;
    // its own layer, made after the slots' icons, so the wax lies over them
    const g = this.keep(
      this.scene.add.graphics().setScrollFactor(0).setDepth(PANEL_DEPTH),
    );
    g.fillStyle(palette.ember, 0.9);
    // a drip or two at the rim, as the envelope's seal has, so it reads as wax
    g.fillCircle(x - r * 0.8, y + r * 0.5, r * 0.3);
    g.fillCircle(x + r * 0.75, y - r * 0.55, r * 0.24);
    g.fillCircle(x, y, r);
    g.lineStyle(1.5, shade(palette.ember, 0.4), 0.9);
    g.strokeCircle(x, y, r - 4);
    this.text(
      x,
      y,
      TAKEN_STAMP,
      style(palette.hudText, 13, {
        fontStyle: "bold",
        stroke: toCss(shade(palette.ember, 0.5)),
        strokeThickness: 2,
      }),
    ).setOrigin(0.5);
  }

  /** One slot: the bag's well and icon, its rarity edge, and its count or gold amount. */
  private drawSlot(
    g: Phaser.GameObjects.Graphics,
    r: Rect,
    slot: EnclosureSlot,
    alpha: number,
  ): void {
    g.fillStyle(palette.inkDeep, 0.6);
    g.fillRoundedRect(r.x, r.y, r.width, r.height, WELL_RADIUS);
    const view = slot.kind === "item" ? this.view(slot.item) : undefined;
    const top = view && topTier(view);
    if (top)
      strokeWellOutline(
        g,
        { x: r.x, y: r.y, w: r.width, h: r.height },
        WELL_RADIUS,
        top,
        alpha,
      );
    else {
      g.lineStyle(1, palette.frame, 0.22);
      g.strokeRoundedRect(r.x, r.y, r.width, r.height, WELL_RADIUS);
    }
    const edge = view ? rarityEdge(view) : undefined;
    if (edge !== undefined) {
      g.fillStyle(edge, 0.9 * alpha);
      g.fillRect(r.x + 1, r.y + 5, EDGE_W, r.height - 10);
    }

    // every slot object stands alone at one depth, so the glow must be made before its icon
    const shine =
      view &&
      itemShine(this.scene, this.deps.art, view, {
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        side: Math.min(r.width, r.height) * ICON_FILL,
      });
    shine?.glow.setScrollFactor(0).setDepth(PANEL_DEPTH);

    const icon = this.keep(
      artSprite(
        this.scene,
        this.deps.art,
        r.x + r.width / 2,
        r.y + r.height / 2,
        iconSheet(slot.icon),
      ),
    );
    icon.setOrigin(0.5).setScrollFactor(0).setDepth(PANEL_DEPTH);
    const size = Math.max(icon.frame?.width ?? 0, icon.frame?.height ?? 0) || 1;
    icon.setScale((Math.min(r.width, r.height) * ICON_FILL) / size);
    if (alpha < 1) icon.setAlpha(alpha);
    // made after its icon at that one depth, so it lies over it; it goes when the icon does
    shine?.bind(icon)?.setScrollFactor(0).setDepth(PANEL_DEPTH);

    if (slot.kind === "gold") {
      this.text(
        r.x + r.width / 2,
        r.y + r.height + 2,
        slot.amount,
        style(palette.hudText, 12),
      ).setOrigin(0.5, 0);
      return;
    }
    if (slot.quantity)
      this.text(
        r.x + r.width - 3,
        r.y + r.height - 2,
        slot.quantity,
        style(palette.hudText, 12, {
          stroke: toCss(palette.inkDeep),
          strokeThickness: 3,
        }),
      ).setOrigin(1, 1);
    const item = slot.item;
    this.zone(r)
      .setInteractive()
      .on("pointerover", (pointer: { x: number; y: number }) =>
        this.showTip(item, viewport.toLogical(pointer)),
      )
      .on("pointerout", () => this.hideTip());
  }

  /** The bag's item tip, built from the stored snapshot, beside the pointer (logical units, R37). */
  private showTip(
    item: Extract<EnclosureSlot, { kind: "item" }>["item"],
    pointer: { x: number; y: number },
  ): void {
    this.hideTip();
    const tip = buildItemTip(this.scene, this.view(item));
    tip.container.setDepth(TIP_DEPTH).setScrollFactor(0);
    const [at] = itemTipRow([tip], pointer, viewport);
    tip.container.setPosition(at.x, at.y);
    this.tip = tip;
  }

  /** An enclosed item as the gear overlay reads one: against the character's level (FS-BDA7X R45). */
  private view(item: Extract<EnclosureSlot, { kind: "item" }>["item"]) {
    return itemView(item, this.deps.level?.());
  }

  private hideTip(): void {
    this.tip?.container.destroy();
    this.tip = undefined;
  }

  /** The wheel scrolls the list a row a notch, or the open letter's body, under the pointer. */
  private onWheel(
    pointer: { x: number; y: number },
    _over: unknown,
    _dx: number,
    dy: number,
  ): void {
    const frame = this.frame;
    if (!frame || !dy) return;
    const at = viewport.toLogical(pointer);
    if (within(frame.list, at.x, at.y)) {
      const letters = this.deps.store.getState().letters.length;
      const next = scrolledList(
        this.listOffset,
        Math.sign(dy),
        letters,
        frame.rows.length,
      );
      if (next === this.listOffset) return;
      this.listOffset = next;
      this.draw();
    } else if (within(frame.body, at.x, at.y)) {
      this.scrollBody(Math.sign(dy) * BODY_STEP);
    }
  }
}
