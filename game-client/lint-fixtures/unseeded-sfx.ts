// FIXTURE — must be REJECTED as src/audio/gameplaySfx.ts would be (FS-AND39 R9): a sound generator
// that reaches for Phaser and draws from Math.random. Not compiled, not imported.
import * as Phaser from "phaser";
export const bad = [Phaser, Math.random()];
