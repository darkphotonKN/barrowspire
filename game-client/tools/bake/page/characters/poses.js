// A character sheet's poses as the bake takes them (page/main.js): built once on its rig, every key
// frame of every clip with its secondary motion simulated per clip, and each palette variant
// re-dressing the same rig. No rendering, so the Node tests pose a sheet exactly as the bake does
// (the leg-clearance guard on the folk, clearance.js).

import { FACINGS } from "../facing.js";
import { ANIMATIONS, applyPose, clipsFor, groundPose, handless, simulateSprings } from "./clips.js";

/** A character sheet's rig and every pose it bakes (clip, frame, how to apply it), in bake order. */
export function characterPoses(sheet) {
  const { rig, style, variants = [{ name: null, dress: () => {} }] } = sheet.build();
  const specs = sheet.animations ?? ANIMATIONS;
  const clips = clipsFor(style, specs);
  const poses = [];
  const animations = {};
  const springs = {};
  for (const [anim, spec] of Object.entries(specs)) {
    const frames = clips[anim];
    if (frames.length !== spec.frames) throw new Error(`bake: ${sheet.name} ${anim} has ${frames.length} frames, not ${spec.frames}`);
    // the walk carries its cloth as a walk, a run names how fast it carries it (characters/clips.js
    // RUN_ANIMATIONS), in walks, and the attack and the parry calm the swing's fling; an off-hand
    // attack (FS-1J1CB R28) carries its cloth as its right-hand clip does
    const clip = handless(anim);
    const carried = spec.speed ?? (clip === "walk" ? 1 : 0);
    springs[anim] = simulateSprings(rig, frames, {
      ...spec,
      speed: carried * (style.speed ?? 1),
      settle: clip === "death",
      calm: clip === "attack" || clip === "parry" ? 0.25 : 1,
    });
  }
  // A palette variant (a hub resident's) re-dresses the same rig and poses: its clips follow the
  // first palette's as `<anim>_<palette>` (src/render/art/hubFolk.ts reads them so).
  variants.forEach((variant, v) => {
    for (const [anim, spec] of Object.entries(specs)) {
      const frames = clips[anim];
      const name = v === 0 ? anim : `${anim}_${variant.name}`;
      animations[name] = { fps: spec.fps, loop: spec.loop, frames: FACINGS.map(() => []) };
      frames.forEach((p, i) =>
        poses.push({
          anim: name,
          i,
          apply: () => {
            variant.dress();
            applyPose(rig, p, springs[anim][i]);
            groundPose(rig);
            for (const hook of rig.hooks ?? []) hook(rig, p);
          },
        }),
      );
    }
  });
  return { rig, poses, animations };
}
