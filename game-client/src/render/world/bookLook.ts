/**
 * What a class book's look is made of (FS-X2CMM §I R47): the shapes the book's world effects (a
 * witchlight, a rune, a draught) and its delver states (afloat, hardened, long night, tracker's eye, the
 * draught's heal) are painted with, and the clock they are painted at. Each look lives in its own file in
 * `src/render/effects/`, so the owner can swap one without touching the sets that place them
 * (`bookEffects.ts`, `bookStates.ts`).
 *
 * A look paints one frame about its origin, the effect's or the body's feet on screen, and is repainted
 * every frame: its motion is a pure function of the clock, so every viewer's look moves alike and a test
 * reads it without a canvas. Tokens only (ADR-0013); no easing past Sine, Quad and Cubic (FS-KYPQ9 §B.3).
 *
 * Pure: no Phaser.
 */

import { worldToScreen } from "@/render/iso/projection";

/** The slice of Phaser's Graphics a look paints with. */
export interface LookBrush {
  clear(): unknown;
  fillStyle(color: number, alpha?: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  fillCircle(x: number, y: number, radius: number): unknown;
  fillEllipse(x: number, y: number, width: number, height: number): unknown;
  strokeEllipse(x: number, y: number, width: number, height: number): unknown;
  fillRect(x: number, y: number, width: number, height: number): unknown;
  lineBetween(x1: number, y1: number, x2: number, y2: number): unknown;
}

/** A painted layer as the sets move it: a brush that stands somewhere, sorts, hides and goes. */
export interface LookMark extends LookBrush {
  setPosition(x: number, y: number): unknown;
  setDepth(depth: number): unknown;
  setVisible(visible: boolean): unknown;
  destroy(): void;
}

/**
 * Where a layer sorts: `ground` lies on the floor under everything that stands; `body` sorts with what
 * stands at its point, under the light-map, so the dark dims it; `halo` is additive just above the
 * light-map, as a flame's halo is, so a light reads as the source of its own pool (guideline "Lighting").
 */
export type LayerKind = "ground" | "body" | "halo";

/** The clock a look is painted at. */
export interface LookClock {
  /** Ms since the effect or state was first seen. */
  ageMs: number;
  /** Its seconds left, as the latest state said. */
  remaining: number;
  /** 0..1, from its id: its own phase, so two never move together. */
  seed: number;
  /** Ms since it last flashed (a rune's catch); Infinity when it never has. */
  sinceFlashMs: number;
  /** The viewer asked for less motion: still, at rest, no bob, drift or pulse. */
  reduced: boolean;
}

/** A painter for one layer of a look, at one frame. */
export type LayerPainter = (g: LookBrush, clock: LookClock) => void;

/** A look's light pool on the light-map, in screen px about its origin. */
export interface LookLight {
  radius: number;
  color: number;
  intensity: number;
  flicker: number;
  /** Where its pool stands this frame, about the origin, and how strongly (0..1 of `intensity`). */
  at(clock: LookClock): { dx: number; dy: number; strength: number };
}

/** A world effect's look: its layers, and the light it casts if any. */
export interface EffectLook {
  layers: Partial<Record<LayerKind, LayerPainter>>;
  light?: LookLight;
}

/**
 * The on-screen ellipse of a circle of `radius` world px lying on the floor (the iso projection squashes it
 * to twice as wide as tall): its full width and height, ready for `fillEllipse`/`strokeEllipse`.
 */
export function groundEllipse(radius: number): { width: number; height: number } {
  const r = radius / Math.SQRT2;
  const across = worldToScreen(r, -r);
  const down = worldToScreen(r, r);
  return { width: 2 * Math.hypot(across.x, across.y), height: 2 * Math.hypot(down.x, down.y) };
}

/** 0..1 from a string, the same on every client: an id's own phase. */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

/** A slow wave, -1..1, on its own period and phase; 0 under reduced motion. */
export function wave(clock: LookClock, periodMs: number, phase = 0): number {
  if (clock.reduced) return 0;
  return Math.sin(((clock.ageMs / periodMs + clock.seed + phase) % 1) * 2 * Math.PI);
}

/**
 * How far in a look is, 0..1: it fades in over `inMs` from its first sight and out over its last
 * `outSeconds`, so nothing pops on or off with the state.
 */
export function presence(clock: LookClock, inMs: number, outSeconds: number): number {
  const into = inMs > 0 ? Math.min(1, clock.ageMs / inMs) : 1;
  const left = outSeconds > 0 ? Math.min(1, Math.max(0, clock.remaining / outSeconds)) : 1;
  return Math.min(into, left);
}

/** A delver state's clock: the look's, and the body's height from its feet to its head, screen px. */
export interface BodyClock extends LookClock {
  crown: number;
}

/**
 * Where a state's layer sorts on its body: `ground` on the floor at its feet, under everything that
 * stands; `front` just in front of the body, under the light-map, so it sorts with it and the dark dims it.
 */
export type BodyLayerKind = "ground" | "front";

/** A delver state's look: its layers about the body's feet, and how far it lifts the body, if at all. */
export interface StateLook {
  layers: Partial<Record<BodyLayerKind, (g: LookBrush, clock: BodyClock) => void>>;
  /** Screen px the body is drawn raised this frame (afloat); absent for a state that lifts nothing. */
  lift?(clock: BodyClock): number;
}
