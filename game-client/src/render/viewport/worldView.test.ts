import { EventEmitter } from "eventemitter3";
import { describe, expect, it } from "vitest";
import { WORLD_ZOOM, viewRect, type ViewCamera } from "./camera";
import { fitGame } from "./game";
import { Viewport } from "./viewport";
import {
  HUD_DEPTH_FLOOR,
  drawnByHud,
  shareOut,
  zoomWorldView,
  type Drawn,
  type FadeState,
  type WorldViewScene,
} from "./worldView";

/** A camera as far as its fit goes: Phaser 4.2.1's display size is width ÷ zoom. */
function camera(id: number) {
  const fadeEffect: FadeState & Record<string, unknown> = {
    isRunning: false,
    isComplete: false,
    direction: true,
    progress: 0,
    red: 0,
    green: 0,
    blue: 0,
    alpha: 0,
  };
  const cam = {
    id,
    fadeEffect,
    width: 0,
    height: 0,
    zoomX: 1,
    originX: 0.5,
    scrollX: 0,
    scrollY: 0,
    roundPixels: true,
    renderRoundPixels: true,
    useBounds: false,
    get displayWidth() {
      return this.width / this.zoomX;
    },
    get displayHeight() {
      return this.height / this.zoomX;
    },
    setSize(w: number, h: number) {
      this.width = w;
      this.height = h;
    },
    setZoom(z: number) {
      this.zoomX = z;
    },
    setOrigin(x: number) {
      this.originX = x;
    },
    setBounds() {},
    setScroll(x: number, y: number) {
      this.scrollX = x;
      this.scrollY = y;
    },
    setFollowOffset() {},
    startFollow() {},
    clampX: (x: number) => x,
    clampY: (y: number) => y,
    preRender() {},
    getViewMatrix: () => ({ translate: () => undefined }),
    matrixCombined: { translate: () => undefined },
  };
  return cam;
}

/** A world scene: its main camera, the cameras it adds, its display list and its events. */
function worldScene(list: Drawn[] = []) {
  const events = new EventEmitter();
  const main = camera(1);
  const all = [main];
  const scene = {
    events,
    children: { list },
    cameras: {
      main,
      cameras: all,
      add(_x: number, _y: number, width: number, height: number) {
        const cam = camera(1 << all.length);
        cam.setSize(width, height);
        all.push(cam);
        return cam;
      },
    },
  };
  return { scene, main, all, frame: () => events.emit("prerender") };
}

const at = (width: number, renderScale: number) => {
  const v = new Viewport();
  v.set({ width, height: 720, renderScale });
  return v;
};

/** A game whose one started scene is `scene`, as `fitGame` drives it. */
function gameOf(scene: ReturnType<typeof worldScene>["scene"]) {
  return {
    scale: { resize: () => undefined, setZoom: () => undefined },
    scene: {
      getScenes: () => [
        {
          sys: { settings: { status: 5 } },
          cameras: scene.cameras as unknown as {
            main: ViewCamera;
            cameras: ViewCamera[];
          },
        },
      ],
    },
  };
}

const drawn = (
  scrollFactor: number,
  depth: number,
  cameraFilter = 0,
): Drawn => ({
  scrollFactorX: scrollFactor,
  scrollFactorY: scrollFactor,
  depth,
  cameraFilter,
});

describe("zoomWorldView (FS-ZAJMH § Change: Closer world camera: the world closer, the HUD unscaled)", () => {
  it.each([1, 1.25, 1.5, 2])(
    "should zoom the world camera by renderScale × WORLD_ZOOM and keep the HUD camera at the render scale, across a re-fit to %s",
    (rs) => {
      const { scene, main, all } = worldScene();
      const v = at(1080, 1);
      const hud = zoomWorldView(
        scene as unknown as WorldViewScene,
        WORLD_ZOOM,
        v,
      ) as unknown as ReturnType<typeof camera>;
      expect(all).toEqual([main, hud]);
      expect(main.zoomX).toBeCloseTo(WORLD_ZOOM, 10);
      expect(hud.zoomX).toBe(1);

      // a view change re-fits every camera of every started scene (fitGame), the HUD's with the world's
      fitGame(gameOf(scene), v);
      v.set({ width: 1280, height: 720, renderScale: rs });

      expect(main.zoomX).toBeCloseTo(rs * WORLD_ZOOM, 10);
      expect([main.width, main.height]).toEqual([1280 * rs, 720 * rs]);
      expect(viewRect(main).width).toBeCloseTo(1280 / WORLD_ZOOM, 10);
      expect(viewRect(main).height).toBeCloseTo(720 / WORLD_ZOOM, 10);
      // the HUD's camera: the logical view, unscaled, at origin 0 and never scrolled (§C, §D)
      expect(hud.zoomX).toBe(rs);
      expect([hud.width, hud.height, hud.originX]).toEqual([
        1280 * rs,
        720 * rs,
        0,
      ]);
      expect([hud.displayWidth, hud.displayHeight]).toEqual([1280, 720]);
      expect([hud.scrollX, hud.scrollY]).toEqual([0, 0]);
    },
  );

  it("should have the HUD's camera draw the camera-fixed HUD, and the world's camera everything else, each frame", () => {
    const hudPiece = drawn(0, 1000);
    const arrivalVeil = drawn(0, 960);
    const vignette = drawn(0, 905);
    const lightMap = drawn(0, 135);
    const marker = drawn(1, 950);
    const ground = drawn(1, -1);
    const { scene, main, frame } = worldScene([
      hudPiece,
      arrivalVeil,
      vignette,
      lightMap,
      marker,
      ground,
    ]);
    const hud = zoomWorldView(
      scene as unknown as WorldViewScene,
      WORLD_ZOOM,
      at(1080, 1),
    );
    frame();
    // Phaser's cameraFilter: a set bit is a camera that does not draw it
    for (const o of [hudPiece, arrivalVeil])
      expect(o.cameraFilter).toBe(main.id);
    for (const o of [vignette, lightMap, marker, ground])
      expect(o.cameraFilter).toBe(hud.id);
  });

  it("should move an object between the cameras as its scroll factor changes: the minimap from its corner to the overlay", () => {
    const minimap = drawn(0, 1000);
    const { scene, main, frame } = worldScene([minimap]);
    const hud = zoomWorldView(
      scene as unknown as WorldViewScene,
      WORLD_ZOOM,
      at(1080, 1),
    );
    frame();
    expect(minimap.cameraFilter).toBe(main.id);
    Object.assign(minimap, { scrollFactorX: 1, scrollFactorY: 1, depth: 920 });
    frame();
    expect(minimap.cameraFilter).toBe(hud.id);
  });

  it("should copy the world camera's fade onto the HUD's each frame: the curtain covers the HUD too (FS-C4JWH A1.5)", () => {
    const { scene, main, frame } = worldScene();
    const hud = zoomWorldView(
      scene as unknown as WorldViewScene,
      WORLD_ZOOM,
      at(1080, 1),
    );
    Object.assign(main.fadeEffect, {
      isRunning: true,
      direction: false,
      progress: 0.4,
      red: 20,
      green: 18,
      blue: 16,
      alpha: 0.6,
    });
    frame();
    expect(hud.fadeEffect).toEqual(main.fadeEffect);
    Object.assign(main.fadeEffect, {
      isRunning: false,
      isComplete: false,
      alpha: 0,
    });
    frame();
    expect(hud.fadeEffect).toEqual(main.fadeEffect);
  });

  it("should stop sharing the display list once the scene stops", () => {
    const piece = drawn(0, 1000);
    const { scene, frame } = worldScene([piece]);
    zoomWorldView(scene as unknown as WorldViewScene, WORLD_ZOOM, at(1080, 1));
    scene.events.emit("shutdown");
    piece.cameraFilter = 0;
    frame();
    expect(piece.cameraFilter).toBe(0);
  });
});

describe("shareOut", () => {
  it("should touch only the two cameras' bits of a filter", () => {
    const other = 8;
    const piece = drawn(0, 1000, other | 2);
    const prop = drawn(1, 100, other | 1);
    shareOut([piece, prop], { id: 1 }, { id: 2 });
    expect(piece.cameraFilter).toBe(other | 1);
    expect(prop.cameraFilter).toBe(other | 2);
  });

  it("should leave to the world an object with no scroll factor of its own (a Layer)", () => {
    expect(drawnByHud({ cameraFilter: 0, depth: 2000 })).toBe(false);
  });

  it.each([
    [0, HUD_DEPTH_FLOOR, true],
    [0, HUD_DEPTH_FLOOR - 1, false],
    [1, 2000, false],
  ])(
    "scroll factor %s at depth %s: drawn by the HUD's camera is %s",
    (sf, depth, hud) => {
      expect(drawnByHud(drawn(sf, depth))).toBe(hud);
    },
  );
});
