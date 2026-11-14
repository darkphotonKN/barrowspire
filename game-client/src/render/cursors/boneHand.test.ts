import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

// FS-KYPQ9 § Change: Every hover keeps the bone hand. The owner, 2026-11-14: 「所有hover鼠標都要維持骨手」.
// The canvas cursor is the world's default (the bone hand, or the strike-mark over a rival) and
// nothing else: no interactive object carries a cursor of its own, live, dimmed or greyed.

const SRC = path.resolve(__dirname, "../..");
/** The DOM pages, outside the game canvas, keep their own cursors; generated code is not ours. */
const OUTSIDE_THE_CANVAS = ["app", "components", "api"].map((dir) => path.join(SRC, dir));

function sources(dir: string): string[] {
  if (OUTSIDE_THE_CANVAS.includes(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return sources(file);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : [];
  });
}

/** What hands an interactive object a cursor of its own in Phaser 4.2.1 (InputPlugin.setHitArea). */
const OWN_CURSOR = [
  /useHandCursor/,
  // `input.cursor = …`, however the input is reached
  /\binput[!?]?\.cursor\s*=/,
  // `setInteractive({ …, cursor: … })`
  /setInteractive\(\s*\{[^)]*\bcursor\s*:/,
];

describe("every hover keeps the bone hand (FS-KYPQ9 § Change: Every hover keeps the bone hand)", () => {
  it("should give no interactive object in the game canvas a cursor of its own", () => {
    const offenders = sources(SRC).flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return OWN_CURSOR.filter((rule) => rule.test(text)).map(
        (rule) => `${path.relative(SRC, file)}: ${rule}`,
      );
    });
    expect(offenders).toEqual([]);
  });
});

// The rule leans on Phaser 4.2.1's input as it stands: over and out touch the canvas's cursor only
// for an object that has one, so with none the world's default stays. Pinned to the source, as
// uiScenePointer's rules are, so an upgrade that changes it fails here first.
describe("Phaser 4.2.1's cursor, as the rule leans on it", () => {
  const phaserSrc = path.join(path.dirname(createRequire(import.meta.url).resolve("phaser/package.json")), "src");
  const source = (file: string) => readFileSync(path.join(phaserSrc, file), "utf8");

  it("should set the canvas's cursor on an over only for an object that has one (InputManager.setCursor)", () => {
    expect(source("input/InputManager.js")).toMatch(
      /setCursor: function \(interactiveObject\)\s*\{\s*if \(interactiveObject\.cursor\)\s*\{\s*this\.canvas\.style\.cursor = interactiveObject\.cursor;\s*\}\s*\}/,
    );
  });

  it("should put back the default on an out only for an object that has one, or on a forced reset (InputManager.resetCursor)", () => {
    expect(source("input/InputManager.js")).toMatch(
      /resetCursor: function \(interactiveObject, forceReset\)\s*\{\s*if \(\(forceReset \|\| \(interactiveObject && interactiveObject\.cursor\)\) && this\.canvas\)\s*\{\s*this\.canvas\.style\.cursor = this\.defaultCursor;/,
    );
  });

  it("should give an interactive object a cursor only from useHandCursor or cursor, none by default", () => {
    expect(source("input/InputPlugin.js")).toContain("io.cursor = (useHandCursor) ? 'pointer' : cursor;");
    expect(source("input/InputPlugin.js")).toContain("cursor = GetFastValue(config, 'cursor', false);");
    expect(source("input/CreateInteractiveObject.js")).toContain("cursor: false,");
  });
});
