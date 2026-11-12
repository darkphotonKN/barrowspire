/**
 * A baked character shown in a menu (FS-2325V §F): the class's own sheet, the one that walks in
 * the run, idle on a lit plinth and facing the viewer; its attack plays once when it is picked.
 *
 *   const hero = new MenuFigure(this, art, x, feetY, char.className, { scale: 1.5 });
 *   hero.setClass("mage");   // swaps sheet, plays the mage's attack
 *   hero.flourish();          // the attack again, same class
 *
 * The figure drives itself from the scene's update event and stops when it (or a parent
 * container) is destroyed, or the scene shuts down. With no art it stands the library's neutral
 * placeholder on the plinth, and never throws (FS-2325V "Edge States").
 *
 * The class → sheet rule and the clip playback are the run's own (`characterSheet`,
 * `CharacterAnimator`), so what a menu shows cannot drift from what walks.
 */

import type Phaser from "phaser";
import { palette, shade, tint } from "@/utils/canvasPalette";
import { addTorchPool } from "@/ui/menuChrome";
import type { Facing8 } from "@/render/iso/facing";
import type { AnimationChoice } from "./animationSelect";
import { CharacterAnimator } from "./character";
import type { ArtLibrary } from "./library";
import { directionIndex, screenStep, sheetScale } from "./manifest";

/**
 * In screen px: a menu never draws a figure smaller than the game does (1 screen px per 1x px),
 * nor past 1.5x that (§F.3). A 2x sheet's frame at 1 is drawn at half its baked px (FS-HF0WW).
 */
export const MIN_MENU_SCALE = 1;
export const MAX_MENU_SCALE = 1.5;

/** A menu figure stands still, looking at the camera: on the 2:1 iso camera that is `se`. */
export const MENU_FACING: Facing8 = "se";

/** Headroom kept above the crown in a portrait, so the top of the head is not clipped flat. */
const PORTRAIT_HEADROOM = 4;
/** Plinth width per 1x of figure scale: a little wider than a player's stance. */
const PLINTH_WIDTH = 104;

export interface MenuFigureOptions {
  /** Of the baked frame, clamped to {@link MIN_MENU_SCALE}..{@link MAX_MENU_SCALE}. Default 1. */
  scale?: number;
  /**
   * A head-and-shoulders crop, for roster cards too small for the whole figure, at 1x and
   * without a plinth. The figure's (x, y) is then the top centre of this window.
   */
  portrait?: { width: number; height: number };
}

export class MenuFigure {
  /** Holds the plinth and the figure; its position is where the feet stand. */
  readonly container: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly scale: number;
  /** When the attack picked last finishes; the figure idles from then on. */
  private attackEnds = -Infinity;
  private animator: CharacterAnimator;
  private destroyed = false;
  /**
   * A trimmed sheet's portrait window, set again after every frame change. Phaser (3.90 and
   * 4.2.1 alike) crops a trimmed frame by overwriting the crop with its overlap with that frame's
   * cut (`Frame.setCropUVs`), and crops the next frame of the animation from that overlap
   * (`TextureCrop.setFrame` → `updateCropUVs`), so the window would shrink as the clip plays.
   */
  private trimmedCrop?: [x: number, y: number, width: number, height: number];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: ArtLibrary,
    x: number,
    y: number,
    playerClass: string | undefined,
    private readonly options: MenuFigureOptions = {},
  ) {
    const portrait = options.portrait !== undefined;
    this.scale = portrait
      ? MIN_MENU_SCALE
      : Math.min(MAX_MENU_SCALE, Math.max(MIN_MENU_SCALE, options.scale ?? 1));

    this.container = scene.add.container(x, y);
    if (!portrait) {
      const pool = PLINTH_WIDTH * this.scale * 2.4;
      this.container.add([
        addTorchPool(scene, 0, 0, pool, pool * 0.55),
        this.plinth(),
      ]);
    }

    this.animator = new CharacterAnimator(art, playerClass);
    this.sprite = scene.add.sprite(0, 0, "").setScale(this.scale);
    this.container.add(this.sprite);
    this.dress();

    scene.events.on("update", this.tick);
    scene.events.once("shutdown", this.destroy);
    this.container.once("destroy", this.detach);
  }

  /** False when the sheet is missing: the plinth holds a neutral placeholder. */
  get baked(): boolean {
    return this.animator.baked;
  }

  /** Shows another class's sheet and plays its attack once, as a pick does. */
  setClass(playerClass: string | undefined, flourish = true): void {
    if (this.destroyed) return;
    this.animator = new CharacterAnimator(this.art, playerClass);
    this.sprite.anims?.stop?.();
    this.dress();
    if (flourish) this.flourish();
  }

  /** Plays the attack once from the start, still facing the viewer. Picking again restarts it. */
  flourish(): void {
    if (this.destroyed || !this.animator.baked) return;
    const now = this.scene.time.now;
    const durationMs = this.attackMs();
    if (durationMs > 0) this.attackEnds = now + durationMs;
    this.animator.attack(now);
  }

  readonly destroy = (): void => {
    if (this.destroyed) return;
    this.detach();
    this.container.destroy();
  };

  private readonly detach = (): void => {
    this.destroyed = true;
    this.scene.events.off("update", this.tick);
    this.scene.events.off("shutdown", this.destroy);
  };

  private readonly tick = (): void => {
    if (this.destroyed || !this.animator.baked) return;
    this.animator.show(this.sprite, this.pose(this.scene.time.now));
    // after the clip has stepped this frame (the scene's sprites update first), before drawing
    if (this.trimmedCrop) this.sprite.setCrop(...this.trimmedCrop);
  };

  private pose(now: number): AnimationChoice {
    return {
      animation: now < this.attackEnds ? "attack" : "idle",
      facing: MENU_FACING,
      direction: directionIndex(MENU_FACING),
      timeScale: 1,
    };
  }

  /**
   * Puts the current sheet on the sprite at the figure's scale (a 2x sheet drawn at half that,
   * `CharacterAnimator.dress`), cropped to a portrait if this is one.
   */
  private dress(): void {
    this.animator.dress(this.sprite, this.scale);
    this.trimmedCrop = undefined;
    const portrait = this.options.portrait;
    if (!portrait) return;

    const sheet = this.animator.baked
      ? this.art.sheet(this.animator.sheet)
      : undefined;
    if (!sheet) {
      // The placeholder is small enough to stand whole in the window, feet on its bottom edge.
      this.sprite.setCrop();
      this.sprite.setPosition(0, portrait.height);
      return;
    }
    // The window and the head are screen px; the crop is in the frame's own px, `k` of them to
    // a screen px (FS-HF0WW). At 1.5 a screen px is a whole frame px only on even screen px
    // (ADR-0076), so the window's left and top edges step out to that grid and its size up to it:
    // the crop is whole frame px, never a half px that would sample between texels.
    const k = sheetScale(sheet);
    const step = screenStep(sheet);
    const down = (v: number) => Math.floor(v / step) * step;
    const up = (v: number) => Math.ceil(v / step) * step;
    const anchorX = Math.round((sheet.anchor.x * sheet.frameWidth) / k);
    const anchorY = Math.round((sheet.anchor.y * sheet.frameHeight) / k);
    const above =
      anchorY -
      down(
        anchorY -
          Math.min(anchorY, (sheet.crown ?? anchorY) + PORTRAIT_HEADROOM),
      );
    const crop: [number, number, number, number] = [
      down(anchorX - Math.round(portrait.width / 2)) * k,
      (anchorY - above) * k,
      up(portrait.width) * k,
      up(portrait.height) * k,
    ];
    this.sprite.setCrop(...crop);
    if (sheet.trimmed) this.trimmedCrop = crop;
    this.sprite.setPosition(0, above);
  }

  /** The sheet's attack clip length; 0 when there is none to play. */
  private attackMs(): number {
    const attack = this.art.sheet(this.animator.sheet)?.animations.attack;
    return attack && attack.fps > 0
      ? (attack.frames[0].length / attack.fps) * 1000
      : 0;
  }

  /**
   * A round stone plinth, seen from the isometric camera (2:1), lit by a pool of bone light from
   * above and edged in iron, the menus' Bone & Soot (design-guideline "UI Chrome"). The figure's
   * own baked shadow falls on its top face.
   */
  private plinth(): Phaser.GameObjects.Graphics {
    const w = PLINTH_WIDTH * this.scale;
    const h = w / 2;
    const depth = 10 * this.scale;
    const g = this.scene.add.graphics();

    // The drum: shadowed side, then the lit top face, a bone lift toward the key light.
    g.fillStyle(shade(palette.wall, 0.45), 1);
    g.fillEllipse(0, depth, w, h);
    g.fillRect(-w / 2, 0, w, depth);
    g.fillStyle(palette.wall, 1);
    g.fillEllipse(0, 0, w, h);
    g.fillStyle(tint(palette.wall, 0.12), 0.9);
    g.fillEllipse(-w * 0.06, -h * 0.05, w * 0.82, h * 0.78);
    g.fillStyle(palette.menu.torch, 0.08);
    g.fillEllipse(-w * 0.1, -h * 0.08, w * 0.55, h * 0.5);
    // 1px iron rims: the top edge, and the foot of the drum.
    g.lineStyle(1, palette.menu.frameBright, 0.7);
    g.strokeEllipse(0, 0, w, h);
    g.lineStyle(1, palette.menu.frame, 0.4);
    g.strokeEllipse(0, depth, w, h);
    return g;
  }
}
