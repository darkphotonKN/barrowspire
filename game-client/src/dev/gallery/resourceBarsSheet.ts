/**
 * The Resource bars card: the real `ResourceHud` (the reliquary bars) for each class resource and
 * each state worth eyeing, live, on the run's dark ground. The mage's and the mercenary's rows are
 * driven through a loop of hits, heals, spends and refills, so the chip, the gain's glow, the low
 * Health beat and a charge's glint all show without a server.
 */

import * as Phaser from "phaser";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { ResourceHud } from "@/ui/ResourceHud";
import type { HudBar } from "@/ui/resources";

export const BARS_SHEET = { width: 860, height: 300 } as const;

const health = (fill: number, poisoned = false): HudBar => ({
  channel: "health",
  label: "Health:",
  fill,
  ...(poisoned && { poisoned: true as const }),
});
const mana = (fill: number): HudBar => ({ channel: "mana", label: "Mana:", fill });
const stamina = (fill: number): HudBar => ({ channel: "stamina", label: "Stamina:", fill });
const parry = (held: number, max: number): HudBar => ({
  channel: "parry",
  label: "Parry:",
  fill: held / max,
  pips: Array.from({ length: max }, (_, i) => i < held),
});

/** Each card: its caption and the bars it shows at each beat of the loop (one beat when still). */
const CARDS: { caption: string; beats: HudBar[][] }[] = [
  {
    caption: "Mage: hit, spend, heal, refill",
    beats: [
      [health(0.92), mana(0.8)],
      [health(0.64), mana(0.8)],
      [health(0.64), mana(0.42)],
      [health(0.88), mana(0.42)],
      [health(0.88), mana(0.7)],
    ],
  },
  { caption: "Warrior, hale", beats: [[health(1), stamina(0.55)]] },
  {
    caption: "Mercenary: a parry spent, then won back",
    beats: [
      [health(0.74), parry(3, 3)],
      [health(0.74), parry(2, 3)],
      [health(0.6), parry(1, 3)],
      [health(0.6), parry(2, 3)],
      [health(0.6), parry(3, 3)],
    ],
  },
  { caption: "Sellsword, five charges", beats: [[health(0.5), parry(2, 5)]] },
  { caption: "Poisoned", beats: [[health(0.56, true), stamina(0.3)]] },
  {
    caption: "Low Health: the beat quickens",
    beats: [
      [health(0.3), mana(0.12)],
      [health(0.14), mana(0.12)],
      [health(0.06), mana(0.05)],
      [health(0.3), mana(0.2)],
    ],
  },
];

const COLS = 3;
const CELL_W = 280;
const CELL_H = 140;
const BEAT_MS = 1600;

export class ResourceBarsScene extends Phaser.Scene {
  constructor() {
    super("resource-bars-sheet");
  }

  create(): void {
    CARDS.forEach(({ caption, beats }, i) => {
      const x = 20 + (i % COLS) * CELL_W;
      const y = 20 + Math.floor(i / COLS) * CELL_H;
      this.add.text(x, y, caption, {
        fontFamily: CANVAS_FONT.body,
        fontSize: "13px",
        color: toCss(palette.hudLabel),
      });
      const hud = new ResourceHud(this, x, y + 22);
      hud.show(beats[0]);
      if (beats.length > 1) {
        let beat = 0;
        this.time.addEvent({
          delay: BEAT_MS,
          loop: true,
          callback: () => {
            beat = (beat + 1) % beats.length;
            hud.show(beats[beat]);
          },
        });
      }
    });
  }
}
