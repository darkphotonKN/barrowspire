/**
 * The run's pace, as the server sets it (FS-TAGWA R9, ADR-0099): every travel speed in game-service
 * is its full-pace figure times one scale, `PaceScale` in
 * game-server/game-service/common/constants/game.go, the one knob.
 *
 * `pace.golden.json` is written by the Go test that holds the constants to it
 * (internal/systems/pace_test.go, `go test ./internal/systems -run TestPaceGolden -update`) and is
 * never hand-edited. The client keeps no copy of a server speed: what it needs is read from here,
 * so a pace tweak on the server re-paces the client with no edit. Bodies themselves move as the
 * snapshot says; this is for what the client draws on its own (a block's slide) and what it shows
 * (the class card's Speed).
 */
import golden from "./pace.golden.json";

/** The scale every travel speed is its full-pace figure times. */
export const PACE_SCALE: number = golden.paceScale;

/** A delver's walk with no gear, world px/s: the server's `DefaultSpeed`. */
export const BASE_MOVE_SPEED: number = golden.defaultSpeed;

/** The share of a delver's walk a pushed stone block slides at (FS-5FZ4J §C R19). */
export const BLOCK_PUSH_SPEED_SHARE: number = golden.blockPushSpeedShare;

/** A full-pace figure (a speed as it stood before the pace) at the pace. */
export function paced(fullPace: number): number {
  return fullPace * PACE_SCALE;
}
