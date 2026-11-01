/** The dressed world: ground, walls, roofs, interactables, occlusion (FS-2325V §C.1–§C.6). */
export { BAKE } from "./bake";
export { housesFrom, insideHouse, type House } from "./houses";
export { buildingAt, hidden, markerShown } from "./indoors";
export { coveredBy, covering } from "./occlusion";
export {
  BLACKOUT,
  Blackout,
  blackoutHole,
  blackoutQuads,
  type BlackoutGeometry,
  type BlackoutStage,
} from "./blackout";
export {
  BuildingView,
  type BuildingViewOptions,
  type BuildingViewStage,
  type Figure,
  type Scenery,
  type Visible,
} from "./buildingView";
export {
  darkOpening,
  doorGaps,
  planBuildings,
  planCap,
  type BuildingWalls,
  type CapPiece,
  type DarkOpening,
  type DoorGap,
  type WallLook,
} from "./buildingLooks";
export {
  SILHOUETTE_ALPHA,
  SILHOUETTE_DEPTH,
  SILHOUETTE_MASK,
  SILHOUETTE_TINT,
  Silhouette,
  type SilhouetteBody,
  type SilhouetteCover,
} from "./silhouette";
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
  FIELD_LOOKS,
  FOREST_LOOK,
  MEADOWS_LOOK,
  fieldLook,
  type FieldLook,
} from "./fieldLook";
export { forestStatics, planVerges, type VergeLean, type VergePiece } from "./forestDressing";
export {
  STAND_CELL,
  TREE_CAP,
  planTreeStands,
  standSheet,
  type StandTree,
  type TreeStandLook,
} from "./treeStands";
export {
  planKeepOutDressing,
  planRoadHome,
  type FieldDressingLook,
  type FieldPiece,
  type RoadHome,
} from "./fieldDressing";
export {
  GroundLayer,
  Occluders,
  PLACEHOLDER_STONE,
  addBuildings,
  addDarkOpening,
  addDressing,
  addGables,
  addPerimeter,
  addProp,
  addRoof,
  addWalls,
  coverOf,
  showLook,
  showState,
  slabCover,
  type BuildingOptions,
  type BuildingPart,
  type BuiltBuilding,
  type Cover,
  type BuiltParts,
  type BuiltDressing,
  type BuiltPerimeter,
  type BuiltWalls,
  type FloorGround,
} from "./scene";
