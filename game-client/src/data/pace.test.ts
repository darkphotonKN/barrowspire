import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import golden from "./pace.golden.json";
import { BASE_MOVE_SPEED, BLOCK_PUSH_SPEED_SHARE, PACE_SCALE, paced } from "./pace";

/** FS-TAGWA R9, ADR-0099: the client's pace is the server's, read from the golden its Go test writes. */
describe("pace (FS-TAGWA R9)", () => {
  it("should be the golden's numbers, with no literal of its own", () => {
    expect(PACE_SCALE).toBe(golden.paceScale);
    expect(BASE_MOVE_SPEED).toBe(golden.defaultSpeed);
    expect(BLOCK_PUSH_SPEED_SHARE).toBe(golden.blockPushSpeedShare);
    const source = readFileSync(new URL("./pace.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/=\s*\d/);
  });

  it("should put the base walk at its full-pace 200 times the scale", () => {
    expect(BASE_MOVE_SPEED).toBeCloseTo(200 * PACE_SCALE);
  });

  it("should pace a full-pace figure by the scale", () => {
    expect(paced(220)).toBeCloseTo(220 * golden.paceScale);
  });
});
