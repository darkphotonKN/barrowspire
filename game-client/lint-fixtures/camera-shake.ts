// FIXTURE — must be REJECTED by the motion fence (FS-KYPQ9 §B.5, §B.6): a camera shake outside the
// lore line's tremor, and an emitter's radial explode. Not compiled, not imported.
declare const camera: { shake(ms: number, intensity: number): void };
declare const emitter: { explode(count: number): void };
camera.shake(200, 0.01);
emitter.explode(30);
