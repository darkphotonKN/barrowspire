import Phaser from "phaser";
import { WORLD_PX_PER_TILE, worldToScreen, type Point } from "./projection";
import { boxFaces, splitAlongLength, worldDepth } from "./shapes";

/** Placeholder wall height on screen, until baked wall pieces land (FS-2325V §C.2). */
export const WALL_HEIGHT = 20;

export interface BlockStyle {
  top: number;
  south: number;
  east: number;
  /** Optional outline round the top face. */
  edge?: { width: number; color: number; alpha: number };
}

/**
 * An upright placeholder block on a world rect (a server wall), cut into one-tile
 * pieces so each sorts by its own footprint. Returns the pieces so the caller can
 * destroy them with the wall.
 */
export function addUprightBlock(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  style: BlockStyle,
  height = WALL_HEIGHT,
): Phaser.GameObjects.Graphics[] {
  return splitAlongLength(x, y, w, h, WORLD_PX_PER_TILE).map((piece) => {
    const { top, south, east } = boxFaces(
      piece.x,
      piece.y,
      piece.width,
      piece.height,
      height,
    );
    const g = scene.add.graphics();

    g.fillStyle(style.south, 1);
    g.fillPoints(south, true);
    g.fillStyle(style.east, 1);
    g.fillPoints(east, true);
    g.fillStyle(style.top, 1);
    g.fillPoints(top, true);

    if (style.edge) {
      g.lineStyle(style.edge.width, style.edge.color, style.edge.alpha);
      g.strokePoints(top, true);
    }

    g.setDepth(
      worldDepth(piece.x + piece.width / 2, piece.y + piece.height / 2),
    );
    return g;
  });
}

/**
 * Places an upright object (a character, a prop sprite) standing on a world
 * position: drawn at its projection, sorted by its footprint. `layer` stacks
 * parts of one object (legs under body, and so on).
 */
export function standAt(
  obj: Phaser.GameObjects.Components.Transform &
    Phaser.GameObjects.Components.Depth,
  pos: Point,
  layer = 0,
): void {
  const s = worldToScreen(pos.x, pos.y);
  obj.setPosition(s.x, s.y);
  obj.setDepth(worldDepth(pos.x, pos.y, layer));
}
