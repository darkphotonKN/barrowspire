// The warrior's specialization looks (FS-1J1CB §A R1–R2): the Guardian and the Berserker, each the
// knight re-dressed on his own rig, build and clips (cast.js `knight(look)`, look.js).

import { inHand, beardedAxe } from "./gear.js";

/** The Berserker (R2). */
export const berserker = {
  omit: ["shield"],
  swap: { weapon: (rig, { M, F }) => inHand(rig, "R").add(beardedAxe(rig, M, F)) },
  add: (rig, { M, F }) => inHand(rig, "L").add(beardedAxe(rig, M, F)),
};
