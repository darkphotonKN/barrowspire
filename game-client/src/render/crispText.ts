/**
 * Crisp canvas text on high-density screens (asked 2026-10-31: "the whole game's text reads soft").
 *
 * Phaser rasterises a Text object at resolution 1 unless its style says otherwise, and has no
 * game-wide default (a style resolution of 0 is forced to 1). On a 2x screen every label is
 * drawn at half the device's pixels and scaled up. Rather than touch a hundred `add.text` calls,
 * the text factory is replaced once at boot with one that fills in the device's ratio for any
 * style that does not set its own. Baked art is untouched: it is rendered at 2x already
 * (FS-2325V) and scaled by the renderer.
 */

import * as Phaser from "phaser";

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

/** The style with the device's ratio as its resolution, unless it brought one. */
export function withCrispResolution(
  style: TextStyle | undefined,
  ratio: number,
): TextStyle {
  if (style?.resolution) return style;
  return { ...style, resolution: ratio };
}

/** The device's pixel ratio, 1 where there is no window (tests, the server render). */
export function deviceRatio(): number {
  return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
}

/**
 * Replaces `scene.add.text` for every scene with one that rasterises at `ratio`. Phaser ignores a
 * second registration of a factory, so the stock one is removed first. Call once, before the game
 * is made; calling again is harmless.
 */
export function installCrispText(ratio = deviceRatio()): void {
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
          withCrispResolution(style, ratio),
        ),
      );
    },
  );
}
