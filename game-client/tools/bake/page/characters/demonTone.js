// The demons' hide recipes, kept as data with no imports so a unit test can hold each to its
// guideline clause without a browser. The green demon's (FS-Q14EV §B.4, green-hide clause): a
// dark, desaturated bog green, arcaneDeep pulled toward charcoal and slate, then shaded down,
// never the arcane token. The blood demon's (FS-VHGE7 §E R36, blood-hide clause): below.

export const DEMON_HIDE = {
  base: "arcaneDeep",
  steps: [
    ["charcoal", 0.4],
    ["slate", 0.25],
  ],
  shade: 0.9,
};

/**
 * The blood demon's hide: oxblood pulled toward charcoal and umber, then shaded down. A dark,
 * brown-black blood red, never oxblood as-is and never brighter or more saturated than it, so it
 * sits well below the knight's oxblood cloth and the ember eyes lift off it by value.
 */
export const DEMON_BLOOD_HIDE = {
  base: "oxblood",
  steps: [
    ["charcoal", 0.3],
    ["umber", 0.25],
  ],
  shade: 0.88,
};

/** The recipe's colour, through palette.js's `mix` and `shade`. */
export function hideTone(mix, shade, recipe = DEMON_HIDE) {
  let c = recipe.base;
  for (const [token, t] of recipe.steps) c = mix(c, token, t);
  return shade(c, recipe.shade);
}
