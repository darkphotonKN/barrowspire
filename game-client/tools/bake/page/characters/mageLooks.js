// The mage's specialization looks (FS-1J1CB §A R3–R4): the Spellwarden and the Pyromancer, each
// the wizard re-dressed on her own rig, build and clips (cast.js `wizard(look)`, look.js). Ported
// from the /variants round's mageSpecs.js (Spellwarden B, Pyromancer B with C's caged flame),
// cleaned up and rebuilt on the look's pieces. Each carries a focus about 1.5x the sceptre in its
// place (gear.js `wardFocus`, `fireFocus`), held and thrust as the sceptre is. The Spellwarden's
// ward is a runtime aura (§E), never baked here.

import * as THREE from "three";
import { attach, jointAt as J, rigidTube } from "./rig.js";
import { skirt } from "./anatomy.js";
import { fireFocus, inHand, spaulder, tome, wardFocus } from "./gear.js";
import { glow } from "../materials.js";
import { mix } from "../palette.js";
import { FOCUS_STYLE } from "./classStyles.js";

/** A focus in her right hand, mounted as cast.js `wizard` mounts the sceptre. */
const focusIn = (rig, build) => inHand(rig, "R").add(build);

// --- the Spellwarden (R3) --------------------------------------------------------------------

/** A blackened-iron gorget at the base of the neck, over the standing collar's foot. */
function gorget(rig, F) {
  const [, ny] = J(rig, "neck");
  const geo = rigidTube(
    rig.H,
    [
      { p: [0, ny + 0.002, 0], r: [0.062, 0.058] },
      { p: [0, ny - 0.02, 0], r: [0.092, 0.082] },
      { p: [0, ny - 0.04, 0], r: [0.112, 0.094] },
    ],
    { segs: 26, steps: 2, caps: false },
  );
  attach(rig, "chest", geo, F.blackIron, [0, 0, 0]);
}

/** The tome bound shut in two iron bands: the warded book (gear.js `tome`, banded). */
function wardedTome(rig, F) {
  const H = rig.H;
  const g = tome(rig, F);
  const book = g.children[0];
  for (const sy of [-0.022, 0.022]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.042 * H, 0.008 * H, 0.082 * H), F.blackIron);
    band.position.set(0, sy * H, 0);
    book.add(band);
  }
  return g;
}

/** Blackened-iron spaulders on both shoulders, three lames each at 0.9, and the gorget. */
function wardenIron(rig, { F }) {
  gorget(rig, F);
  for (const side of ["L", "R"]) spaulder(rig, side, F.blackIronDouble, { lames: 3, size: 0.9 });
}

/** The Spellwarden (R3): variant B's iron, the iron-bound tome, and the ward focus round a pale stone lit low. */
export const spellwarden = {
  // the stone: necrotic toward vellum, low, never neon
  mats: () => ({ orb: glow(mix("necrotic", "vellum", 0.35), 1.2) }),
  swap: {
    weapon: (rig, { M, F, mat }) => focusIn(rig, wardFocus(rig, M, F, mat)),
    tome: (rig, { F }) => inHand(rig, "L", { rx: -Math.PI / 2 }).add(wardedTome(rig, F)),
  },
  add: wardenIron,
  style: FOCUS_STYLE,
};

// --- the Pyromancer (R4) ---------------------------------------------------------------------

/** The gown's hem singed: torn short and ragged (variant B `hem`). */
const SINGED = { teeth: 15, depth: -0.045, seed: 6 };

/**
 * Lays the ember band of a gown's emissive map (fabrics.js `emberHem`) on its hem: the map's top
 * row on the hem ring, its last row `band` H up the cloth, clamped black above, and a whole number
 * of its tiles round the gown so the back seam does not show. A skirt's UVs run `uvPerH` (4) a H
 * down and round it (anatomy.js `skirt`, rig.js `skinTube`), unmoved by a ragged hem's drop, so
 * the embers ride the torn edge.
 */
export function fitHem(mesh, uvPerH = 4) {
  const map = mesh.material.emissiveMap;
  const uv = mesh.geometry.attributes.uv;
  let uMax = 0;
  let vMax = 0;
  for (let i = 0; i < uv.count; i++) {
    uMax = Math.max(uMax, uv.getX(i));
    vMax = Math.max(vMax, uv.getY(i));
  }
  const band = map.userData.band * uvPerH;
  map.repeat.set(Math.max(1, Math.round(uMax)) / uMax, 1 / band);
  map.offset.set(0, 1 - vMax / band);
  map.updateMatrix();
  return mesh;
}

/** The Pyromancer (R4): variant B's scorched scapular and singed hem, embers in the gown's hem, the fire focus. */
export const pyromancer = {
  // the scapular, its collar and its bust all cut from the scorched oxblood
  mats: (F) => ({
    collar: F.soot,
    scapular: F.soot,
    bust: F.soot,
    gown: F.robeEmbers,
    orb: glow(mix("fireHot", "fireDeep", 0.2), 2.2),
  }),
  opts: { gown: { ragged: SINGED } },
  swap: {
    gown: (rig, { mat, o }) => fitHem(skirt(rig, mat, o)),
    weapon: (rig, { M, F, mat }) => focusIn(rig, fireFocus(rig, M, F, mat)),
  },
  style: FOCUS_STYLE,
};
