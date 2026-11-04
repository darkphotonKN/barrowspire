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
import { itemTipRow } from "./gearOverlayLayout";
import { buildItemTip, rarityEdge, type ItemTip } from "./itemTip";
import { drawWaxSeal } from "./MailboxEnvelope";
import {
  DETAIL_HEAD_H,
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
  private body?: { text: Phaser.GameObjects.Text; rect: Rect; max: number };
  private bodyScroll = 0;
  /** The letter the body was last drawn for: another letter starts at its top. */
  private shownLetter: string | null = null;
  private readonly now: () => number;
  private readonly unsubscribe: () => void;

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
    scene.input.on("wheel", this.onWheel, this);
    this.draw();
  }

  destroy(): void {
    this.unsubscribe();
    this.scene.input?.off("wheel", this.onWheel, this);
    this.clear();
  }

  private clear(): void {
    this.hideTip();
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.body = undefined;
    this.frame = undefined;
  }

  private keep<T extends { destroy(): void }>(o: T): T {
    this.objects.push(o);
    return o;
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
    const frame = letterPanelFrame(
      this.scene.cameras.main,
      detail?.enclosed.length ?? 0,
    );
    this.frame = frame;

    // the panel takes every press on it, so nothing in the world behind answers one
    this.zone(frame.panel).setInteractive();
    const g = this.keep(
      this.scene.add.graphics().setScrollFactor(0).setDepth(PANEL_DEPTH),
    );
    const { panel, header, close, list, detail: right } = frame;
    carvedPanel(g, panel.x, panel.y, panel.width, panel.height);
    this.text(
      header.x,
      header.y + 4,
      "MAILBOX",
      style(palette.hudLabel, 12, { letterSpacing: 2 }),
    );
    const x = this.text(
      close.x + close.width / 2,
      close.y + close.height / 2,
      "×",
      style(palette.hudLabel, 22),
    )
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    x.on("pointerdown", () => this.deps.store.getState().closePanel());
    x.on("pointerover", () => x.setColor(toCss(palette.hudText)));
    x.on("pointerout", () => x.setColor(toCss(palette.hudLabel)));
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
          state.taking === detail.id,
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
      style(palette.hudText, 15, {
        wordWrap: { width: rect.width - 8 },
        lineSpacing: 3,
      }),
    );
    this.body = { text, rect, max: Math.max(0, text.height - rect.height) };
    this.scrollBody(0);

    if (frame.enclosed) this.drawEnclosed(g, detail, take);
  }

  /** Moves the body by `delta` px within its rect, cropping what lies outside it. */
  private scrollBody(delta: number): void {
    const body = this.body;
    if (!body) return;
    this.bodyScroll = Math.min(body.max, Math.max(0, this.bodyScroll + delta));
    body.text.setPosition(body.rect.x, body.rect.y - this.bodyScroll);
    body.text.setCrop(0, this.bodyScroll, body.rect.width, body.rect.height);
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
    g.lineStyle(1, palette.frame, 0.22);
    g.strokeRoundedRect(r.x, r.y, r.width, r.height, WELL_RADIUS);
    const view = slot.kind === "item" ? itemView(slot.item) : undefined;
    const edge = view ? rarityEdge(view) : undefined;
    if (edge !== undefined) {
      g.fillStyle(edge, 0.9 * alpha);
      g.fillRect(r.x + 1, r.y + 5, EDGE_W, r.height - 10);
    }

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
        this.showTip(item, pointer),
      )
      .on("pointerout", () => this.hideTip());
  }

  /** The bag's item tip, built from the stored snapshot, beside the pointer (R37). */
  private showTip(
    item: Extract<EnclosureSlot, { kind: "item" }>["item"],
    pointer: { x: number; y: number },
  ): void {
    this.hideTip();
    const tip = buildItemTip(this.scene, itemView(item));
    tip.container.setDepth(TIP_DEPTH).setScrollFactor(0);
    const [at] = itemTipRow([tip], pointer, this.scene.cameras.main);
    tip.container.setPosition(at.x, at.y);
    this.tip = tip;
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
    if (within(frame.list, pointer.x, pointer.y)) {
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
    } else if (within(frame.body, pointer.x, pointer.y)) {
      this.scrollBody(Math.sign(dy) * BODY_STEP);
    }
  }
}
