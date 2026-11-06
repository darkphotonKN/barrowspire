import { afterEach, describe, expect, it } from "vitest";
import type Phaser from "phaser";
import { drawingStage } from "@/render/art/artLoader.standin";
import { viewport } from "@/render/viewport";
import { drawTorchBar } from "./torchBar";

/** A scene's stage with nothing on it, its camera `width` backing px wide at zoom 1. */
function emptyStage(width = 1080) {
  const textures = { exists: () => false, addImage: () => undefined, createCanvas: () => null };
  const stage = drawingStage(textures);
  stage.camera.width = width;
  const scene = { add: stage.add, cameras: { main: stage.camera }, events: stage.events, textures };
  return { stage, scene: scene as unknown as Phaser.Scene };
}

const texts = (stage: ReturnType<typeof drawingStage>) =>
  stage.drawn.filter((d) => d.kind === "text").map((d) => d.args[2]);

describe("the torch bar (FS-C4JWH §D R17–R18)", () => {
  afterEach(() => {
    viewport.set({ width: 1080, height: 720, renderScale: 1 });
  });

  it("should draw the boot screen: backdrop, torch pool, trough, bar and both lines", () => {
    const { stage, scene } = emptyStage();

    drawTorchBar(scene);

    expect(stage.drawn.map((d) => d.kind)).toEqual(["graphics", "image", "image", "graphics", "graphics", "text", "text"]);
    expect(texts(stage)).toEqual(["LIGHTING THE TORCH", "THE SPIRE IS WAITING"]);
  });

  it("should lay itself out on the stage, centred in a wider view", () => {
    const { stage, scene } = emptyStage(1280);

    drawTorchBar(scene);

    expect([stage.camera.scrollX, stage.camera.scrollY]).toEqual([-100, 0]);
  });

  it("should fill the bar as the load goes", () => {
    const { stage, scene } = emptyStage();
    const bar = drawTorchBar(scene);
    const fill = stage.drawn[4];

    bar.progress(0.5);

    expect(fill.calls).toContain("fillRect(384, 352, 156, 16)");
  });

  it("should destroy everything it drew, and let the stage go, on destroy", () => {
    const { stage, scene } = emptyStage(1280);
    const bar = drawTorchBar(scene);

    bar.destroy();

    expect(stage.drawn.every((d) => d.destroyed)).toBe(true);
    expect([stage.camera.scrollX, stage.camera.scrollY]).toEqual([0, 0]);
  });

  it("should stop sizing the vignette to the view once destroyed", () => {
    const { stage, scene } = emptyStage();
    const bar = drawTorchBar(scene);
    const vignette = stage.drawn[1];
    bar.destroy();
    const calls = vignette.calls.length;

    viewport.set({ width: 1280, height: 720, renderScale: 1 });

    expect(vignette.calls.length).toBe(calls);
  });

  it("should keep the backdrop and the pool, as the boot screen does, on destroyBar", () => {
    const { stage, scene } = emptyStage();
    const bar = drawTorchBar(scene);

    bar.destroyBar();

    expect(stage.drawn.map((d) => d.destroyed)).toEqual([false, false, false, true, true, true, true]);
  });
});
