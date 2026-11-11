import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EFFECT_CARDS } from "./effects";

// FS-1819Q R12: every effect module has a card, so the gallery can't fall behind the effects.
// At least one card per module: a module may carry several (shimmer.ts: a granted base and an
// invoked base, FS-KZC92).

const EFFECTS_DIR = path.resolve(__dirname, "../../render/effects");

/** Helpers beside the effects that play nothing of their own. Adding one is a deliberate call. */
const HELPERS = new Set([
  "runtime",
  "table",
  "fakeScene",
  "star",
  "flights",
  "projectile",
  "sourceScan",
]);

const modules = readdirSync(EFFECTS_DIR)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => f.slice(0, -".ts".length))
  .filter((m) => !HELPERS.has(m));

const carded = new Set(EFFECT_CARDS.map((c) => c.module));

describe("effect cards", () => {
  it.each(modules)("%s has a card", (module) => {
    expect(
      carded.has(module),
      `${module}: add a card in src/dev/gallery/effects.ts`,
    ).toBe(true);
  });

  it.each(EFFECT_CARDS.map((c) => [c.module, c.name]))(
    "card %s (%s) names a module that exists",
    (module) => {
      expect(
        existsSync(path.join(EFFECTS_DIR, `${module}.ts`)),
        `stale card "${module}": no src/render/effects/${module}.ts; fix or remove it in src/dev/gallery/effects.ts`,
      ).toBe(true);
    },
  );

  it("should give every card that can't be played a reason", () => {
    const unexplained = EFFECT_CARDS.filter(
      (c) => c.demo === null && !c.reason.trim(),
    ).map((c) => c.name);
    expect(unexplained, "a demo: null card needs a one-line reason").toEqual(
      [],
    );
  });
});

describe("the arrival card's two leaves (FS-PQ2TW §Change: Smoke, R52)", () => {
  it("should show the dust and the smoke as two cards, each replayable, for the owner to compare", () => {
    const leaves = EFFECT_CARDS.filter((c) => c.module === "cardDust" || c.module === "cardSmoke");
    expect(leaves.map((c) => [c.module, c.name])).toEqual([
      ["cardDust", "Arrival card dust"],
      ["cardSmoke", "Arrival card smoke"],
    ]);
    for (const c of leaves) expect(c.demo).toBeTypeOf("function");
  });
});
