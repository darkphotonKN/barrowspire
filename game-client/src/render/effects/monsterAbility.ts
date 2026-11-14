/**
 * A monster ability's telegraph and impact (FS-C8VM7 §F R36): while a monster's state carries an
 * `ability` with a radius, its area is drawn on the ground where it will land, a circle for a
 * `pounce`, `ground_slam`, `burst` or `wail`, a cone along the facing for a `cleave`, filling from
 * its centre toward its edge as it nears landing. When the field goes, a short impact of the same
 * shape flashes and fades. A dead Blightborn's state carries its `burst`, so it is drawn on the
 * corpse like any other. A shot ability (`volley`, `dagger`, `rock`) has no area: its flight is the
 * effect (R38).
 *
 * The numbers are the server's (§B R17): where it lands, its radius, its arc, its time left. The
 * client keeps no copy of an ability's reach. It eases the time left between ticks, and reads the
 * whole wind-up as the time left when it first saw it, so the fill is the share already wound.
 *
 * In the hostile channel, tokens only (ADR-0013; guideline "Enemy design language"): lifted
 * oxblood for the edge and the fill, ember for the impact; never amber, never arcane green. Drawn
 * just above the light-map, as a marker is, so the dark never hides where a blow will fall; the
 * fill stays thin so the bodies standing in it still read.
 *
 * Phaser-free: it paints through {@link GroundBrush}, so it is tested without a canvas.
 */

import { worldToScreen, type Point } from "@/render/iso/projection";
import type { MonsterAbility, MonsterState } from "@/types/gameState";
import { palette } from "@/utils/canvasPalette";

/** Above the light-map (135) and the flame halos (136), below the effects band (140+). */
export const TELEGRAPH_DEPTH = 137;

/** How long an impact flashes and fades, in ms. *Starting value.* */
export const IMPACT_MS = 260;

/**
 * Seconds of wind-up a field may still have left, as eased here, and still have landed when it
 * goes: a tick or two. One that goes earlier was called off (its monster slain, or out of
 * interest), and lands nothing to show.
 */
const LANDED_WITHIN_S = 0.25;

/**
 * Seconds more than the eased time left a tick may carry and still be the same wind-up: a tick
 * late off the wire. More than that is a new wind-up, begun after the last one landed unseen.
 */
const SAME_WIND_UP_S = 0.2;

/** Points on a circle's outline; a cone's rim takes its share of them. */
const CIRCLE_POINTS = 48;

/** The edge's width in screen px, and how strongly the edge and the fill are drawn. */
const EDGE = { width: 2, alpha: 0.85 } as const;
const FILL_ALPHA = 0.28;
const IMPACT_ALPHA = 0.6;

/** An ability's area on the ground, in world px and radians. */
export type AbilityShape =
  | { kind: "circle"; centre: Point; radius: number }
  | { kind: "cone"; centre: Point; radius: number; facing: number; arc: number };

/**
 * The area an ability lands on: a cone for a cleave, along `facing` (the server's world vector),
 * a circle for every other kind with a radius, none for a shot.
 */
export function abilityShape(ability: MonsterAbility, facing: Point): AbilityShape | null {
  if (!(ability.radius > 0)) return null;
  const centre = { x: ability.x, y: ability.y };
  if (ability.kind === "cleave")
    return {
      kind: "cone",
      centre,
      radius: ability.radius,
      facing: Math.atan2(facing.y, facing.x),
      arc: (ability.arc * Math.PI) / 180,
    };
  return { kind: "circle", centre, radius: ability.radius };
}

/** The shape's outline at `share` of its radius, in world px: a cone's apex first. */
export function shapeOutline(shape: AbilityShape, share = 1): Point[] {
  const { centre } = shape;
  const reach = shape.radius * share;
  const at = (angle: number) => ({
    x: centre.x + Math.cos(angle) * reach,
    y: centre.y + Math.sin(angle) * reach,
  });
  if (shape.kind === "circle")
    return Array.from({ length: CIRCLE_POINTS }, (_, i) => at((i / CIRCLE_POINTS) * 2 * Math.PI));
  const steps = Math.max(2, Math.ceil((shape.arc / (2 * Math.PI)) * CIRCLE_POINTS));
  const from = shape.facing - shape.arc / 2;
  return [
    { ...centre },
    ...Array.from({ length: steps + 1 }, (_, i) => at(from + (i / steps) * shape.arc)),
  ];
}

/** The world outline, projected to the screen. */
const onScreen = (points: Point[]) => points.map((p) => worldToScreen(p.x, p.y));

/** What drawing a telegraph asks of a graphics object. */
export interface GroundBrush {
  clear(): unknown;
  fillStyle(color: number, alpha?: number): unknown;
  fillPoints(points: Point[], closeShape?: boolean): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  strokePoints(points: Point[], closeShape?: boolean): unknown;
  setDepth(depth: number): unknown;
  destroy(): void;
}

interface Pending {
  brush: GroundBrush;
  kind: MonsterAbility["kind"];
  shape: AbilityShape;
  /** The wind-up as first seen, and what is left of it, in seconds. */
  total: number;
  remaining: number;
}

interface Impact {
  brush: GroundBrush;
  shape: AbilityShape;
  elapsedMs: number;
}

/**
 * Every pending ability's telegraph, keyed by its monster's `entity_id`, and the impacts still
 * fading. {@link sync} on each state broadcast; {@link update} once a frame.
 */
export class AbilityTelegraphs {
  private readonly pending = new Map<string, Pending>();
  private readonly impacts = new Set<Impact>();

  constructor(private readonly brush: () => GroundBrush) {}

  sync(monsters: readonly Pick<MonsterState, "entity_id" | "facing" | "ability">[]): void {
    const listed = new Map(monsters.map((m) => [m.entity_id, m]));
    for (const [id, drawn] of this.pending) {
      const ability = listed.get(id)?.ability;
      if (!ability || !(ability.radius > 0)) this.land(id, drawn);
    }
    for (const monster of monsters) {
      const { ability } = monster;
      if (!ability) continue;
      const shape = abilityShape(ability, monster.facing);
      if (!shape) continue;
      const drawn = this.pending.get(monster.entity_id);
      if (drawn && drawn.kind === ability.kind && ability.remaining <= drawn.remaining + SAME_WIND_UP_S) {
        drawn.remaining = ability.remaining;
        drawn.shape = shape;
      } else {
        // a new wind-up: the last one, if any, landed between two ticks
        drawn?.brush.destroy();
        const brush = this.brush();
        brush.setDepth(TELEGRAPH_DEPTH);
        this.pending.set(monster.entity_id, {
          brush,
          kind: ability.kind,
          shape,
          total: Math.max(ability.remaining, 1e-3),
          remaining: ability.remaining,
        });
      }
      this.paint(this.pending.get(monster.entity_id)!);
    }
  }

  /** One frame: each wind-up eased toward landing, each impact faded. */
  update(deltaMs: number): void {
    for (const drawn of this.pending.values()) {
      drawn.remaining = Math.max(0, drawn.remaining - deltaMs / 1000);
      this.paint(drawn);
    }
    for (const impact of this.impacts) {
      impact.elapsedMs += deltaMs;
      if (impact.elapsedMs >= IMPACT_MS) {
        impact.brush.destroy();
        this.impacts.delete(impact);
      } else this.flash(impact);
    }
  }

  /** Every telegraph and impact taken down: the floor or the world is going. */
  clear(): void {
    for (const drawn of this.pending.values()) drawn.brush.destroy();
    for (const impact of this.impacts) impact.brush.destroy();
    this.pending.clear();
    this.impacts.clear();
  }

  /** A field gone: it flashes where it fell if it was due, else it was called off. */
  private land(id: string, drawn: Pending): void {
    drawn.brush.destroy();
    this.pending.delete(id);
    if (drawn.remaining > LANDED_WITHIN_S) return;
    const brush = this.brush();
    brush.setDepth(TELEGRAPH_DEPTH);
    const impact = { brush, shape: drawn.shape, elapsedMs: 0 };
    this.impacts.add(impact);
    this.flash(impact);
  }

  private paint(drawn: Pending): void {
    const { brush, shape } = drawn;
    const wound = Math.min(1, Math.max(0, 1 - drawn.remaining / drawn.total));
    brush.clear();
    brush.fillStyle(palette.abilityTelegraphFill, FILL_ALPHA);
    brush.fillPoints(onScreen(shapeOutline(shape, wound)), true);
    brush.lineStyle(EDGE.width, palette.abilityTelegraph, EDGE.alpha);
    brush.strokePoints(onScreen(shapeOutline(shape)), true);
  }

  private flash(impact: Impact): void {
    const fade = 1 - impact.elapsedMs / IMPACT_MS;
    impact.brush.clear();
    impact.brush.fillStyle(palette.abilityImpact, IMPACT_ALPHA * fade);
    impact.brush.fillPoints(onScreen(shapeOutline(impact.shape)), true);
  }
}
