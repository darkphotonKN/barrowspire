import { describe, expect, it } from "vitest";
import {
  STAGE_WIDTH,
  boundCamera,
  centreStage,
  fitCamera,
  followWith,
  onGrid,
  roundsPixels,
  stagePoint,
  viewRect,
  type ViewCamera,
} from "./camera";
import { Viewport } from "./viewport";

/**
 * A camera that does Phaser 3.90's arithmetic where it matters here: display size is
 * width ÷ zoom, `clampX/Y` assume origin 0.5, `startFollow` snaps with the origin-0.5 half
 * width, and `preRender` lerps scroll toward a followed target, floors it under roundPixels and
 * drops rounding at a fractional zoom. `lerp` 1 is a settled follow: straight onto the target.
 */
function fakeCamera(width = 1080, height = 720) {
  const cam = {
    width,
    height,
    zoomX: 1,
    originX: 0.5,
    scrollX: 0,
    scrollY: 0,
    roundPixels: true,
    renderRoundPixels: true,
    useBounds: false,
    lerp: 1,
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    follow: undefined as { x: number; y: number } | undefined,
    followOffset: { x: 0, y: 0 },
    get displayWidth() {
      return this.width / this.zoomX;
    },
    get displayHeight() {
      return this.height / this.zoomX;
    },
    setSize(w: number, h: number) {
      this.width = w;
      this.height = h;
      return this;
    },
    setZoom(z: number) {
      this.zoomX = z;
      return this;
    },
    setOrigin(x: number) {
      this.originX = x;
      return this;
    },
    setBounds(x: number, y: number, w: number, h: number) {
      this.bounds = { x, y, width: w, height: h };
      this.useBounds = true;
      return this;
    },
    setScroll(x: number, y: number) {
      this.scrollX = x;
      this.scrollY = y;
      return this;
    },
    setFollowOffset(x: number, y: number) {
      this.followOffset = { x, y };
      return this;
    },
    startFollow(
      t: { x: number; y: number },
      round: boolean,
      _lx: number,
      _ly: number,
      ox: number,
      oy: number,
    ) {
      this.follow = t;
      this.roundPixels = round;
      this.followOffset = { x: ox, y: oy };
      // Phaser's snap: the origin-0.5 half width, whatever the origin
      this.scrollX = t.x - ox - this.width / 2;
      this.scrollY = t.y - oy - this.height / 2;
      return this;
    },
    clampX(x: number) {
      const bx = this.bounds.x + (this.displayWidth - this.width) / 2;
      const bw = Math.max(bx, bx + this.bounds.width - this.displayWidth);
      return Math.min(Math.max(x, bx), bw);
    },
    clampY(y: number) {
      const by = this.bounds.y + (this.displayHeight - this.height) / 2;
      const bh = Math.max(by, by + this.bounds.height - this.displayHeight);
      return Math.min(Math.max(y, by), bh);
    },
    preRender() {
      this.renderRoundPixels = this.roundPixels && Number.isInteger(this.zoomX);
      let sx = this.scrollX;
      let sy = this.scrollY;
      if (this.follow) {
        const fx =
          this.follow.x - this.followOffset.x - this.width * this.originX;
        const fy =
          this.follow.y - this.followOffset.y - this.height * this.originX;
        sx += (fx - sx) * this.lerp;
        sy += (fy - sy) * this.lerp;
      }
      if (this.roundPixels) {
        sx = Math.floor(sx);
        sy = Math.floor(sy);
      }
      if (this.useBounds) {
        sx = this.clampX(sx);
        sy = this.clampY(sy);
      }
      this.scrollX = sx;
      this.scrollY = sy;
    },
  };
  return cam;
}

const at = (renderScale: number) => {
  const v = new Viewport();
  v.set({ width: 1080, height: 720, renderScale });
  return v;
};

describe("fitCamera (FS-ZAJMH R2: one camera per scene, zoomed by the render scale, origin 0)", () => {
  it.each([
    [1, 1080, 720],
    [1.5, 1620, 1080],
    [2, 2160, 1440],
  ])(
    "should size the camera to the backing store at render scale %s and show 1080×720 logical units",
    (rs, w, h) => {
      const cam = fakeCamera();
      fitCamera(cam as ViewCamera, at(rs));
      expect([cam.width, cam.height, cam.zoomX, cam.originX]).toEqual([
        w,
        h,
        rs,
        0,
      ]);
      expect([cam.displayWidth, cam.displayHeight]).toEqual([1080, 720]);
    },
  );
});

describe("boundCamera (world bounds hold under origin 0)", () => {
  it.each([1, 1.5, 2])(
    "should stop the view at the world's corners at render scale %s",
    (rs) => {
      const cam = fakeCamera();
      fitCamera(cam as ViewCamera, at(rs));
      boundCamera(cam as ViewCamera, {
        x: -1000,
        y: -200,
        width: 2400,
        height: 1200,
      });
      cam.setScroll(-5000, -5000).preRender();
      expect(viewRect(cam as ViewCamera)).toEqual({
        x: -1000,
        y: -200,
        width: 1080,
        height: 720,
      });
      cam.setScroll(5000, 5000).preRender();
      expect(viewRect(cam as ViewCamera)).toEqual({
        x: 1400 - 1080,
        y: 1000 - 720,
        width: 1080,
        height: 720,
      });
    },
  );

  it("should keep holding the world's bounds after a re-fit to another render scale", () => {
    const cam = fakeCamera();
    const v = at(1);
    fitCamera(cam as ViewCamera, v);
    boundCamera(cam as ViewCamera, { x: 0, y: 0, width: 2400, height: 1200 });
    v.set({ width: 1080, height: 720, renderScale: 2 });
    fitCamera(cam as ViewCamera, v);
    cam.setScroll(-50, -50).preRender();
    expect([cam.scrollX, cam.scrollY]).toEqual([0, 0]);
  });
});

describe("followWith (camera follow stays centred under origin 0)", () => {
  it.each([1, 1.25, 1.5, 2])(
    "should put the target in the middle of the view at render scale %s, from the first frame",
    (rs) => {
      const cam = fakeCamera();
      fitCamera(cam as ViewCamera, at(rs));
      boundCamera(cam as ViewCamera, {
        x: -2000,
        y: -2000,
        width: 6000,
        height: 6000,
      });
      followWith(cam as ViewCamera, { x: 1280, y: 720 });
      // Phaser's own snap would have landed a whole view off; the first frame is already centred
      expect([cam.scrollX + 540, cam.scrollY + 360]).toEqual([1280, 720]);
      cam.preRender();
      expect([cam.scrollX + 540, cam.scrollY + 360]).toEqual([1280, 720]);
      expect(cam.renderRoundPixels).toBe(true);
      expect(roundsPixels(cam)).toBe(true);
    },
  );

  // FS-ZAJMH R4, A1: Phaser's whole-unit floor would throw away a lerp step smaller than a unit,
  // and snapping that onto the 1/rs grid again could land back where the camera was
  it.each([1.25, 1.5])(
    "should move every frame while the target walks left and up at render scale %s, on the grid all along",
    (rs) => {
      const cam = fakeCamera();
      fitCamera(cam as ViewCamera, at(rs));
      const target = { x: 3000, y: 2000 };
      followWith(cam as ViewCamera, target);
      cam.lerp = 0.1;
      let { scrollX: x, scrollY: y } = cam;
      for (let frame = 0; frame < 120; frame++) {
        target.x -= 1.5;
        target.y -= 1;
        cam.preRender();
        expect(cam.scrollX).toBeLessThan(x);
        expect(cam.scrollY).toBeLessThan(y);
        for (const s of [cam.scrollX, cam.scrollY])
          expect(Math.abs(s * rs - Math.round(s * rs))).toBeLessThan(1e-9);
        ({ scrollX: x, scrollY: y } = cam);
      }
    },
  );

  it.each([1.25, 1.5])(
    "should move every frame while the target walks right and down at render scale %s",
    (rs) => {
      const cam = fakeCamera();
      fitCamera(cam as ViewCamera, at(rs));
      const target = { x: 3000, y: 2000 };
      followWith(cam as ViewCamera, target);
      cam.lerp = 0.1;
      let { scrollX: x, scrollY: y } = cam;
      for (let frame = 0; frame < 120; frame++) {
        target.x += 1.5;
        target.y += 1.5;
        cam.preRender();
        if (frame > 20) {
          expect(cam.scrollX).toBeGreaterThan(x);
          expect(cam.scrollY).toBeGreaterThan(y);
        }
        ({ scrollX: x, scrollY: y } = cam);
      }
    },
  );

  it.each([1.25, 1.5, 2])(
    "should hold still once the target stops at render scale %s",
    (rs) => {
      const cam = fakeCamera();
      fitCamera(cam as ViewCamera, at(rs));
      const target = { x: 3000.3, y: 2000.7 };
      followWith(cam as ViewCamera, target);
      cam.lerp = 0.1;
      for (let frame = 0; frame < 300; frame++) cam.preRender();
      const still = [cam.scrollX, cam.scrollY];
      for (let frame = 0; frame < 60; frame++) cam.preRender();
      expect([cam.scrollX, cam.scrollY]).toEqual(still);
    },
  );
});

describe("the pixel grid (FS-ZAJMH R4: roundPixels stays on at a fractional render scale)", () => {
  it.each([1.25, 1.5, 1.75])(
    "should keep the camera's px rounding on at render scale %s, which Phaser 3.90 turns off",
    (rs) => {
      const cam = fakeCamera();
      fitCamera(cam as ViewCamera, at(rs));
      cam.preRender();
      expect(cam.renderRoundPixels).toBe(true);
    },
  );

  it.each([1.25, 1.5, 1.75, 2])(
    "should scroll only by whole backing px at render scale %s, so a still world never shimmers as the camera moves",
    (rs) => {
      const cam = fakeCamera();
      fitCamera(cam as ViewCamera, at(rs));
      for (const x of [0, 1, 3, 7.4, 11, 12.9, 101]) {
        cam.setScroll(x, x + 1).preRender();
        expect(
          Math.abs(cam.scrollX * rs - Math.round(cam.scrollX * rs)),
        ).toBeLessThan(1e-9);
        expect(
          Math.abs(cam.scrollY * rs - Math.round(cam.scrollY * rs)),
        ).toBeLessThan(1e-9);
      }
    },
  );

  it("should leave render scale 1 exactly as today: whole-unit scroll, rounding on", () => {
    const cam = fakeCamera();
    fitCamera(cam as ViewCamera, at(1));
    cam.setScroll(10.7, 3.2).preRender();
    expect([cam.scrollX, cam.scrollY, cam.renderRoundPixels]).toEqual([
      10,
      3,
      true,
    ]);
  });

  it("should leave a camera whose game asked for no rounding unrounded", () => {
    const cam = fakeCamera();
    cam.roundPixels = false;
    fitCamera(cam as ViewCamera, at(1.5));
    cam.setScroll(10.7, 3.2).preRender();
    expect([cam.scrollX, cam.scrollY, cam.renderRoundPixels]).toEqual([
      10.7,
      3.2,
      false,
    ]);
  });

  it("should wrap a camera's frame once however often it is re-fitted", () => {
    const cam = fakeCamera();
    const v = at(1.5);
    fitCamera(cam as ViewCamera, v);
    const wrapped = cam.preRender;
    fitCamera(cam as ViewCamera, v);
    expect(cam.preRender).toBe(wrapped);
  });
});

describe("onGrid", () => {
  it("should floor to the 1/rs step, keep a value already on it, and stay inside a clamp", () => {
    expect(onGrid(1, 1.5)).toBeCloseTo(2 / 3);
    expect(onGrid(2, 1.5)).toBe(2);
    // float error is not a step: 4/3 stays 4/3 however it was reached
    expect(onGrid(onGrid(1.4, 1.5), 1.5)).toBeCloseTo(4 / 3);
    expect(onGrid(((4 / 3) * 1.5) / 1.5 - 1e-12, 1.5)).toBeCloseTo(4 / 3);
    // the clamp says at least 1: the next step up, not the nearest
    expect(onGrid(0.9, 1.5, (v) => Math.max(v, 1))).toBeCloseTo(4 / 3);
    // at most 10.1: the step below
    expect(onGrid(11, 1.5, (v) => Math.min(v, 10.1))).toBe(10);
  });
});

const view = (width: number, renderScale: number) => {
  const v = new Viewport();
  v.set({ width, height: 720, renderScale });
  return v;
};

describe("a re-fit to another logical width (FS-ZAJMH R11: follow and bounds hold)", () => {
  it.each([1, 1.5, 2])(
    "should keep the followed target centred and the bounds held from 1080 to 1280 wide at render scale %s",
    (rs) => {
      const cam = fakeCamera();
      fitCamera(cam as ViewCamera, view(1080, rs));
      boundCamera(cam as ViewCamera, { x: 0, y: 0, width: 2400, height: 1200 });
      const target = { x: 1200, y: 600 };
      followWith(cam as ViewCamera, target);
      cam.preRender();
      expect(viewRect(cam)).toEqual({
        x: 660,
        y: 240,
        width: 1080,
        height: 720,
      });

      fitCamera(cam as ViewCamera, view(1280, rs));
      cam.preRender();
      expect(viewRect(cam)).toEqual({
        x: 560,
        y: 240,
        width: 1280,
        height: 720,
      });

      // near the world's right edge the wider view is held inside it
      target.x = 2300;
      cam.preRender();
      expect(cam.scrollX + cam.displayWidth).toBeCloseTo(2400);
    },
  );

  it("should keep the scroll on the 1/rs grid after a width change at a fractional render scale (R4)", () => {
    const cam = fakeCamera();
    fitCamera(cam as ViewCamera, view(1080, 1.5));
    followWith(cam as ViewCamera, { x: 1000.3, y: 500.7 });
    fitCamera(cam as ViewCamera, view(1153, 1.5));
    cam.preRender();
    expect(Number.isInteger(Math.round(cam.scrollX * 1.5 * 1e9) / 1e9)).toBe(
      true,
    );
    expect(Number.isInteger(Math.round(cam.scrollY * 1.5 * 1e9) / 1e9)).toBe(
      true,
    );
    expect(cam.renderRoundPixels).toBe(true);
  });
});

describe("centreStage (FS-ZAJMH R11: a canvas menu, laid out 1080 wide, centred in any view)", () => {
  it.each([
    [1080, 0],
    [1152, -36],
    [1280, -100],
  ])(
    "should centre the stage in a view %s wide by scrolling to %s",
    (width, scrollX) => {
      const cam = fakeCamera();
      fitCamera(cam as ViewCamera, view(1080, 2));
      centreStage(cam as ViewCamera);
      fitCamera(cam as ViewCamera, view(width, 2));
      expect([cam.scrollX, cam.scrollY]).toEqual([scrollX, 0]);
      expect(STAGE_WIDTH).toBe(1080);
    },
  );

  it("should map a pointer to the stage the menu is laid out on, at any render scale", () => {
    const cam = fakeCamera();
    const v = view(1280, 2);
    fitCamera(cam as ViewCamera, v);
    centreStage(cam as ViewCamera);
    // backing px (200, 100) is logical (100, 50): 100 left of the stage's own left edge plus 100
    expect(stagePoint(cam, { x: 200, y: 100 }, v)).toEqual({ x: 0, y: 50 });
  });
});
