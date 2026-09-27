/** The light-map (FS-2325V §C.7–§C.10). Scenes import from here. */
export { LightMap, LIGHTMAP_DEPTH, HALO_DEPTH } from "./LightMap";
export {
  BASE_AMBIENT,
  DELVER_TORCH,
  ambientFor,
  sourceFromManifest,
  type LightSource,
} from "./lighting";
