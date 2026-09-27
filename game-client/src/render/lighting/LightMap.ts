/**
 * The light-map (FS-2325V §C.7, guideline "Lighting"): a camera-fixed layer that multiplies the
 * lit world, refilled each frame with the world's ambient, with an additive radial pool per light
 * source in view and the delver's torch. Flame halos draw just above it; the vignette (905) and
 * the HUD (1000) stay above both.
 *
 * Built once, restamped per frame, never rebuilt: its texture lives in the game's texture manager
 * under one key, so a scene restart on reconnect reuses it rather than allocating another.
 */

import Phaser from "phaser";
import type { Point } from "@/render/iso";
import {
  DELVER_TORCH,
  cullInto,
  flickerAt,
  type LightSource,
} from "./lighting";

/** Above world objects (the 100–101 band), below effects (140–160), names, the vignette and HUD. */
export const LIGHTMAP_DEPTH = 135;
/** Flame halos: above the light-map, so a flame reads as the source of its own pool. */
export const HALO_DEPTH = 136;

const TEXTURE_KEY = "lightmap";
const FALLOFF_KEY = "lightmap:falloff";
const HALO_KEY = "lightmap:halo";
const FALLOFF_SIZE = 256;
const HALO_SIZE = 64;

/** A halo's radius as a share of its source's pool radius. */
const HALO_SHARE = 0.16;
const HALO_ALPHA = 0.55;
/** How fast the carried pool fades when the delver has gone (escaped or died), per frame. */
const CARRY_FADE = 0.92;

/**
 * A white radial falloff: a pool stamp takes its colour from the tint. Drawn once per game.
 * The white is the multiply identity (see `FULL_LIGHT`), not a palette colour.
 */
function ensureFalloff(
  scene: Phaser.Scene,
  key: string,
  size: number,
  core: number,
): void {
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d")!;
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255, 255, 255, 1)");
  grad.addColorStop(core, "rgba(255, 255, 255, 0.55)");
  grad.addColorStop(1, "rgba(255, 255, 255, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  scene.textures.addCanvas(key, canvas);
}

export class LightMap {
  private readonly texture: Phaser.Textures.DynamicTexture;
  private readonly image: Phaser.GameObjects.Image;
  private readonly sources: LightSource[] = [];
  private readonly visible: LightSource[] = [];
  private readonly halos: Phaser.GameObjects.Image[] = [];
  /** When a source's flame can be seen; absent means always. */
  private readonly haloWhen = new Map<LightSource, () => boolean>();
  private readonly carried: LightSource = {
    x: 0,
    y: 0,
    ...DELVER_TORCH,
    seed: 0.5,
  };
  private carriedAlpha = 0;
  private carrying = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private ambient: number,
  ) {
    const cam = scene.cameras.main;
    ensureFalloff(scene, FALLOFF_KEY, FALLOFF_SIZE, 0.45);
    ensureFalloff(scene, HALO_KEY, HALO_SIZE, 0.3);

    const existing = scene.textures.exists(TEXTURE_KEY)
      ? (scene.textures.get(TEXTURE_KEY) as Phaser.Textures.DynamicTexture)
      : undefined;
    this.texture =
      existing ??
      scene.textures.addDynamicTexture(TEXTURE_KEY, cam.width, cam.height)!;
    if (this.texture.width !== cam.width || this.texture.height !== cam.height)
      this.texture.setSize(cam.width, cam.height);

    this.image = scene.add
      .image(0, 0, TEXTURE_KEY)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(LIGHTMAP_DEPTH)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);

    // Window resized or the scale refit: stay full-canvas (FS-2325V "Edge States").
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.fit, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.fit, this),
    );
  }

  /**
   * A fixed light source (a sconce, a brazier, a lit window), in camera-world coordinates.
   * `haloWhen` says when its flame itself is in sight: a sconce under a roof lights the ground
   * around it, but its halo must not glow through the roof.
   */
  add(source: LightSource, haloWhen?: () => boolean): void {
    this.sources.push(source);
    if (haloWhen) this.haloWhen.set(source, haloWhen);
  }

  setAmbient(ambient: number): void {
    this.ambient = ambient;
  }

  /** Where the delver's torch is this frame, or null once there is no delver to carry it. */
  carry(at: Point | null): void {
    this.carrying = at !== null;
    if (at) {
      this.carried.x = at.x;
      this.carried.y = at.y;
    }
  }

  /** Refill and restamp. Call once per frame. */
  update(timeMs: number): void {
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    this.carriedAlpha = this.carrying ? 1 : this.carriedAlpha * CARRY_FADE;

    // The fill inherits whatever GL blend the last draw of the previous frame left
    // bound (see forceNormalBlend), so it is forced before the fill as well as after.
    this.forceNormalBlend();
    // One stamp at a time, not a beginDraw/endDraw batch: a batched stamp's
    // transparent corners overwrite the pools under it (seen as hard rectangles in
    // the light). There are a few dozen sources at most, and only those in view.
    this.texture.fill(this.ambient, 1);
    const lit = cullInto(this.sources, view, this.visible);
    for (const s of lit) this.stamp(s, view, timeMs, 1);
    if (this.carriedAlpha > 0.01)
      this.stamp(this.carried, view, timeMs, this.carriedAlpha);
    this.forceNormalBlend();

    this.placeHalos(lit, timeMs);
  }

  /**
   * Phaser can leave a blend bound on the GL context while its own state says NORMAL: after
   * an ADD stamp, the camera's background fill then draws additively (seen: the map edge
   * rendered as the game's clear colour plus pitch). Forcing NORMAL rebinds it either way.
   */
  private forceNormalBlend(): void {
    const renderer = this.scene.sys.renderer;
    if (renderer.type === Phaser.WEBGL)
      (renderer as Phaser.Renderer.WebGL.WebGLRenderer).setBlendMode(
        Phaser.BlendModes.NORMAL,
        true,
      );
  }

  private stamp(
    s: LightSource,
    view: Phaser.Geom.Rectangle,
    timeMs: number,
    alpha: number,
  ): void {
    const f = flickerAt(timeMs, s.seed, s.flicker);
    this.texture.stamp(FALLOFF_KEY, undefined, s.x - view.x, s.y - view.y, {
      scale: ((s.radius * 2) / FALLOFF_SIZE) * (0.94 + 0.06 * f),
      tint: s.color,
      alpha: s.intensity * f * alpha,
      blendMode: Phaser.BlendModes.ADD,
    });
  }

  /** A soft glow on each flame in view, reusing a pool of images. */
  private placeHalos(lit: readonly LightSource[], timeMs: number): void {
    let used = 0;
    for (const s of lit) {
      if (this.haloWhen.get(s)?.() === false) continue;
      let halo = this.halos[used++];
      if (!halo) {
        halo = this.scene.add
          .image(0, 0, HALO_KEY)
          .setDepth(HALO_DEPTH)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.halos.push(halo);
      }
      const f = flickerAt(timeMs, s.seed, s.flicker);
      halo
        .setVisible(true)
        .setPosition(s.x, s.y)
        .setTint(s.color)
        .setAlpha(HALO_ALPHA * f)
        .setScale(((s.radius * HALO_SHARE * 2) / HALO_SIZE) * (0.9 + 0.1 * f));
    }
    for (let i = used; i < this.halos.length; i++)
      this.halos[i].setVisible(false);
  }

  private fit(size: Phaser.Structs.Size): void {
    this.texture.setSize(size.width, size.height);
    this.image.setSize(size.width, size.height);
  }
}
