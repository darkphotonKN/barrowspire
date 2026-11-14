/**
 * The lore line (FS-XWHZP §A-§C): the world speaking inside the Spire. A quiet line of italic
 * serif high in the centre of the view fades in slowly, holds, and fades out, fine dust rising off
 * it; one at a time, the rest waiting. It belongs to the arrival card's family (FS-PQ2TW) and is
 * quieter: no heading, no rule, no dark.
 *
 * One piece, reusable for any story beat: a scene hands it a line's words and tone and it draws,
 * times, queues and takes lines down. Presentation only (R1): it reads and writes no game state,
 * takes no input, and nothing waits on it.
 */

import type Phaser from "phaser";
import type { LoreArea, LoreTint } from "@/render/effects/loreDust";
import { prefersReducedMotion } from "@/render/effects/mist";
import { crispen, viewport } from "@/render/viewport";
import { onSceneEnd, type EndingScene } from "@/scenes/sceneEnd";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import type { CardView } from "./arrivalCard";

/**
 * A line's tone (R8): `lore` the world speaking (parchment, the default), `dread` danger
 * answered (oxblood, with embers and a tremor), `hope` the way out (lantern gold).
 */
export type LoreTone = "lore" | "dread" | "hope";

/** One line: its words and its tone. */
export interface LoreLine {
  text: string;
  tone: LoreTone;
}

/** The line's place, type, timing, depth and queue (R2-R5, R10, R13); a retune is an edit here. */
export const LORE_LINE = {
  /** The line's centre stands this share of the view's height above its middle: 30% from the top. */
  rise: 0.2,
  fontPx: 22,
  letterSpacing: 1,
  wrapPx: 640,
  /**
   * Over the HUD (1000) and the arrival card (960, 961), under the HUD notices (2000). On the UI scene
   * (FS-TQZ5J § Change: Merge with main, the owner's 2026-11-14 call): over its every panel too, the
   * gear overlay's (1100–1103), the party panel (1110), the controls panel (1200), the settlement record
   * (1600, 1601) and the letter panel (1800); under the menu, the dialogue card and the run's notices
   * (2000) and the item tips (2200).
   */
  depth: 1990,
  fadeInMs: 900,
  holdMs: 2600,
  fadeOutMs: 1100,
  /** From one line gone to the next one's start. */
  gapMs: 250,
  ease: "Sine.easeInOut",
  /** Lines waiting behind the one showing, at most (R13). */
  maxWaiting: 3,
  /** The dread line's tremor (R10): the one named exception to FS-KYPQ9 §B.5. */
  tremor: { durationMs: 220, intensity: 0.002 },
  /** The soft shadow that keeps the letters legible over a lit floor, with no box (R3). */
  shadow: { offsetY: 2, blur: 6 },
} as const;

/** Each tone's look (R8, R9): its text colour, its dust's, and a dread line's embers and tremor. */
export const LORE_TONES: Record<LoreTone, { color: number; dust: LoreTint; embers?: LoreTint; tremor?: true }> = {
  lore: { color: palette.loreText, dust: { from: palette.loreText, to: palette.loreFade } },
  dread: {
    color: palette.loreDread,
    dust: { from: palette.loreDread, to: palette.loreFade },
    embers: { from: palette.loreEmber, to: palette.loreEmberDeep },
    tremor: true,
  },
  hope: { color: palette.loreHope, dust: { from: palette.loreHope, to: palette.loreFade } },
};

/**
 * The dread line's tremor on `camera` (R10): the one camera shake FS-KYPQ9 §B.5 allows, made here and
 * nowhere else. The run's answer to the UI scene's `tremor` request shakes its camera through it.
 */
export function tremble(camera: Pick<Phaser.Cameras.Scene2D.Camera, "shake">, durationMs: number, intensity: number): void {
  camera.shake(durationMs, intensity);
}

const same = (a: LoreLine, b: LoreLine) => a.text === b.text && a.tone === b.tone;

/** The box of a line's text centred on (x, y): what its dust rises from. */
const boxOf = (text: Phaser.GameObjects.Text, x: number, y: number): LoreArea => ({
  x: x - text.width / 2,
  y: y - text.height / 2,
  width: text.width,
  height: text.height,
});

/**
 * The lines waiting once `line` arrives while `showing` shows (R11-R14): it waits at the back; a
 * dread line waits ahead of every non-dread line, behind an earlier dread one; past
 * `maxWaiting`, the oldest waiting non-dread line goes (the newcomer, when it is non-dread and no
 * other is); a line equal to the one showing or one waiting is dropped.
 */
export function enqueue(waiting: readonly LoreLine[], showing: LoreLine | undefined, line: LoreLine): LoreLine[] {
  if ((showing && same(showing, line)) || waiting.some((w) => same(w, line))) return [...waiting];
  const dreads = waiting.filter((w) => w.tone === "dread");
  const rest = waiting.filter((w) => w.tone !== "dread");
  const next = line.tone === "dread" ? [...dreads, line, ...rest] : [...dreads, ...rest, line];
  if (next.length <= LORE_LINE.maxWaiting) return next;
  const oldest = next.findIndex((w) => w.tone !== "dread");
  if (oldest < 0) return [...waiting];
  return next.filter((_, i) => i !== oldest);
}

/** What of the dust a lore line plays. `LoreDust` is one. */
export interface LoreDustPlayer {
  start(area: LoreArea, tint: LoreTint, depth: number): boolean;
  burst(area: LoreArea, tint: LoreTint, depth: number): boolean;
  move(area: LoreArea): void;
  stop(): void;
  clear(): void;
  forget(): void;
}

/** What of a scene the lines are drawn, timed and trembled with. A `Phaser.Scene` is one. */
export interface LoreLineScene extends EndingScene {
  add: Pick<Phaser.GameObjects.GameObjectFactory, "text">;
  tweens: Pick<Phaser.Tweens.TweenManager, "add">;
  time: Pick<Phaser.Time.Clock, "delayedCall">;
  cameras: { main: Pick<Phaser.Cameras.Scene2D.Camera, "shake"> };
}

export interface LoreLinesOptions {
  /** What the line centres on: the logical view, unless a host draws on a canvas of its own. */
  view?: CardView;
  /** Whether the player asked for less motion: no tremor (R7). The dust asks for itself. */
  reducedMotion?: () => boolean;
  /**
   * The dread line's tremor (R10), for a host whose camera is not the one to shake: the UI scene asks
   * the world's (FS-TQZ5J § Change: Merge with main, 2026-11-14). Its own camera's shake, unless given.
   */
  tremor?: (durationMs: number, intensity: number) => void;
}

type Timer = { remove(dispatchCallback?: boolean): unknown };

/**
 * A scene's lore lines.
 *
 *   const lore = new LoreLines(scene, new LoreDust(scene, () => art));
 *   lore.say({ text: "The way out stands open.", tone: "hope" });
 *   lore.relayout(); // the view changed
 *   lore.clear();    // a reset, a new floor: every line down, the queue empty
 */
export class LoreLines {
  private waiting: LoreLine[] = [];
  private showing?: { line: LoreLine; text: Phaser.GameObjects.Text; timers: Timer[] };
  /** The pause between one line gone and the next; none otherwise. */
  private gap?: Timer;
  private cancelSceneEnd?: () => void;
  private readonly view: CardView;
  private readonly reducedMotion: () => boolean;
  private readonly tremor: (durationMs: number, intensity: number) => void;

  constructor(
    private readonly scene: LoreLineScene,
    private readonly dust: LoreDustPlayer,
    options: LoreLinesOptions = {},
  ) {
    this.view = options.view ?? viewport;
    this.reducedMotion = options.reducedMotion ?? (() => prefersReducedMotion());
    this.tremor = options.tremor ?? ((durationMs, intensity) => tremble(scene.cameras.main, durationMs, intensity));
  }

  /** The line showing now, if any. */
  get current(): LoreLine | undefined {
    return this.showing?.line;
  }

  /** The lines waiting, the next first. */
  get queued(): readonly LoreLine[] {
    return this.waiting;
  }

  /** Says `line`: at once if nothing shows, or after those ahead of it (R11-R14). */
  say(line: LoreLine): void {
    if (!this.showing && !this.gap) return this.show(line);
    this.waiting = enqueue(this.waiting, this.showing?.line, line);
  }

  /** The view changed: the line showing, and its dust, stand at its place in the new view. */
  relayout(): void {
    const text = this.showing?.text;
    if (!text?.active) return;
    const { x, y } = this.centre();
    text.setPosition(x, y);
    crispen([text]);
    this.dust.move(boxOf(text, x, y));
  }

  /** Every line down at once and the queue empty (R15): a reset, a floor change. */
  clear(): void {
    this.showing?.timers.forEach((t) => t.remove(false));
    this.showing?.text.destroy();
    this.gap?.remove(false);
    this.dust.clear();
    this.forget();
  }

  /** Lets go of every line without touching it: at a scene's end, they went with the scene. */
  private forget(): void {
    this.cancelSceneEnd?.();
    this.cancelSceneEnd = undefined;
    this.dust.forget();
    this.showing = undefined;
    this.gap = undefined;
    this.waiting = [];
  }

  /** The line's centre in the view now: across its middle, `rise` of its height above it (R2). */
  private centre(): { x: number; y: number } {
    const { view } = this;
    return { x: view.centerX, y: view.centerY - LORE_LINE.rise * view.height };
  }

  private show(line: LoreLine): void {
    const { scene } = this;
    const L = LORE_LINE;
    const tone = LORE_TONES[line.tone];
    const { x, y } = this.centre();
    const text = scene.add.text(x, y, line.text, {
      fontFamily: CANVAS_FONT.body,
      fontSize: `${L.fontPx}px`,
      fontStyle: "italic",
      color: toCss(tone.color),
      letterSpacing: L.letterSpacing,
      align: "center",
      wordWrap: { width: L.wrapPx, useAdvancedWrap: true },
    });
    text.setOrigin(0.5).setScrollFactor(0).setDepth(L.depth).setAlpha(0);
    text.setShadow(0, L.shadow.offsetY, toCss(palette.loreShadow), L.shadow.blur, false, true);
    this.cancelSceneEnd ??= onSceneEnd(scene, () => this.forget());

    scene.tweens.add({ targets: text, alpha: 1, duration: L.fadeInMs, ease: L.ease });
    const area = boxOf(text, x, y);
    this.dust.start(area, tone.dust, L.depth);
    if (tone.embers) this.dust.burst(area, tone.embers, L.depth);
    if (tone.tremor && !this.reducedMotion()) this.tremor(L.tremor.durationMs, L.tremor.intensity);

    const fade = scene.time.delayedCall(L.fadeInMs + L.holdMs, () => {
      this.dust.stop();
      scene.tweens.add({ targets: text, alpha: 0, duration: L.fadeOutMs, ease: L.ease });
    });
    const end = scene.time.delayedCall(L.fadeInMs + L.holdMs + L.fadeOutMs, () => {
      text.destroy();
      this.showing = undefined;
      this.next();
    });
    this.showing = { line, text, timers: [fade, end] };
  }

  /**
   * After the gap, the next line waiting, if any. The scene's end is still listened for with none:
   * the last line's motes may be in the air.
   */
  private next(): void {
    if (this.waiting.length === 0) return;
    this.gap = this.scene.time.delayedCall(LORE_LINE.gapMs, () => {
      this.gap = undefined;
      const [line, ...rest] = this.waiting;
      this.waiting = rest;
      if (line) this.show(line);
    });
  }
}
