/**
 * The gallery's one canvas (FS-1819Q R11): the mage on a flagstone floor under the run's ambient
 * and carried torch, as in a delve, with an effects runtime and projectile flights wired to it
 * as the run wires them. Every effect card plays here, on that one figure.
 */

import * as Phaser from "phaser";
import { BARROW_HEX } from "@/utils/theme";
import { preloadArt, registerArt } from "@/render/art/phaser";
import { RESIDENT_ART } from "@/render/art/sceneArt";
import { CharacterAnimator } from "@/render/art/character";
import { directionIndex } from "@/render/art/manifest";
import type { ArtLibrary } from "@/render/art/library";
import { projectileFlightOf } from "@/render/effects/flights";
import {
  ProjectileFlights,
  type Sighting,
} from "@/render/effects/projectile";
import { EffectsRuntime } from "@/render/effects/runtime";
import type { Facing8 } from "@/render/iso/facing";
import { worldToScreen, type Point } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import { LightMap } from "@/render/lighting/LightMap";
import { AMBIENT } from "@/render/lighting/lighting";
import { GROUND_DEPTH } from "@/render/world/scene";
import type { EffectCard, Stage } from "./effects";
import { InTurn } from "./inTurn";

/** Where the figure stands, in world px. */
const AT: Point = { x: 200, y: 200 };
/** Where it aims: along world +x, which the figure faces, a short bowshot away. */
const AIM: Point = { x: AT.x + 110, y: AT.y };
const FACING: Facing8 = "e";
/** World px per floor tile, and tiles per side. */
const TILE = 40;
const TILES = 12;
/** How long a demo projectile takes from the figure to the aim. */
const FLIGHT_MS = 320;
/** Between one card and the next in "play all in turn". */
const TURN_MS = 1600;

export class GalleryScene extends Phaser.Scene {
  private art!: ArtLibrary;
  private lightMap!: LightMap;
  private fx!: EffectsRuntime;
  private flights!: ProjectileFlights;
  private figure!: Phaser.GameObjects.Sprite;
  private animator!: CharacterAnimator;
  private turns!: InTurn;
  /** Projectiles in the air, as a server state would list them. */
  private readonly sightings = new Map<string, Sighting>();
  private plays = 0;
  /** Set once create() has wired the runtime and the figure; a click before then plays nothing. */
  private ready = false;

  constructor() {
    super({ key: "GalleryScene" });
  }

  preload(): void {
    // the mage and its effects: resident art (FS-C4JWH §A R3)
    preloadArt(this, RESIDENT_ART);
  }

  create(): void {
    this.art = registerArt(this, RESIDENT_ART);
    this.cameras.main.setBackgroundColor(BARROW_HEX.pitch);
    this.floor();
    this.lightMap = new LightMap(this, AMBIENT.run);
    this.fx = new EffectsRuntime(this, this.art, this.lightMap);
    this.flights = new ProjectileFlights(this, this.art, this.fx, projectileFlightOf);
    this.turns = new InTurn(this.time, TURN_MS);
    this.spawnFigure();
    const mid = worldToScreen((AT.x + AIM.x) / 2, (AT.y + AIM.y) / 2);
    this.cameras.main.centerOn(mid.x, mid.y - 30);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false;
      this.flights.clear();
      this.fx.clearAll();
    });
    this.ready = true;
  }

  update(time: number): void {
    this.animator.show(this.figure, {
      animation: "idle",
      facing: FACING,
      direction: directionIndex(FACING),
      timeScale: 1,
    });
    this.flights.sync([...this.sightings.values()]);
    this.lightMap.update(time);
  }

  /** Plays one card on the figure. A card already playing carries on beside it. */
  play(card: EffectCard): void {
    if (!this.ready) return;
    card.demo?.(this.stage());
  }

  /** Every playable card, one after another; called again, it starts over from the first. */
  playAll(cards: readonly EffectCard[]): void {
    if (!this.ready) return;
    this.turns.start(
      cards.filter((c) => c.demo !== null),
      (c) => this.play(c),
    );
  }

  private stage(): Stage {
    const n = ++this.plays;
    return {
      scene: this,
      fx: this.fx,
      owner: `gallery:${n}`,
      at: AT,
      aim: AIM,
      figure: this.figure,
      crown: this.animator.crown,
      art: this.art,
      lights: this.lightMap,
      now: () => this.time.now,
      later: (ms, fn) => void this.time.delayedCall(ms, fn),
      fly: (projectileType) => this.fly(`flight:${n}`, projectileType),
    };
  }

  /** A projectile from the figure to the aim, synced each frame; gone, the flight lands it. */
  private fly(entityId: string, projectileType: string): void {
    const velocity = { vx: AIM.x - AT.x, vy: AIM.y - AT.y };
    const sighting: Sighting = {
      entity_id: entityId,
      projectile_type: projectileType,
      position: { ...AT },
      velocity,
    };
    this.sightings.set(entityId, sighting);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: FLIGHT_MS,
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        sighting.position = { x: AT.x + velocity.vx * t, y: AT.y + velocity.vy * t };
      },
      onComplete: () => this.sightings.delete(entityId),
    });
  }

  private spawnFigure(): void {
    const s = worldToScreen(AT.x, AT.y);
    this.animator = new CharacterAnimator(this.art, "mage");
    this.figure = this.add.sprite(Math.round(s.x), Math.round(s.y), "");
    this.animator.dress(this.figure);
    this.figure.setDepth(worldDepth(AT.x, AT.y, 1));
    // the player's carried torch, as in a delve
    this.lightMap.carry({ x: s.x, y: s.y });
  }

  /** A flagstone diamond under the figure and its aim, below everything standing on it. */
  private floor(): void {
    const centre = { x: (AT.x + AIM.x) / 2, y: AT.y };
    for (let tx = 0; tx < TILES; tx++)
      for (let ty = 0; ty < TILES; ty++) {
        const s = worldToScreen(
          centre.x + (tx - TILES / 2) * TILE,
          centre.y + (ty - TILES / 2) * TILE,
        );
        const r = this.art.resolve("ground_flagstone", { index: tx * 7 + ty * 3 });
        const img = r.placeholder
          ? this.add.image(s.x, s.y, r.texture)
          : this.add.image(s.x, s.y, r.texture, r.frame);
        img.setOrigin(r.anchor.x, r.anchor.y).setDepth(GROUND_DEPTH);
      }
  }
}
