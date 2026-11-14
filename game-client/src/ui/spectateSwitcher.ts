/**
 * The spectate switcher, "◄ Watching <name> ►" (FS-QPDKN § Change: The party death flow and the spectate
 * switcher, R159–R162; the owner, 「切換箭頭就放在上方一些」): over the spectate row, in the run's world (ADR-0083
 * 2.3), in the HUD band.
 *
 * Neutral HUD out of the shared pieces, nothing new: one `hudPanel` backing across it, the words in vellum, and
 * each arrow a `drawHudButton` (its 1 px brass outline, live or greyed, its sounds by `hudButtonSounds`: a
 * hover `menu_hover`, a release `menu_click`, a greyed one's release `menu_error`; no cursor of its own) with
 * the options slider's triangle drawn in code, since the canvas body face has no ◄ or ►. Greyed while there is
 * nobody else to switch to.
 */

import type Phaser from "phaser";
import type { UiEffect } from "@/audio/uiSounds";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import type { Rect } from "./hudCornerLayout";
import { drawHudButton, hudButtonSounds } from "./PartyPanel";
import { SWITCHER_ARROW_W } from "./resolvedRow";

/** The HUD band, with the run's row (R158); the arrows' hit areas one over it, as the row's. */
const SWITCHER_DEPTH = 1000;
/** The options slider's arrow mark (FS-28DDG § Change C5): a triangle 8 wide and 12 high. */
const ARROW_MARK_W = 8;
const ARROW_MARK_H = 12;
/** A greyed arrow's mark, as faint as a greyed HUD button's words (`drawHudButton`). */
const GREYED_ALPHA = 0.45;
/** The corner of the backing, the HUD buttons' (`drawHudButton`). */
const BACKING_RADIUS = 3;

/** The words the switcher shows for the watched teammate. */
export function watchingWords(name: string): string {
  return `Watching ${name}`;
}

export interface SwitcherSpec {
  /** The watched teammate's name over their head. */
  name: string;
  /** More than one teammate in play: the arrows are live (R162). */
  canSwitch: boolean;
  /** Where it stands, given its words' width (`switcherRect`). */
  place(labelWidth: number): Rect;
  /** ◄: the previous teammate in play (R160). */
  previous(): void;
  /** ►: the next teammate in play (R160). */
  next(): void;
  /** The UI scene's one player (FS-WDM0X M3). */
  play(effect: UiEffect): void;
}

type Part = { destroy(): void };

export class SpectateSwitcher {
  private readonly parts: Part[] = [];
  private readonly at: Rect;

  constructor(scene: Phaser.Scene, spec: SwitcherSpec) {
    // made before the words: at one depth Phaser renders in the order made (DisplayList.depthSort is a stable
    // sort), so a backing made after them covered them
    const g = scene.add.graphics().setScrollFactor(0).setDepth(SWITCHER_DEPTH);
    const label = scene.add
      .text(0, 0, watchingWords(spec.name), {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(palette.hudText),
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0);
    const r = spec.place(label.width);
    this.at = r;
    g.fillStyle(palette.hudPanel, 1);
    g.fillRoundedRect(r.x, r.y, r.width, r.height, BACKING_RADIUS);
    // the words over the backing, made after it at the same depth
    label.setPosition(r.x + r.width / 2, r.y + r.height / 2).setDepth(SWITCHER_DEPTH);
    this.parts.push(g, label);

    const feedback = hudButtonSounds(spec.play);
    const arrow = (name: string, box: Rect, press: () => void, pointsRight: boolean) => {
      // its words a space: the mark is drawn below, and a blank label still carries the whole button's hit
      // area (drawHudButton) on a Text Phaser renders, so it is an input candidate (willRender)
      const hit = drawHudButton(scene, g, {
        rect: box,
        label: " ",
        enabled: spec.canSwitch,
        press,
        depth: SWITCHER_DEPTH + 1,
        feedback,
      }).setName(name);
      this.parts.push(hit);
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const tip = pointsRight ? cx + ARROW_MARK_W / 2 : cx - ARROW_MARK_W / 2;
      const base = pointsRight ? cx - ARROW_MARK_W / 2 : cx + ARROW_MARK_W / 2;
      g.fillStyle(spec.canSwitch ? palette.interactable : palette.hudFaint, spec.canSwitch ? 1 : GREYED_ALPHA);
      g.fillTriangle(tip, cy, base, cy - ARROW_MARK_H / 2, base, cy + ARROW_MARK_H / 2);
    };
    arrow("watch-previous", { x: r.x, y: r.y, width: SWITCHER_ARROW_W, height: r.height }, spec.previous, false);
    arrow(
      "watch-next",
      { x: r.x + r.width - SWITCHER_ARROW_W, y: r.y, width: SWITCHER_ARROW_W, height: r.height },
      spec.next,
      true,
    );
  }

  /** Where it stands. */
  rect(): Rect {
    return { ...this.at };
  }

  destroy(): void {
    this.parts.forEach((part) => part.destroy());
    this.parts.length = 0;
  }
}
