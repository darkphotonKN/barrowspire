// FIXTURE — must be REJECTED by the cursor fence (FS-KYPQ9 § Change: Every hover keeps the bone hand,
// The pressed hand P7, P10): an interactive object with a cursor of its own, and a write of the
// canvas's cursor outside the pointer look. Not compiled, not imported. lint-fence.sh asserts both.
declare const zone: { setInteractive(config: object): void; input: { cursor: string } };
declare const game: { canvas: { style: { cursor: string } }; input: { setDefaultCursor(css: string): void } };
zone.setInteractive({ useHandCursor: true });
zone.setInteractive({ cursor: "pointer" });
zone.input.cursor = "pointer";
game.canvas.style.cursor = "pointer";
game.input.setDefaultCursor("pointer");
