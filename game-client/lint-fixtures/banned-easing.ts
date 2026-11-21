// FIXTURE — must be REJECTED by the motion fence (FS-KYPQ9 §B.3): an effect eased with Back and
// Elastic. Not compiled, not imported. lint-fence.sh asserts the rule rejects it.
declare const Phaser: { Math: { Easing: { Elastic: { Out: unknown } } } };
export const bad = [{ ease: "Back.easeOut" }, { ease: Phaser.Math.Easing.Elastic.Out }];
