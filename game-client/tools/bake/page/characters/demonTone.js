// The demon's hide recipe (FS-Q14EV §B.4), kept as data with no imports so a unit test can hold
// it to the guideline's green-hide clause without a browser: a dark, desaturated bog green,
// arcaneDeep pulled toward charcoal and slate, then shaded down. Never the arcane token.

export const DEMON_HIDE = {
  base: "arcaneDeep",
  steps: [
    ["charcoal", 0.4],
    ["slate", 0.25],
  ],
  shade: 0.9,
};

/** The recipe's colour, through palette.js's `mix` and `shade`. */
export function hideTone(mix, shade, recipe = DEMON_HIDE) {
  let c = recipe.base;
  for (const [token, t] of recipe.steps) c = mix(c, token, t);
  return shade(c, recipe.shade);
}
