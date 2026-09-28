import { describe, it, expect } from "vitest";
import { FACINGS, facingVector, yawFor } from "./facing.js";
import { VIEW_DIR } from "./projection.js";
import { DIRECTION_ORDER } from "../../../src/render/art/manifest";

// three.js: a y rotation by θ turns the model's forward (+z) to (sin θ, 0, cos θ).
const forwardAfter = (yaw) => [Math.sin(yaw), Math.cos(yaw)];

describe("bake facings", () => {
  it("bakes directions in exactly the order the client's manifest reads them", () => {
    expect(FACINGS).toEqual([...DIRECTION_ORDER]);
  });

  it("names world compass directions: n is world -y, e is world +x", () => {
    expect(facingVector("n")).toEqual([0, -1]);
    expect(facingVector("e")).toEqual([1, 0]);
    expect(facingVector("s")).toEqual([0, 1]);
    expect(facingVector("w")).toEqual([-1, 0]);
    const [x, y] = facingVector("ne");
    expect(x).toBeCloseTo(Math.SQRT1_2);
    expect(y).toBeCloseTo(-Math.SQRT1_2);
  });

  it("turns a model built facing +z (world +y, s) to face each direction", () => {
    for (const f of FACINGS) {
      const [fx, fz] = forwardAfter(yawFor(f));
      const [wx, wy] = facingVector(f);
      // three +x is world +x, three +z is world +y (projection.js)
      expect(fx).toBeCloseTo(wx);
      expect(fz).toBeCloseTo(wy);
    }
  });

  it("has se face the viewer: it points most directly at the bake camera", () => {
    const toward = (f) => {
      const [fx, fz] = forwardAfter(yawFor(f));
      return fx * VIEW_DIR[0] + fz * VIEW_DIR[2];
    };
    const best = [...FACINGS].sort((a, b) => toward(b) - toward(a))[0];
    expect(best).toBe("se");
    expect(toward("nw")).toBeLessThan(0);
  });

  it("runs clockwise as seen from above the map (y down)", () => {
    for (let i = 0; i < 8; i++) {
      const [ax, ay] = facingVector(FACINGS[i]);
      const [bx, by] = facingVector(FACINGS[(i + 1) % 8]);
      // with y pointing down, a clockwise turn has a positive cross product
      expect(ax * by - ay * bx).toBeGreaterThan(0);
    }
  });
});
