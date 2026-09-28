/** The dressed world: ground, walls, roofs, interactables, occlusion (FS-2325V §C.1–§C.6). */
export { BAKE } from "./bake";
export { housesFrom, insideHouse, type House } from "./houses";
export { tileHash, worldSeed, type WorldKind } from "./ground";
export { footprintHitArea } from "./footprint";
export {
  GroundLayer,
  Occluders,
  addProp,
  addRoof,
  addWalls,
  showState,
  type BuiltWalls,
} from "./scene";
