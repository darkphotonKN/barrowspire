/**
 * The spectate switcher, "◄ Watching <name> ►" (FS-QPDKN § Change: The party death flow and the spectate
 * switcher, R159–R162; the owner, 「切換箭頭就放在上方一些」): over the spectate row, in the run's world (ADR-0083
 * 2.3), in the HUD band.
 *
 * Bare, at the owner's word (「樣式可以不用加底色 直接顯示黃色名字 箭頭也不用匡跟底色」, 2026-11-14): no backing,
 * the words in the watched name's bright brass (`palette.watchedName`), and each arrow only the options slider's
 * triangle drawn in code (the canvas body face has no ◄ or ►), with no outline or fill round it. An arrow is a
 * control, so its triangle is the interactable amber, brightening to `interactableBright` under the pointer as
 * the corner icons do; greyed while there is nobody else to switch to, faint as a greyed HUD button. Each takes
 * its press on an invisible zone the size the framed arrow had, its sounds by `hudButtonSounds` (a hover
 * `menu_hover`, a release `menu_click`, a greyed one's release `menu_error`), and no cursor of its own.
 */

import type Phaser from "phaser";
import type { UiEffect } from "@/audio/uiSounds";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import type { Rect } from "./hudCornerLayout";
import { hudButtonSounds } from "./PartyPanel";
import { SWITCHER_ARROW_W } from "./resolvedRow";

/** The HUD band, with the run's row (R158); the words and the arrows' zones one over it, as the row's. */
const SWITCHER_DEPTH = 1000;
/** The options slider's arrow mark (FS-28DDG § Change C5): a triangle 8 wide and 12 high. */
const ARROW_MARK_W = 8;
const ARROW_MARK_H = 12;
/** A greyed arrow's mark, as faint as a greyed HUD button's words (`drawHudButton`). */
const GREYED_ALPHA = 0.45;

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
    const label = scene.add
      .text(0, 0, watchingWords(spec.name), {
        fontFamily: CANVAS_FONT.body,
        fontSize: "14px",
        color: toCss(palette.watchedName),
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0);
    const r = spec.place(label.width);
    this.at = r;
    // over the arrows' marks: at one depth Phaser renders in the order made (DisplayList.depthSort is a stable
    // sort), so the words stand a depth over anything drawn round them
    label.setPosition(r.x + r.width / 2, r.y + r.height / 2).setDepth(SWITCHER_DEPTH + 1);
    this.parts.push(label);

    const feedback = hudButtonSounds(spec.play);
    const arrow = (name: string, box: Rect, press: () => void, pointsRight: boolean) => {
      const mark = scene.add.graphics().setScrollFactor(0).setDepth(SWITCHER_DEPTH);
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const tip = pointsRight ? cx + ARROW_MARK_W / 2 : cx - ARROW_MARK_W / 2;
      const base = pointsRight ? cx - ARROW_MARK_W / 2 : cx + ARROW_MARK_W / 2;
      const draw = (colour: number, alpha: number) => {
        mark.clear();
        mark.fillStyle(colour, alpha);
        mark.fillTriangle(tip, cy, base, cy - ARROW_MARK_H / 2, base, cy + ARROW_MARK_H / 2);
      };
      // its press on a zone the size the framed arrow had; no cursor of its own, so the bone hand stays
      const hit = scene.add
        .zone(cx, cy, box.width, box.height)
        .setScrollFactor(0)
        .setDepth(SWITCHER_DEPTH + 1)
        .setName(name)
        .setInteractive();
      if (spec.canSwitch) {
        draw(palette.interactable, 1);
        hit
          .on("pointerover", () => {
            draw(palette.interactableBright, 1);
            feedback.hovered?.();
          })
          .on("pointerout", () => draw(palette.interactable, 1))
          // on the release, as the HUD buttons answer (FS-R82NV R28)
          .on("pointerup", () => {
            feedback.pressed?.();
            press();
          });
      } else {
        draw(palette.hudFaint, GREYED_ALPHA);
        // greyed, it still takes its press, to say no (FS-WDM0X § Change pass 2 (party), P7)
        hit.on("pointerup", () => feedback.refused?.());
      }
      this.parts.push(mark, hit);
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
