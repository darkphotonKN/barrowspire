/**
 * Projectiles in flight (FS-KYPQ9 §E.2, §E.3, §F.2–§F.4): the baked body, the trail streaming
 * behind it (and the fireball's riding light, which is part of its trail entry), and one impact
 * when it leaves state.
 *
 *   const flights = new ProjectileFlights(scene, art, fx, kindOf);
 *   flights.sync(state.projectiles); // every state: first sight creates, each tick moves,
 *                                    // an id gone from state lands (hit or max range alike)
 *   flights.clear();                 // resetRun: no impact, nothing left tracked
 *
 * Signal, unchanged: `ProjectileState` appearing, moving and disappearing. It is global and
 * carries no owner, so a rival's projectile flies, lights and lands like the delver's own. Cast
 * and release are played by the scene on its own send, never here on first sight.
 *
 * The body is a plain baked image at the footprint, on the chest layer as today (`standAt(…, 5)`).
 * It is never scaled or tweened: no pulse, no yoyo (§B.4). The trail and impacts are table
 * entries played through the runtime, owned by the projectile's `entity_id`, so releasing the id
 * takes the trail and the riding light with it.
 */

import type Phaser from "phaser";
import type { ArtLogger } from "@/render/art/library";
// The pure projection modules, not the `@/render/iso` barrel, which loads Phaser.
import {
  screenToWorld,
  worldToScreen,
  type Point,
} from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import type {
  EffectsRuntime,
  FxArt,
  OwnerKey,
  Played,
  ReleaseOptions,
} from "./runtime";
import type { EffectName, FxTexture } from "./table";

/** The fields of a server `ProjectileState` a flight reads. */
export interface Sighting {
  entity_id: string;
  projectile_type: string;
  position: Point;
  velocity?: { vx: number; vy: number };
}

/** What a kind of projectile looks like in flight and how it lands. */
export interface ProjectileKind {
  /** The baked body, drawn as is (its colours are baked). */
  body: FxTexture;
  /** A `stream` entry following the body. */
  trail: EffectName;
  /** Whether the body is rotated to the projected velocity (the arrow). */
  turns: boolean;
  /** Plays the impact at the last world position. */
  impact(fx: Pick<EffectsRuntime, "play">, owner: OwnerKey, at: Point): void;
}

/** The slice of a Phaser scene a body is drawn with. */
export interface FlightScene {
  add: Pick<Phaser.GameObjects.GameObjectFactory, "image">;
}

/** The body's sub-layer within its footprint, as drawn today. */
const BODY_LAYER = 5;
/** The trail sorts just behind its body. */
const TRAIL_LAYER = 4;

interface Flight {
  kind: ProjectileKind;
  body?: Phaser.GameObjects.Image;
  trail: Played | null;
  pos: Point;
}

export class ProjectileFlights {
  private readonly flights = new Map<string, Flight>();
  private readonly warned = new Set<string>();

  constructor(
    private readonly scene: FlightScene,
    private readonly art: FxArt,
    private readonly fx: Pick<EffectsRuntime, "play" | "release">,
    private readonly kindOf: (projectileType: string) => ProjectileKind,
    private readonly logger: ArtLogger = console,
  ) {}

  /** Brings flights in line with one state's projectiles. */
  sync(projectiles: readonly Sighting[]): void {
    const seen = new Set<string>();
    for (const p of projectiles) {
      seen.add(p.entity_id);
      const pos = { x: p.position.x, y: p.position.y };
      const heading = headingOf(p);
      const flight = this.flights.get(p.entity_id);
      if (flight) this.move(flight, pos, heading);
      else
        this.flights.set(
          p.entity_id,
          this.launch(p.entity_id, p.projectile_type, pos, heading),
        );
    }
    for (const [id, flight] of this.flights) {
      if (seen.has(id)) continue;
      this.end(id, flight);
      flight.kind.impact(this.fx, id, flight.pos);
    }
  }

  /** Drops every flight without an impact (resetRun, scene SHUTDOWN/DESTROY). */
  clear(): void {
    for (const [id, flight] of this.flights)
      this.end(id, flight, { now: true });
  }

  /** How many projectiles are in flight. */
  tracked(): number {
    return this.flights.size;
  }

  private launch(
    id: string,
    type: string,
    pos: Point,
    heading?: Point,
  ): Flight {
    const kind = this.kindOf(type);
    const flight: Flight = {
      kind,
      body: this.body(kind.body),
      trail: this.fx.play(id, kind.trail, pos, {
        ...(heading ? { direction: heading } : {}),
        layer: TRAIL_LAYER,
      }),
      pos,
    };
    this.place(flight, pos, heading);
    return flight;
  }

  private move(flight: Flight, pos: Point, heading?: Point): void {
    flight.pos = pos;
    this.place(flight, pos, heading);
    flight.trail?.moveTo(pos);
  }

  private place(flight: Flight, pos: Point, heading?: Point): void {
    const body = flight.body;
    if (!body) return;
    const s = worldToScreen(pos.x, pos.y);
    body.setPosition(s.x, s.y).setDepth(worldDepth(pos.x, pos.y, BODY_LAYER));
    if (flight.kind.turns && heading) {
      const h = worldToScreen(heading.x, heading.y);
      body.setRotation(Math.atan2(h.y, h.x));
    }
  }

  private end(id: string, flight: Flight, how: ReleaseOptions = {}): void {
    this.fx.release(id, how);
    flight.body?.destroy();
    this.flights.delete(id);
  }

  /** The baked body, or nothing when its sheet is missing (logged once, §B.10). */
  private body(sheet: FxTexture): Phaser.GameObjects.Image | undefined {
    if (!this.art.has(sheet)) {
      if (!this.warned.has(sheet)) {
        this.warned.add(sheet);
        this.logger.warn(
          `effects: "${sheet}" missing; the projectile draws no body`,
          { sheet },
        );
      }
      return undefined;
    }
    const r = this.art.resolve(sheet);
    const image = r.placeholder
      ? this.scene.add.image(0, 0, r.texture)
      : this.scene.add.image(0, 0, r.texture, r.frame);
    return image.setOrigin(r.anchor.x, r.anchor.y);
  }
}

/** The world velocity, when the projectile is moving. */
function headingOf(p: Sighting): Point | undefined {
  const v = p.velocity;
  return v && (v.vx !== 0 || v.vy !== 0) ? { x: v.vx, y: v.vy } : undefined;
}

/**
 * The world point `px` screen pixels along the projected aim from `from` toward `toward`: the
 * casting hand or the bow, placed on the projection as the old effects were.
 */
export function alongAim(from: Point, toward: Point, px: number): Point {
  const a = worldToScreen(from.x, from.y);
  const b = worldToScreen(toward.x, toward.y);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  return screenToWorld(a.x + Math.cos(angle) * px, a.y + Math.sin(angle) * px);
}
