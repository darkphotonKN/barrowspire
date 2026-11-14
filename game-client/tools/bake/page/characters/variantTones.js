// The tiered roster's recolours (FS-C8VM7 §H R45): each variant of an old family is its family's
// step-0 look baked again in another shade, deepening with the step. Kept as data with no imports,
// as demonTone.js is, so a unit test holds every recipe to the rule without a browser.
//
// A recipe is a BARROW token (`base`) mixed toward other tokens in turn (`steps`, [token, t]), then
// shaded (`shade`, default 1). A variant overrides only the tones that carry its family's body; its
// gear (the cleaver, the bow, the club, the bone tusks and claws) and its ember eyes stay as baked.
//
// Each family's step 0 is listed too (FAMILY_BASE), recipe for recipe as its builder bakes it
// (fabrics.js GEAR, forlorn.js ASH_TONE and BONE_TONE), so the test can measure each step against
// the one below it. Those builders keep their own tones: the step-0 sheets do not move.
//
// The two paths an old pair takes are kept apart: the ghoul's steps warm (yellowed bone, then
// blood-brown), the Bone Archer's cool (ash, then a wight's cold grey), so a Ghast and an Ashen
// Archer never read as one creature with another weapon.

const SKELETON = {
  bone: { base: "vellum", steps: [["vellumDark", 0.35]] },
  rag: { base: "barrowBrown", steps: [["slate", 0.45]] },
};

/**
 * Each old family's step-0 body tones as baked, by its archetype id. The first key is the body's
 * own tone (bone, hide, skin), the one a step is measured by.
 */
export const FAMILY_BASE = {
  // fabrics.js GEAR.bone, GEAR.rag: the ghoul and the Bone Archer share the skeleton
  ghoul: SKELETON,
  bone_archer: SKELETON,
  // fabrics.js GEAR.troll, GEAR.fur
  troll: {
    troll: { base: "slate", steps: [["barrowBrown", 0.5], ["vellumDark", 0.12]] },
    fur: { base: "barrowBrown", steps: [["barrowDeep", 0.55]] },
  },
  // forlorn.js ASH_TONE
  barrow_thrall: {
    rot: { base: "slateLight", steps: [["vellum", 0.42]] },
    shroud: { base: "charcoal", steps: [["slate", 0.4]] },
  },
  // forlorn.js BONE_TONE
  spire_wraith: {
    pale: { base: "vellum", steps: [["slateLight", 0.08]] },
    gown: { base: "vellum", steps: [["slateLight", 0.16]] },
    wisp: { base: "vellumDark", steps: [["vellum", 0.45]] },
  },
};

/**
 * The eleven variants, by archetype id: the step-0 archetype whose look each recolours (`family`,
 * a FAMILY_BASE key), the archetype one step below it (`below`), and its tones (the keys its
 * builder re-paints). A variant re-paints its family's body tone always; it may add tones its
 * family's base leaves as the builder's (a thrall's bruise, moss, earth and hair).
 */
export const VARIANT_TONES = {
  // the ghoul's: old bone gone a ghastly grey-green, its rags darker
  ghast: {
    family: "ghoul",
    below: "ghoul",
    tones: {
      bone: { base: "vellumDark", steps: [["necrotic", 0.3], ["slate", 0.12]], shade: 0.92 },
      rag: { base: "barrowDeep", steps: [["slate", 0.35]], shade: 0.9 },
    },
  },
  // then a blood-brown, the bone stained by what it eats, its rags near black
  ravener: {
    family: "ghoul",
    below: "ghast",
    tones: {
      bone: { base: "barrowBrown", steps: [["vellumDark", 0.35], ["oxblood", 0.18]], shade: 0.9 },
      rag: { base: "pitch", steps: [["barrowDeep", 0.45]] },
    },
  },
  // the Bone Archer's: bone gone the grey of cold ash, its rags soot
  ashen_archer: {
    family: "bone_archer",
    below: "bone_archer",
    tones: {
      bone: { base: "slateLight", steps: [["vellumDark", 0.4]], shade: 0.9 },
      rag: { base: "charcoal", steps: [["slate", 0.4]] },
    },
  },
  // then a wight's cold blue-grey, its rags black
  wight_archer: {
    family: "bone_archer",
    below: "ashen_archer",
    tones: {
      bone: { base: "slate", steps: [["necrotic", 0.5], ["vellumDark", 0.15]], shade: 0.8 },
      rag: { base: "pitch", steps: [["slate", 0.3]] },
    },
  },
  // the troll's mud-and-stone hide gone the cold blue-grey of cave rock
  cave_troll: {
    family: "troll",
    below: "troll",
    tones: {
      troll: { base: "slate", steps: [["necrotic", 0.15], ["charcoal", 0.3]] },
      fur: { base: "charcoal", steps: [["slate", 0.45]] },
    },
  },
  // then a brown-black with a blood cast, darker than the cave's: never a heraldic red
  blood_troll: {
    family: "troll",
    below: "cave_troll",
    tones: {
      troll: { base: "barrowDeep", steps: [["oxblood", 0.3], ["charcoal", 0.42]] },
      fur: { base: "pitch", steps: [["barrowDeep", 0.4]] },
    },
  },
  // the Barrow Thrall's ash gone a jaundiced, plague-sick yellow-grey, its shroud stained
  plague_thrall: {
    family: "barrow_thrall",
    below: "barrow_thrall",
    tones: {
      rot: { base: "vellumDark", steps: [["brass", 0.22], ["slate", 0.3]] },
      bruise: { base: "barrowDeep", steps: [["arcaneDeep", 0.3]] },
      moss: { base: "arcaneDeep", steps: [["barrowDeep", 0.5]] },
      earth: { base: "barrowDeep", steps: [["pitch", 0.3]] },
      shroud: { base: "barrowDeep", steps: [["slate", 0.3]], shade: 0.9 },
    },
  },
  // then blighted to a dark mould-grey, its shroud black
  blightborn: {
    family: "barrow_thrall",
    below: "plague_thrall",
    tones: {
      rot: { base: "slate", steps: [["barrowBrown", 0.4], ["arcaneDeep", 0.18]] },
      bruise: { base: "pitch", steps: [["arcaneDeep", 0.25]] },
      moss: { base: "arcaneDeep", steps: [["pitch", 0.4]] },
      earth: { base: "pitch", steps: [["barrowDeep", 0.4]] },
      shroud: { base: "pitch", steps: [["charcoal", 0.5]] },
      hairDead: { base: "pitch", steps: [["charcoal", 0.3]] },
    },
  },
  // the Spire Wraith's bone-white gone a dusk grey, its hair the bone it was
  shade: {
    family: "spire_wraith",
    below: "spire_wraith",
    tones: {
      pale: { base: "vellumDark", steps: [["slateLight", 0.55]] },
      gown: { base: "vellumDark", steps: [["slateLight", 0.7]] },
      wisp: { base: "vellumDark", steps: [["slateLight", 0.25]] },
    },
  },
  // then a cold grave-teal
  phantom: {
    family: "spire_wraith",
    below: "shade",
    tones: {
      pale: { base: "necrotic", steps: [["slateLight", 0.35]], shade: 0.86 },
      gown: { base: "necrotic", steps: [["slate", 0.45]] },
      wisp: { base: "necrotic", steps: [["vellumDark", 0.3]] },
    },
  },
  // then dark as a grave at night, only its long hair left pale (the banshee's white hair)
  banshee: {
    family: "spire_wraith",
    below: "phantom",
    tones: {
      pale: { base: "slate", steps: [["necrotic", 0.2]] },
      gown: { base: "slate", steps: [["charcoal", 0.35]] },
      wisp: { base: "vellumDark", steps: [["vellum", 0.3]] },
    },
  },
};

/** A recipe's colour, through palette.js's `mix` and `shade`. */
export function toneOf(mix, shade, recipe) {
  let c = recipe.base;
  for (const [token, t] of recipe.steps ?? []) c = mix(c, token, t);
  return shade(c, recipe.shade ?? 1);
}

/** A variant's tones, each key's colour, through palette.js's `mix` and `shade`. */
export function variantTones(mix, shade, id) {
  const v = VARIANT_TONES[id];
  if (!v) throw new Error(`variantTones: no variant "${id}"`);
  return Object.fromEntries(Object.entries(v.tones).map(([k, r]) => [k, toneOf(mix, shade, r)]));
}
