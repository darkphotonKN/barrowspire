/**
 * "No silly animations", scanned in source (FS-KYPQ9 §B.3, §B.5, §B.6): no Bounce, Elastic or
 * Back easing, no camera shake and no radial explode, in the effects module or in either scene's
 * effect call sites. The table rules live in `table.test.ts`; this catches what a scene writes
 * around the table.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..");

/** Source files under a directory, tests excluded (they name the banned strings on purpose). */
function sourcesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const path = join(dir, d.name);
    if (d.isDirectory()) return sourcesIn(path);
    return /\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name)
      ? [path]
      : [];
  });
}

/** An easing given as a string (`"Back.easeOut"`, `'Bounce'`) or through `Easing.Elastic`. */
const BANNED_EASING =
  /["'`](?:Bounce|Elastic|Back)(?:\.\w+)?["'`]|Easing\.(?:Bounce|Elastic|Back)\b/;
const SHAKE = /\.shake\(/;
const EXPLODE = /explode\(/;

const banned = { easing: BANNED_EASING, shake: SHAKE, explode: EXPLODE };

/** The lines a pattern matches, as `file:line` for a readable failure. */
function hits(file: string, pattern: RegExp): string[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, i) =>
      pattern.test(line)
        ? [`${relative(SRC, file)}:${i + 1}: ${line.trim()}`]
        : [],
    );
}

describe("source scan detectors (the scan can fail)", () => {
  it.each([
    ["easing", 'ease: "Back.easeOut",'],
    ["easing", "ease: 'Bounce',"],
    ["easing", "ease: Phaser.Math.Easing.Elastic.Out,"],
    ["shake", "this.cameras.main.shake(200, 0.01);"],
    ["explode", "emitter.explode(30);"],
  ] as const)("should flag %s in %s", (rule, line) => {
    expect(banned[rule].test(line)).toBe(true);
  });

  it.each([
    'ease: "Quad.easeOut",',
    "// No Bounce, Elastic or Back easing (§B.3).",
    'ease: "Sine.easeInOut",',
  ])("should pass %s", (line) => {
    for (const pattern of Object.values(banned))
      expect(pattern.test(line)).toBe(false);
  });
});

describe("source scan (FS-KYPQ9 §B.3, §B.5, §B.6)", () => {
  const effects = sourcesIn(join(SRC, "render", "effects"));
  const hub = join(SRC, "scenes", "HubScene.ts");
  const run = join(SRC, "scenes", "BarrowspireScene.ts");

  it("should scan the effects module", () => {
    expect(effects.map((f) => relative(SRC, f))).toContain(
      join("render", "effects", "table.ts"),
    );
  });

  describe.each([
    ...effects.map((f) => [relative(SRC, f), f] as const),
    [relative(SRC, hub), hub] as const,
    [relative(SRC, run), run] as const,
  ])("%s", (_name, file) => {
    it("should use no Bounce, Elastic or Back easing", () => {
      expect(hits(file, BANNED_EASING)).toEqual([]);
    });

    it("should shake no camera", () => {
      expect(hits(file, SHAKE)).toEqual([]);
    });

    it("should explode no emitter", () => {
      expect(hits(file, EXPLODE)).toEqual([]);
    });
  });
});
