/**
 * Menu chrome for the canvas menus (FS-2325V §F.4; design-guideline "UI Chrome"): the web UI's
 * Bone & Soot look carried onto the canvas, so the gate into the game matches the site. Grey
 * stone panels with an iron hairline and a carved edge, a bone primary button that is the one
 * torch per view, iron-framed secondary buttons, and a soot backdrop with drifting dust and a
 * vignette. Smooth fills and soft edges, to sit with the linearly filtered baked art; no
 * pixel-grid frames, scanlines or masonry grids.
 *
 * Colour comes only from `palette.menu` (ADR-0013), the game-palette mirror of the site's
 * `:root` tokens (ADR-0025 keeps Phaser off the DOM's UI table). Past the menus, the hub and the
 * run keep the barrow ramp and its amber interactable channel.
 */

import type Phaser from "phaser";
import { mix, palette, rgba } from "@/utils/canvasPalette";

const PANEL_RADIUS = 6;

const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const BUTTON_RADIUS = 4;

const ui = palette.menu;
/** Toward the deepest soot: carved feet, recesses. */
const sink = (color: number, t: number) => mix(color, ui.well, t);
/** Toward bone: the lit top edge of a carved face. */
const lift = (color: number, t: number) => mix(color, ui.torch, t);

export interface PanelStyle {
  /** A hovered, selected or nested panel sits a step lighter, with a stronger iron edge. */
  raised?: boolean;
  alpha?: number;
}

/**
 * A grey-stone panel, the canvas form of the site's card: stone fill, a carved edge (a lit top
 * hairline, a shadowed foot), and a 1px iron border at the site's border alphas.
 */
export function drawPanel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  style: PanelStyle = {},
): void {
  const alpha = style.alpha ?? 0.92;
  const face = style.raised ? ui.panelRaised : ui.panel;
  g.fillStyle(sink(face, 0.5), alpha);
  g.fillRoundedRect(x, y, w, h, PANEL_RADIUS);
  g.fillStyle(face, alpha);
  g.fillRoundedRect(x + 1, y + 1, w - 2, h - 3, PANEL_RADIUS - 1);
  // Carved edge: light catches the top; the foot falls into shadow.
  g.lineStyle(1, lift(face, 0.12), 0.6);
  g.lineBetween(x + PANEL_RADIUS, y + 1.5, x + w - PANEL_RADIUS, y + 1.5);
  g.lineStyle(1, sink(face, 0.6), 0.7);
  g.lineBetween(
    x + PANEL_RADIUS,
    y + h - 1.5,
    x + w - PANEL_RADIUS,
    y + h - 1.5,
  );
  // --color-border is iron at 30%, --color-border-strong at 60%; on canvas the hairline is
  // thinner than a CSS px at 2x, so each sits a step above.
  g.lineStyle(1, ui.frame, style.raised ? 0.85 : 0.6);
  g.strokeRoundedRect(x + 0.5, y + 0.5, w - 1, h - 1, PANEL_RADIUS);
}

/** A thin iron rule, for dividers under headings. */
export function drawRule(
  g: Phaser.GameObjects.Graphics,
  x1: number,
  x2: number,
  y: number,
  alpha = 0.6,
): void {
  g.lineStyle(1, ui.frame, alpha);
  g.lineBetween(x1, y + 0.5, x2, y + 0.5);
}

/**
 * What a button is: primary is the bone CTA (one per view), cancel is ash grey, secondary is the
 * site's iron-framed outline button.
 */
export type ButtonTone = "primary" | "secondary" | "cancel";
export type ButtonState = "idle" | "hover" | "disabled";

/** The text colour that goes with a button's tone and state. Text on bone is always soot. */
export function buttonTextColor(tone: ButtonTone, state: ButtonState): number {
  if (state === "disabled") return ui.faint;
  if (tone === "primary") return ui.ground;
  if (tone === "cancel") return state === "hover" ? ui.text : ui.accent;
  return state === "hover" ? ui.frameBright : ui.label;
}

/**
 * A menu button. Primary is a bone fill with a bright-bone inset hairline and a soft bone glow
 * (the site's `.atmo-cta`); hover brightens it. Secondary and cancel are dark stone with an iron
 * or ash outline; hover lifts the face and strengthens the edge, as the site's outline buttons
 * do. Disabled is dim stone, whatever the tone.
 */
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

  if (tone === "primary" && !disabled) {
    // Soft outer torch glow: many faint bone rings stacked, so the falloff has no visible step.
    for (let spread = 12; spread >= 1; spread--) {
      g.fillStyle(ui.torch, hover ? 0.028 : 0.02);
      g.fillRoundedRect(
        x - spread,
        y - spread,
        w + spread * 2,
        h + spread * 2,
        BUTTON_RADIUS + spread,
      );
    }
    // Flat bone, as the site's CTA is; hover brightens it.
    g.fillStyle(hover ? ui.torchBright : ui.torch, 1);
    g.fillRoundedRect(x, y, w, h, BUTTON_RADIUS);
    g.lineStyle(1, ui.torchBright, 1);
    g.strokeRoundedRect(x + 1.5, y + 1.5, w - 3, h - 3, BUTTON_RADIUS - 1);
    return;
  }

  const face = hover ? lift(ui.panel, 0.05) : ui.panel;
  g.fillStyle(sink(face, 0.5), disabled ? 0.6 : 0.95);
  g.fillRoundedRect(x, y, w, h, BUTTON_RADIUS);
  g.fillStyle(face, disabled ? 0.6 : 0.95);
  g.fillRoundedRect(x + 1, y + 1, w - 2, h - 3, BUTTON_RADIUS);
  g.lineStyle(1, lift(face, 0.1), disabled ? 0.2 : 0.5);
  g.lineBetween(x + BUTTON_RADIUS, y + 1.5, x + w - BUTTON_RADIUS, y + 1.5);

  const edge = disabled
    ? ui.frame
    : tone === "cancel"
      ? ui.accent
      : hover
        ? ui.frameBright
        : ui.frame;
  g.lineStyle(1, edge, disabled ? 0.4 : hover ? 0.95 : 0.75);
  g.strokeRoundedRect(x + 0.5, y + 0.5, w - 1, h - 1, BUTTON_RADIUS);
}

const VIGNETTE_TEXTURE = "menu:vignette";
const VIGNETTE_SIZE = 256;

/**
 * The menu backdrop: the soot ground with drifting dust and a few bone glints, drawn as soft
 * motes rather than square pixels, under a vignette that darkens the edges as the site's does.
 * Returns the mote graphics so a scene can layer it.
 */
export function drawBackdrop(
  scene: Phaser.Scene,
  motes = 110,
): Phaser.GameObjects.Graphics {
  const { width, height } = scene.cameras.main;
  scene.cameras.main.setBackgroundColor(ui.ground);
  const g = scene.add.graphics();
  for (let i = 0; i < motes; i++) {
    const x = between(0, width);
    const y = between(0, height);
    const glint = Math.random() < 0.1;
    g.fillStyle(
      glint ? ui.torch : Math.random() < 0.5 ? ui.label : ui.faint,
      glint ? between(0.2, 0.4) : between(0.05, 0.18),
    );
    g.fillCircle(x, y, glint ? between(0.8, 1.3) : between(0.5, 1));
  }

  if (!scene.textures.exists(VIGNETTE_TEXTURE)) {
    const texture = scene.textures.createCanvas(
      VIGNETTE_TEXTURE,
      VIGNETTE_SIZE,
      VIGNETTE_SIZE,
    );
    const ctx = texture?.getContext();
    if (texture && ctx) {
      const r = VIGNETTE_SIZE / 2;
      const gradient = ctx.createRadialGradient(r, r, r * 0.35, r, r, r * 1.05);
      gradient.addColorStop(0, rgba(ui.well, 0));
      gradient.addColorStop(1, rgba(ui.well, 0.6));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, VIGNETTE_SIZE, VIGNETTE_SIZE);
      texture.refresh();
    }
  }
  scene.add
    .image(width / 2, height / 2, VIGNETTE_TEXTURE)
    .setDisplaySize(width, height);
  return g;
}

const TORCH_POOL_TEXTURE = "menu:torch-pool";
const TORCH_POOL_SIZE = 256;

/**
 * A pool of bone light on the soot: a smooth radial falloff (drawn once into a canvas texture,
 * so it has no banding), stretched to `w` x `h`. The canvas form of the site's hero glow, used
 * behind the main-menu title and under a menu figure's plinth so the figure stands in the one
 * lit place in the room.
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
      gradient.addColorStop(0, rgba(ui.torch, 0.2));
      gradient.addColorStop(0.35, rgba(ui.torch, 0.1));
      gradient.addColorStop(0.7, rgba(ui.torch, 0.03));
      gradient.addColorStop(1, rgba(ui.torch, 0));
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
