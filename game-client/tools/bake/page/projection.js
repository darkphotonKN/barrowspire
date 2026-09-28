// The bake camera, which must agree exactly with the client's isometric projection
// (ADR-0020 §2, FS-2325V §B.1).
//
// TILE_W x TILE_H is the 2:1 diamond one world tile projects onto. It is defined HERE, not
// imported from src/render/iso/, because the bake runs in a browser page outside the Next
// bundle. It must equal src/render/iso's tile (64x32): if one changes, both change, and the
// art is re-baked.
//
// One three.js unit is one tile edge. Three's +x is world +x (screen right-down) and three's
// +z is world +y (screen left-down); +y is up.

export const TILE_W = 64;
export const TILE_H = 32;

/** 30° elevation, 45° azimuth: the orthographic view that lands on the 2:1 diamond. */
export const ELEVATION = Math.PI / 6;
export const AZIMUTH = Math.PI / 4;

/**
 * Screen px per world unit in the view plane: a tile edge runs at 45° to the screen, so its
 * horizontal extent is K1·cos45° = TILE_W/2. K1 = 32/√½ ≈ 45.25.
 */
export const K1 = TILE_W / 2 / Math.SQRT1_2;

/** Screen px per world unit of height: K1·cos30° ≈ 39.19. */
export const VPX = K1 * Math.cos(ELEVATION);

/** Supersample factor: frames render at SS× and box-filter down to 1×. */
export const SS = 2;

/** Unit vector from the scene toward the camera (three.js axes). */
export const VIEW_DIR = [
  Math.cos(ELEVATION) * Math.sin(AZIMUTH),
  Math.sin(ELEVATION),
  Math.cos(ELEVATION) * Math.cos(AZIMUTH),
];
