import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ADR-0098 (amending ADR-0094): the class book's pigments are read by the page-icon renderer and by the
 * book's own world effects through `palette.bookEffect`, and by nothing else. This holds the first half
 * of that line in the source: `palette.bookPigment` is named only where the roundels are drawn (and their
 * contact sheet in the dev gallery); every world effect reads its row of `palette.bookEffect`.
 */
const SRC = join(__dirname, "..");

const READERS = new Set(["ui/pageRoundel.ts", "dev/gallery/pageRoundelsSheet.ts"]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Code lines naming `palette.bookPigment`, comments left out. */
function reads(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .filter((line) => line.includes("palette.bookPigment"));
}

describe("who reads the book pigments (ADR-0098)", () => {
  it("should name palette.bookPigment only in the page roundel renderer and its contact sheet", () => {
    const readers = sources(SRC)
      .filter((path) => reads(path).length > 0)
      .map((path) => relative(SRC, path))
      .filter((path) => path !== "utils/canvasPalette.ts");
    expect(readers.filter((path) => !READERS.has(path))).toEqual([]);
  });
});
