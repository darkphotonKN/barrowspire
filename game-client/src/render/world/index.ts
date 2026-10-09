/** The dressed world: ground, walls, roofs, interactables, occlusion (FS-2325V §C.1–§C.6). */
export { BAKE } from "./bake";
export { housesFrom, insideHouse, type House } from "./houses";
export { tileHash, worldSeed, type WorldKind } from "./ground";
export {
  RUN_WORLD_THEME,
  TOWER_BANDS,
  WORLD_THEMES,
  floorBand,
  floorLook,
  type BandLook,
  type FloorBand,
  type FloorLook,
  type WorldTheme,
  type WorldThemeLook,
} from "./worldTheme";
export {
  DRESSING_MAX,
  dressingStatics,
  planDressing,
  type DressingLean,
  type DressingPiece,
} from "./runDressing";
export {
  FIXED_LIGHT_CAP,
  budgetLights,
  interactablePool,
  type FixedLight,
  type FixedLightKind,
} from "./floorLights";
export { footprintHitArea } from "./footprint";
export { INTERACT_RANGE, StairsSet, type StairsStage } from "./stairs";
export { DROP_PILE, paintDropPile, type PileBrush } from "./dropPile";
export { TRAIL_BED_DEPTH, TrailSet, type TrailBrush, type TrailStage } from "./trails";
export {
  GroundLayer,
  Occluders,
  addDressing,
  addPerimeter,
  addProp,
  addRoof,
  addWalls,
  showState,
  type BuiltDressing,
  type BuiltPerimeter,
  type BuiltWalls,
  type FloorGround,
} from "./scene";
