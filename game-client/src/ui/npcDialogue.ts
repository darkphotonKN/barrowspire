/**
 * The card a hub NPC speaks through: a compact carved panel at the lower right, sized to what is
 * said, never a box floating in the middle of the world. A medallion bust and the speaker's name
 * head it, the line follows, and the answers are rows below it, top to bottom.
 *
 * Game palette, not the menus' Bone & Soot: it is a panel in the world (design-guideline "UI
 * Chrome"), so dark vellum on carved stone with a brass rule. Each answer is the shared menu row
 * (`menuOption`), so its colour, its key on the label, its dimming and its camera-fixed hit area
 * are the same as every other canvas menu's.
 */

import type Phaser from "phaser";
import { CANVAS_FONT, toCss } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import { maskedBust, type Portrait } from "./bustPortrait";
import { carvedPanel } from "./carvedPanel";
import { MENU_DEPTH, menuOption, type MenuOption, type MenuTones } from "./menuPanel";

/** One answer: its label already carries its key, e.g. "Descend alone  [1]". */
export interface DialogueCardRow {
  id: string;
  label: string;
  colour: number;
  onPick: () => void;
  /** Whether it can be picked now, read live; omitted means always. */
  enabled?: () => boolean;
}

export interface DialogueCardSpec {
  name: string;
  /** A few words of who they are, under the name. Residents have none. */
  role?: string;
  line: string;
  rows: DialogueCardRow[];
  /** The frame to cut the medallion bust from: whatever the speaker is showing. */
  portrait?: Portrait;
  tones: Pick<MenuTones, "panel" | "text" | "dim">;
}

/** The scene slice the card draws with; the portrait needs the textures and an unlisted mask. */
type CardStage = Pick<Phaser.Scene, "add" | "cameras"> & Partial<Pick<Phaser.Scene, "make" | "textures">>;

export interface DialogueCard {
  /** Camera-fixed, in the popup band; destroying it takes the rows' hit areas and the mask too. */
  container: Phaser.GameObjects.Container;
  /** Redraws each row's colour when whether it can be picked changes under the open card. */
  retone(): void;
}

const hex = BARROW_HEX;
const MARGIN = 20;
const WIDTH = 372;
const PAD = 22;
const HEAD_H = 76;
const ROW_H = 38;
const MEDALLION_R = 27;
/** Draws the card and its rows; the caller keeps the container and closes it by destroying it. */
export function showDialogueCard(scene: CardStage, spec: DialogueCardSpec): DialogueCard {
  const { width, height } = scene.cameras.main;
  const line = scene.add.text(0, 0, spec.line, {
    fontFamily: CANVAS_FONT.body,
    fontSize: "15px",
    color: toCss(hex.vellum),
    lineSpacing: 5,
    wordWrap: { width: WIDTH - PAD * 2, useAdvancedWrap: true },
  });
  const h = HEAD_H + 16 + line.height + 18 + spec.rows.length * ROW_H + 14;
  const x = width - MARGIN - WIDTH;
  const y = height - MARGIN - h;

  const panel = scene.add.graphics();
  carvedPanel(panel, x, y, WIDTH, h);
  // A darker head band, like a page's running head.
  panel.fillStyle(hex.pitch, 0.55);
  panel.fillRect(x + 5, y + 5, WIDTH - 10, HEAD_H - 5);
  panel.lineStyle(1, hex.brass, 0.45);
  panel.lineBetween(x + 5, y + HEAD_H + 0.5, x + WIDTH - 5, y + HEAD_H + 0.5);
  const parts: Phaser.GameObjects.GameObject[] = [panel];

  // The medallion: a round bust in a brass ring.
  const r = MEDALLION_R;
  const mx = x + PAD + r;
  const my = y + 5 + (HEAD_H - 5) / 2;
  const disc = scene.add.graphics();
  disc.fillStyle(hex.charcoal, 1);
  disc.fillCircle(mx, my, r);
  parts.push(disc);
  const figure = spec.portrait && maskedBust(scene, spec.portrait, mx, my, r);
  const mask = figure ? figure.mask : undefined;
  if (figure && figure.mask) parts.push(figure.image);
  const ring = scene.add.graphics();
  ring.lineStyle(2, hex.brass, 0.9);
  ring.strokeCircle(mx, my, r);
  ring.lineStyle(1, hex.brassBright, 0.5);
  ring.strokeCircle(mx, my, r + 3);
  parts.push(ring);

  const nx = mx + r + 16;
  parts.push(
    scene.add
      .text(nx, my - (spec.role ? 10 : 0), spec.name.toUpperCase(), {
        fontFamily: CANVAS_FONT.body,
        fontSize: "16px",
        color: toCss(hex.brassBright),
        letterSpacing: 3,
      })
      .setOrigin(0, 0.5),
  );
  if (spec.role) {
    parts.push(
      scene.add
        .text(nx, my + 12, spec.role, {
          fontFamily: CANVAS_FONT.body,
          fontSize: "13px",
          fontStyle: "italic",
          color: toCss(hex.vellumDark),
        })
        .setOrigin(0, 0.5),
    );
  }

  line.setPosition(x + PAD, y + HEAD_H + 16);
  parts.push(line);

  // The rows, top to bottom in the order given, a brass hairline above each.
  const top = y + HEAD_H + 16 + line.height + 18;
  const rules = scene.add.graphics();
  rules.lineStyle(1, hex.brass, 0.18);
  spec.rows.forEach((_, i) => rules.lineBetween(x + PAD, top + i * ROW_H + 0.5, x + WIDTH - PAD, top + i * ROW_H + 0.5));
  parts.push(rules);
  // The card sits at the screen's origin, so a row's place in it is its place on the screen.
  const options: MenuOption[] = spec.rows.map((row, i) =>
    menuOption(scene, {
      x: x + WIDTH / 2,
      y: top + i * ROW_H + ROW_H / 2,
      label: row.label,
      colour: row.colour,
      onPick: row.onPick,
      name: `choice-${row.id}`,
      origin: { x: 0, y: 0 },
      enabled: row.enabled,
      hit: { width: WIDTH - 12, height: ROW_H },
      tones: spec.tones,
    }),
  );
  parts.push(...options);

  const container = scene.add.container(0, 0, parts).setScrollFactor(0).setDepth(MENU_DEPTH);
  // the mask lives outside the container, so it goes down with it by hand
  container.once("destroy", () => mask?.destroy());
  return { container, retone: () => options.forEach((o) => o.retone()) };
}
