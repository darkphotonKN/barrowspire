/**
 * Menu chrome for the canvas menus (FS-2325V §F.4; design-guideline "UI Chrome"): carved-stone
 * and dark-vellum panels with 1px brass borders, beveled stone buttons with a brass hover glow,
 * and a charcoal backdrop with drifting dust and ember motes. Smooth fills and soft edges, to sit
 * with the linearly filtered baked art; no pixel-grid frames, scanlines or masonry grids.
 *
 * Colour comes only from the canvas palette (ADR-0013). Amber stays the canvas's *interactable*
 * channel: a primary button is amber because it can be pressed.
 */

import type Phaser from "phaser";
import { palette, rgba, shade, tint } from "@/utils/canvasPalette";

const PANEL_RADIUS = 6;

const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const BUTTON_RADIUS = 4;

export interface PanelStyle {
  /** A hovered, selected or nested panel sits a shade lighter, with a stronger brass edge. */
  raised?: boolean;
  alpha?: number;
}

/** A carved-stone panel: stone fill, a lit top bevel, a shadowed foot, a 1px brass border. */
export function drawPanel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  style: PanelStyle = {},
): void {
  const alpha = style.alpha ?? 0.92;
  const face = style.raised ? tint(palette.hudPanel, 0.06) : palette.hudPanel;
  g.fillStyle(shade(face, 0.3), alpha);
  g.fillRoundedRect(x, y, w, h, PANEL_RADIUS);
  g.fillStyle(face, alpha);
  g.fillRoundedRect(x + 1, y + 1, w - 2, h - 3, PANEL_RADIUS - 1);
  // Bevel: light catches the top edge; the foot falls into shadow.
  g.lineStyle(1, tint(face, 0.18), 0.5);
  g.lineBetween(x + PANEL_RADIUS, y + 1.5, x + w - PANEL_RADIUS, y + 1.5);
  g.lineStyle(1, shade(face, 0.5), 0.6);
  g.lineBetween(
    x + PANEL_RADIUS,
    y + h - 1.5,
    x + w - PANEL_RADIUS,
    y + h - 1.5,
  );
  g.lineStyle(1, palette.frame, style.raised ? 0.75 : 0.45);
  g.strokeRoundedRect(x + 0.5, y + 0.5, w - 1, h - 1, PANEL_RADIUS);
}

/** A thin brass rule, for dividers under headings. */
export function drawRule(
  g: Phaser.GameObjects.Graphics,
  x1: number,
  x2: number,
  y: number,
  alpha = 0.45,
): void {
  g.lineStyle(1, palette.frame, alpha);
  g.lineBetween(x1, y + 0.5, x2, y + 0.5);
}

/** What a button does: amber can be pressed, green backs out, stone is everything else. */
export type ButtonTone = "primary" | "secondary" | "cancel";
export type ButtonState = "idle" | "hover" | "disabled";

/** The text colour that goes with a button's tone and state. */
export function buttonTextColor(tone: ButtonTone, state: ButtonState): number {
  if (state === "disabled") return palette.hudFaint;
  if (tone === "primary")
    return state === "hover"
      ? palette.interactableBright
      : palette.interactable;
  if (tone === "cancel")
    return state === "hover" ? tint(palette.safe, 0.25) : palette.safe;
  return state === "hover" ? palette.hudText : palette.hudLabel;
}

/** A beveled stone button; hover lifts the face and lights a soft brass glow round it. */
export function drawButton(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  tone: ButtonTone,
  state: ButtonState = "idle",
): void {
  g.clear();
  const hover = state === "hover";
  const disabled = state === "disabled";

  if (hover) {
    g.fillStyle(palette.frameBright, 0.08);
    g.fillRoundedRect(x - 5, y - 5, w + 10, h + 10, BUTTON_RADIUS + 4);
    g.fillStyle(palette.frameBright, 0.1);
    g.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, BUTTON_RADIUS + 2);
  }

  const face = hover ? tint(palette.hudPanel, 0.08) : palette.hudPanel;
  g.fillStyle(shade(face, 0.45), disabled ? 0.6 : 0.95);
  g.fillRoundedRect(x, y, w, h, BUTTON_RADIUS);
  g.fillStyle(face, disabled ? 0.6 : 0.95);
  g.fillRoundedRect(x + 1, y + 1, w - 2, h - 3, BUTTON_RADIUS);
  // The upper half catches the light: a raised, carved face.
  g.fillStyle(tint(face, 0.1), disabled ? 0.2 : 0.45);
  g.fillRoundedRect(x + 2, y + 2, w - 4, (h - 4) / 2, {
    tl: BUTTON_RADIUS - 1,
    tr: BUTTON_RADIUS - 1,
    bl: 0,
    br: 0,
  });

  const edge = disabled
    ? palette.hudFaint
    : tone === "primary"
      ? palette.interactable
      : tone === "cancel"
        ? palette.safe
        : palette.frame;
  g.lineStyle(
    1,
    hover ? tint(edge, 0.2) : edge,
    disabled ? 0.3 : hover ? 0.95 : 0.7,
  );
  g.strokeRoundedRect(x + 0.5, y + 0.5, w - 1, h - 1, BUTTON_RADIUS);
}

/**
 * The menu backdrop: the charcoal base with drifting dust and a few embers, drawn as soft motes
 * rather than square pixels. Returns the graphics so a scene can layer it.
 */
export function drawBackdrop(
  scene: Phaser.Scene,
  motes = 110,
): Phaser.GameObjects.Graphics {
  const { width, height } = scene.cameras.main;
  scene.cameras.main.setBackgroundColor(palette.ink);
  const g = scene.add.graphics();
  for (let i = 0; i < motes; i++) {
    const x = between(0, width);
    const y = between(0, height);
    const ember = Math.random() < 0.12;
    g.fillStyle(
      ember
        ? palette.ember
        : Math.random() < 0.5
          ? palette.hudLabel
          : palette.wallTop,
      ember ? between(0.25, 0.5) : between(0.05, 0.18),
    );
    g.fillCircle(x, y, ember ? between(0.9, 1.5) : between(0.5, 1));
  }
  return g;
}

const TORCH_POOL_TEXTURE = "menu:torch-pool";
const TORCH_POOL_SIZE = 256;

/**
 * A warm pool of torchlight on the dark: a smooth radial falloff (drawn once into a canvas
 * texture, so it has no banding), stretched to `w` x `h`. Used behind a menu's hero and roster
 * portraits so a figure stands in the one lit place in the room.
 */
export function addTorchPool(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha = 1,
): Phaser.GameObjects.Image {
  if (!scene.textures.exists(TORCH_POOL_TEXTURE)) {
    const texture = scene.textures.createCanvas(
      TORCH_POOL_TEXTURE,
      TORCH_POOL_SIZE,
      TORCH_POOL_SIZE,
    );
    const ctx = texture?.getContext();
    if (texture && ctx) {
      const r = TORCH_POOL_SIZE / 2;
      const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
      gradient.addColorStop(0, rgba(palette.torch, 0.34));
      gradient.addColorStop(0.35, rgba(palette.torch, 0.17));
      gradient.addColorStop(0.7, rgba(palette.ember, 0.05));
      gradient.addColorStop(1, rgba(palette.ember, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, TORCH_POOL_SIZE, TORCH_POOL_SIZE);
      texture.refresh();
    }
  }
  return scene.add
    .image(x, y, TORCH_POOL_TEXTURE)
    .setDisplaySize(w, h)
    .setAlpha(alpha);
}

const sharpened = new WeakSet<object>();

/**
 * Rasterises every text object the scene creates at the display's pixel ratio. The canvas is
 * 1080x720 but a Retina screen draws it at 2x, and text rasterised at 1x is then upscaled by the
 * linear filter into a blur. Call once at the top of `create()`.
 */
export function sharpenText(scene: Phaser.Scene): void {
  const add = scene.add;
  // The factory outlives a scene restart; wrap it once, not once per visit.
  if (sharpened.has(add)) return;
  sharpened.add(add);
  const original = add.text.bind(add);
  add.text = ((
    x: number,
    y: number,
    text: string | string[],
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ) =>
    original(x, y, text, style).setResolution(
      window.devicePixelRatio || 1,
    )) as typeof add.text;
}
