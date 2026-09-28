/**
 * A baked character shown in a menu (FS-2325V §F): the class's own sheet, the one that walks in
 * the run, idle on a lit plinth and slowly turning; its attack plays once when it is picked.
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
import { CharacterAnimator } from "./character";
import type { ArtLibrary } from "./library";
import { MANIFEST_KEY, preloadArt } from "./phaser";
import { TURNTABLE_STEP_MS, Turntable } from "./turntable";

/** A menu never shows a baked frame smaller than it was baked, or upscaled past 1.5x (§F.3). */
export const MIN_MENU_SCALE = 1;
export const MAX_MENU_SCALE = 1.5;

/** Headroom kept above the crown in a portrait, so the top of the head is not clipped flat. */
const PORTRAIT_HEADROOM = 4;
/** Plinth width per 1x of figure scale: a little wider than a delver's stance. */
const PLINTH_WIDTH = 104;

/**
 * Queues the art on a menu scene's loader unless an earlier scene already loaded it. Call from
 * `preload()` of any scene that may be the first to show a figure; then `registerArt` in
 * `create()`. Guarded so re-entering a scene queues nothing and leaves no stale listener.
 */
export function preloadMenuArt(scene: Phaser.Scene): void {
  if (!scene.cache.json.exists(MANIFEST_KEY)) preloadArt(scene);
}

export interface MenuFigureOptions {
  /** Of the baked frame, clamped to {@link MIN_MENU_SCALE}..{@link MAX_MENU_SCALE}. Default 1. */
  scale?: number;
  /** Turn through the 8 facings while idle. Default true; a portrait never turns. */
  turn?: boolean;
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
  private readonly turntable: Turntable;
  private readonly scale: number;
  private animator: CharacterAnimator;
  private destroyed = false;

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
    this.turntable = new Turntable(
      scene.time.now,
      portrait || options.turn === false ? 0 : TURNTABLE_STEP_MS,
    );

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

  /** Plays the attack once from the start, facing where the turn had reached. */
  flourish(): void {
    if (this.destroyed || !this.animator.baked) return;
    const now = this.scene.time.now;
    this.turntable.flourish(now, this.attackMs());
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
    this.animator.show(this.sprite, this.turntable.pose(this.scene.time.now));
  };

  /** Puts the current sheet on the sprite, cropped to a portrait if this is one. */
  private dress(): void {
    this.animator.dress(this.sprite);
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
    const anchorX = Math.round(sheet.anchor.x * sheet.frameWidth);
    const anchorY = Math.round(sheet.anchor.y * sheet.frameHeight);
    const above = Math.min(
      anchorY,
      (sheet.crown ?? anchorY) + PORTRAIT_HEADROOM,
    );
    this.sprite.setCrop(
      anchorX - Math.round(portrait.width / 2),
      anchorY - above,
      portrait.width,
      portrait.height,
    );
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
   * A round stone plinth, seen from the isometric camera (2:1), lit by a torch pool from above
   * and edged in brass. The figure's own baked shadow falls on its top face.
   */
  private plinth(): Phaser.GameObjects.Graphics {
    const w = PLINTH_WIDTH * this.scale;
    const h = w / 2;
    const depth = 10 * this.scale;
    const g = this.scene.add.graphics();

    // The drum: shadowed side, then the lit top face, a warm lift toward the key light.
    g.fillStyle(shade(palette.wall, 0.45), 1);
    g.fillEllipse(0, depth, w, h);
    g.fillRect(-w / 2, 0, w, depth);
    g.fillStyle(palette.wall, 1);
    g.fillEllipse(0, 0, w, h);
    g.fillStyle(tint(palette.wall, 0.12), 0.9);
    g.fillEllipse(-w * 0.06, -h * 0.05, w * 0.82, h * 0.78);
    g.fillStyle(palette.torch, 0.08);
    g.fillEllipse(-w * 0.1, -h * 0.08, w * 0.55, h * 0.5);
    // 1px brass rims: the top edge, and the foot of the drum.
    g.lineStyle(1, palette.frame, 0.7);
    g.strokeEllipse(0, 0, w, h);
    g.lineStyle(1, palette.frame, 0.25);
    g.strokeEllipse(0, depth, w, h);
    return g;
  }
}
