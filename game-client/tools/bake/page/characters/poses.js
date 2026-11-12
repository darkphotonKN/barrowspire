// A character sheet's poses as the bake takes them (page/main.js): built once on its rig, every key
// frame of every clip with its secondary motion simulated per clip, and each palette variant
// re-dressing the same rig. No rendering, so the Node tests pose a sheet exactly as the bake does
// (the leg-clearance guard on the folk, clearance.js).

import { FACINGS } from "../facing.js";
import { ANIMATIONS, applyPose, clipsFor, groundPose, simulateSprings } from "./clips.js";

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
    // walk_attack and backpedal_attack (a class's attack on the move) carry their cloth with the
    // legs and calm the shot's fling like the attack; the walk_attack's cloth walks like the walk,
    // a run or backpedal_attack names how fast it carries the cloth (characters/clips.js
    // RUN_ANIMATIONS, BACKPEDAL_ATTACK_SPEED), in walks
    const carried = spec.speed ?? (anim === "walk" || anim === "walk_attack" ? 1 : 0);
    springs[anim] = simulateSprings(rig, frames, {
      ...spec,
      speed: carried * (style.speed ?? 1),
      settle: anim === "death",
      calm: anim === "attack" || anim === "parry" || anim === "walk_attack" || anim === "backpedal_attack" ? 0.25 : 1,
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
          // a clip `boxed` into the frame the others set (a class's walk_attack) never widens it
          sizing: !spec.boxed,
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
