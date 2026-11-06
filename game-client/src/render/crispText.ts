/**
 * Crisp canvas text on high-density screens (asked 2026-10-31: "the whole game's text reads soft").
 *
 * Phaser rasterises a Text object at resolution 1 unless its style says otherwise, and has no
 * game-wide default (a style resolution of 0 is forced to 1). Drawn through a camera zoomed by
 * the render scale, a label rasterised at 1 is scaled up. Rather than touch a hundred `add.text`
 * calls, the text factory is replaced once at boot with one that fills in the render scale
 * (FS-ZAJMH R5: the backing store's px per logical unit, not the bare device ratio) for any style
 * that does not set its own, read as each text is made. Text made before a render-scale change is
 * rasterised again at the new one by the game's re-fit (`fitGame` and `crispen` in
 * `src/render/viewport`). Baked art is untouched: it is rendered at 2x already (FS-2325V) and
 * scaled by the renderer.
 */

import * as Phaser from "phaser";
import { viewport } from "@/render/viewport/viewport";

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

/** The style with `ratio` as its resolution, unless it brought one. */
export function withCrispResolution(
  style: TextStyle | undefined,
  ratio: number,
): TextStyle {
  if (style?.resolution) return style;
  return { ...style, resolution: ratio };
}

/**
 * Replaces `scene.add.text` for every scene with one that rasterises at `ratio()`, read as each
 * text is made: the render scale by default. Phaser ignores a second registration of a factory,
 * so the stock one is removed first. Call once, before the game is made; calling again is
 * harmless.
 */
export function installCrispText(
  ratio: () => number = () => viewport.renderScale,
): void {
  const Factory = Phaser.GameObjects.GameObjectFactory;
  Factory.remove("text");
  Factory.register(
    "text",
    function (
      this: Phaser.GameObjects.GameObjectFactory,
      x: number,
      y: number,
      text: string | string[],
      style?: TextStyle,
    ) {
      return this.displayList.add(
        new Phaser.GameObjects.Text(
          this.scene,
          x,
          y,
          text,
          withCrispResolution(style, ratio()),
        ),
      );
    },
  );
}
