/**
 * The icon treatment of a Runed or Fabled item (FS-QE2QW §B, §E): one module, so the views that
 * draw item icons differ only in where they place what it makes.
 *
 *   const shine = itemShine(scene, art, view, { x, y, side }); // undefined: no treatment
 *   // the glow goes under the icon: first in a container, or made before it at one depth
 *   const glints = shine?.bind(icon);                           // once the icon is drawn
 *   // the glints, if any, go over the icon: after it in a container, or made after it at one depth
 *
 * Bound, the glow takes the icon's position, alpha and scale every frame, and the glints its
 * position and alpha, so a faint icon's glow is faint and a view's own tweens carry them with no
 * change to those tweens. It ends with its icon, or with the scene; no caller stops one by hand.
 * `postupdate`, as tweens run on `update`.
 *
 * The baked `fx_glow` (ADR-0020), tinted the rarity colour (ADR-0013). A Fabled icon also glitters
 * (`render/effects/glitter.ts`), unless it is faint when bound or the player asked for less motion
 * (R19, R21). A missing fx sheet costs the glow and the glints and never the icon, logged once for
 * the page (R27). The numbers are `TOP_TIERS`'.
 */

import type Phaser from "phaser";
import type { ItemView } from "@/items/itemView";
import { startGlitter } from "@/render/effects/glitter";
import { prefersReducedMotion } from "@/render/effects/mist";
import type { FxArt } from "@/render/effects/runtime";
import { onSceneEnd } from "@/scenes/sceneEnd";
import { topTier, type TopTier } from "./itemTip";

/** Every sheet the treatment draws from: without any one of them it draws nothing (R27). */
const FX_SHEETS = ["fx_glow", "fx_glint", "fx_mote"] as const;

let warned = false;

function sheetsPresent(art: FxArt): boolean {
  const missing = FX_SHEETS.filter((sheet) => !art.has(sheet));
  if (missing.length === 0) return true;
  if (!warned) {
    warned = true;
    console.warn(
      `item shine: ${missing.map((s) => `"${s}"`).join(", ")} missing; icons draw without it`,
      { sheets: missing },
    );
  }
  return false;
}

/** What a view says about the icon: its centre, and the side it is drawn at. */
export interface ShinePlace {
  x: number;
  y: number;
  side: number;
}

export interface ItemShine {
  /** The caller puts it under the icon. It is destroyed with the icon. */
  glow: Phaser.GameObjects.Image;
  /**
   * Ties the treatment to the icon, once the icon has its scale and its alpha. Call it once.
   * Returns the layer of glints for the caller to put over the icon, or undefined if it has none.
   * The layer is destroyed with the icon.
   */
  bind(
    icon: Phaser.GameObjects.Sprite,
  ): Phaser.GameObjects.Container | undefined;
}

/** A Runed or Fabled item's treatment; undefined below Runed, or with an fx sheet missing. */
export function itemShine(
  scene: Phaser.Scene,
  art: FxArt,
  view: Pick<ItemView, "rarity">,
  { x, y, side }: ShinePlace,
): ItemShine | undefined {
  const top = topTier(view);
  if (!top || !sheetsPresent(art)) return undefined;

  const frame = art.resolve("fx_glow");
  const glow = (
    frame.placeholder
      ? scene.add.image(x, y, frame.texture)
      : scene.add.image(x, y, frame.texture, frame.frame)
  )
    .setOrigin(frame.anchor.x, frame.anchor.y)
    .setTint(top.color)
    .setBlendMode("ADD")
    .setAlpha(top.glowAlpha);
  glow.setScale((side * top.glowSide) / Math.max(glow.width, glow.height));

  return {
    glow,
    bind(icon) {
      const ratio = glow.scaleX / icon.scaleX;
      const glints =
        top.glitters && icon.alpha >= 1 && !prefersReducedMotion()
          ? scene.add.container(icon.x, icon.y)
          : undefined;
      const stopGlitter =
        glints &&
        startGlitter(scene, art, glints, {
          side,
          shown: () => icon.alpha >= 1,
        });
      const follow = () => {
        glow.setPosition(icon.x, icon.y);
        glow.setAlpha(icon.alpha * top.glowAlpha);
        glow.setScale(icon.scaleX * ratio);
        glints?.setPosition(icon.x, icon.y).setAlpha(icon.alpha);
      };
      const end = () => {
        cancelSceneEnd();
        icon.off("destroy", end);
        scene.events.off("postupdate", follow);
        stopGlitter?.();
        glints?.destroy();
        glow.destroy();
      };
      const cancelSceneEnd = onSceneEnd(scene, end);
      icon.once("destroy", end);
      scene.events.on("postupdate", follow);
      follow();
      return glints;
    },
  };
}

/** The box of a well, in the view's own px. */
export interface WellBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A top-tier well's outline (R9), in place of its hairline, inset by half its width so the whole
 * stroke lies inside the well. `alpha` is the view's own dimming of its edge (R20).
 */
export function strokeWellOutline(
  g: Phaser.GameObjects.Graphics,
  { x, y, w, h }: WellBox,
  radius: number,
  { outline, outlineAlpha, color }: TopTier,
  alpha = 1,
): void {
  const inset = outline / 2;
  g.lineStyle(outline, color, outlineAlpha * alpha);
  g.strokeRoundedRect(
    x + inset,
    y + inset,
    w - outline,
    h - outline,
    radius - inset,
  );
}
