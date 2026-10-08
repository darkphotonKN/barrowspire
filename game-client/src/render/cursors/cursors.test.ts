import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ArtLibrary } from "@/render/art/library";
import type { ArtManifest } from "@/render/art/manifest";
import { cursorCss, cursorSource, type CursorSource } from "./cursors";

const baked: ArtManifest = JSON.parse(
  readFileSync(join(__dirname, "../../../public/art/manifest.json"), "utf8"),
);

const quiet = { warn: () => {} };

/** A source over the baked manifest whose images come out at `scale` times the frame. */
function sourceAt(scale: number, manifest: ArtManifest = baked): CursorSource {
  return {
    sheet: (name) => manifest.sheets[name],
    image: (name) => {
      const s = manifest.sheets[name];
      return s
        ? {
            url: `data:image/png;base64,${name}`,
            width: s.frameWidth * scale,
            height: s.frameHeight * scale,
          }
        : undefined;
    },
  };
}

/** The `x y` hotspot out of a CSS cursor value. */
function hotspot(css: string): [number, number] {
  const m = css.match(/^url\((.+)\) (\d+) (\d+), (\w+)$/);
  expect(m, css).not.toBeNull();
  return [Number(m![2]), Number(m![3])];
}

describe("cursorCss (FS-KYPQ9 §H.2)", () => {
  it("puts the image url first and the browser fallback last", () => {
    expect(cursorCss("cursor_gauntlet", "default", sourceAt(1))).toMatch(
      /^url\(data:image\/png;base64,cursor_gauntlet\) \d+ \d+, default$/,
    );
    expect(cursorCss("cursor_strike", "crosshair", sourceAt(1))).toMatch(
      /, crosshair$/,
    );
  });

  it.each([
    ["cursor_gauntlet", "default"],
    ["cursor_strike", "crosshair"],
  ] as const)(
    "takes %s's hotspot from its manifest anchor, scaled to the emitted image",
    (name, fallback) => {
      const { anchor, frameWidth, frameHeight } = baked.sheets[name];
      for (const scale of [1, 2]) {
        expect(hotspot(cursorCss(name, fallback, sourceAt(scale)))).toEqual([
          Math.round(anchor.x * frameWidth * scale),
          Math.round(anchor.y * frameHeight * scale),
        ]);
      }
    },
  );

  it("keeps the click point where the art puts it: fingertip and centre", () => {
    expect(hotspot(cursorCss("cursor_gauntlet", "default", sourceAt(1)))).toEqual(
      [7, 1],
    );
    expect(hotspot(cursorCss("cursor_strike", "crosshair", sourceAt(1)))).toEqual(
      [16, 16],
    );
  });

  it("keeps the hotspot inside the image even for an anchor on the far edge", () => {
    const edge: ArtManifest = structuredClone(baked);
    edge.sheets.cursor_strike.anchor = { x: 1, y: 1 };
    expect(hotspot(cursorCss("cursor_strike", "crosshair", sourceAt(1, edge)))).toEqual(
      [31, 31],
    );
  });

  it.each(["default", "crosshair"] as const)(
    "returns exactly %s with no manifest",
    (fallback) => {
      expect(cursorCss("cursor_gauntlet", fallback, null)).toBe(fallback);
      expect(cursorCss("cursor_gauntlet", fallback, undefined)).toBe(fallback);
      const empty = cursorSource(ArtLibrary.empty(quiet), {
        getBase64: () => "data:image/png;base64,x",
      });
      expect(cursorCss("cursor_gauntlet", fallback, empty)).toBe(fallback);
    },
  );

  it.each(["default", "crosshair"] as const)(
    "returns exactly %s when the sheet is missing",
    (fallback) => {
      expect(cursorCss("cursor_missing", fallback, sourceAt(1))).toBe(fallback);
    },
  );

  it("returns the fallback when the sheet has no image (its atlas did not load)", () => {
    const noImage: CursorSource = { ...sourceAt(1), image: () => undefined };
    expect(cursorCss("cursor_strike", "crosshair", noImage)).toBe("crosshair");
  });
});

describe("cursorSource: the frame cropped from the loaded atlas", () => {
  const library = (loaded?: Set<string>) => new ArtLibrary(baked, quiet, loaded);

  it("crops the sheet's frame from its atlas texture, at the frame's size", () => {
    const getBase64 = vi.fn(() => "data:image/png;base64,AAAA");
    const source = cursorSource(library(), { getBase64 });
    const s = baked.sheets.cursor_gauntlet;
    expect(source.image("cursor_gauntlet")).toEqual({
      url: "data:image/png;base64,AAAA",
      width: s.frameWidth,
      height: s.frameHeight,
    });
    expect(getBase64).toHaveBeenCalledWith(
      `art:${s.atlas}`,
      "cursor_gauntlet/default/0/0",
    );
  });

  it("has no image when the atlas did not load", () => {
    const getBase64 = vi.fn(() => "data:image/png;base64,AAAA");
    const source = cursorSource(library(new Set()), { getBase64 });
    expect(source.sheet("cursor_gauntlet")).toBeUndefined();
    expect(source.image("cursor_gauntlet")).toBeUndefined();
    expect(cursorCss("cursor_gauntlet", "default", source)).toBe("default");
    expect(getBase64).not.toHaveBeenCalled();
  });

  it("has no image when the texture cannot be read back", () => {
    const source = cursorSource(library(), { getBase64: () => "" });
    expect(source.image("cursor_strike")).toBeUndefined();
    expect(cursorCss("cursor_strike", "crosshair", source)).toBe("crosshair");
  });
});
