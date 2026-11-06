import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BustStage } from "./bustPortrait";

/** A 2d context whose every pixel is opaque: the figure fills the frame. */
function opaqueCanvas() {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: () => undefined,
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }),
    }),
  };
  return canvas;
}

/** A stage whose texture manager has the frame only once `loaded` says so. */
function stage(loaded: () => boolean) {
  const frame = { realWidth: 40, realHeight: 60, cutX: 0, cutY: 0, cutWidth: 40, cutHeight: 60, x: 0, y: 0, source: { image: {} } };
  const chain: Record<string, unknown> = new Proxy({}, { get: () => () => chain });
  return {
    add: { image: vi.fn(() => chain) },
    textures: { getFrame: () => (loaded() ? frame : null) },
  } as unknown as BustStage;
}

describe("a bust cut from a frame that was not loaded yet (FS-C4JWH Edge States: a failed folk download)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => opaqueCanvas() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should draw the bust once the frame is there, though an earlier ask found none", async () => {
    const { maskedBust } = await import("./bustPortrait");
    let loaded = false;
    const scene = stage(() => loaded);

    expect(maskedBust(scene, { texture: "art:folk-0", frame: "folk_quartermaster/idle/4/0" }, 0, 0, 20)).toBeUndefined();
    loaded = true;

    expect(maskedBust(scene, { texture: "art:folk-0", frame: "folk_quartermaster/idle/4/0" }, 0, 0, 20)).toBeDefined();
  });
});
