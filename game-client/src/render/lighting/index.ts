/** The light-map (FS-2325V §C.7–§C.10). Scenes import from here. */
export {
  LightMap,
  LIGHTMAP_DEPTH,
  HALO_DEPTH,
  TRANSIENT_CAP,
  type TransientLight,
  type TransientSpec,
} from "./LightMap";
export {
  AMBIENT,
  DELVER_TORCH,
  sourceFromManifest,
  type LightSource,
} from "./lighting";
