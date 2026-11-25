import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { palette } from "@/utils/canvasPalette";
import { EFFECT_CARDS, type Stage } from "./effects";

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
  // what the arrival card's three leaves share (FS-PQ2TW): it plays nothing of its own
  "cardLeaveCore",
  // when an effect's steps play, for the tree abilities' staged looks (FS-04EEA §H): it plays nothing of its own
  "staged",
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

  it("should card the bone arrow, a hostile's shot, beside the party arrow (FS-B4SG9 §D R23)", () => {
    const names = (module: string) =>
      EFFECT_CARDS.filter((c) => c.module === module).map((c) => c.name);
    expect(names("boneArrow")).toHaveLength(1);
    expect(names("boneArrow")).not.toEqual(names("arrow"));
    expect(EFFECT_CARDS.find((c) => c.module === "boneArrow")?.demo).not.toBeNull();
  });

  it("should card each ability telegraph with its impact, and the dagger and rock flights (FS-C8VM7 §F R39)", () => {
    const names = (module: string) => EFFECT_CARDS.filter((c) => c.module === module).map((c) => c.name);
    expect(names("monsterAbility")).toEqual([
      "Pounce telegraph and impact (hostile)",
      "Ground slam telegraph and impact (hostile)",
      "Death burst telegraph and impact (hostile)",
      "Wail telegraph and impact (hostile)",
      "Cleave cone and impact (hostile)",
    ]);
    expect(names("thrownDagger")).toHaveLength(1);
    expect(names("ogreRock")).toHaveLength(1);
    for (const owner of ["monsterAbility", "thrownDagger", "ogreRock"])
      for (const card of EFFECT_CARDS.filter((c) => c.module === owner)) expect(card.demo).toBeTypeOf("function");
  });

  it("should card a lore line in each tone, each playable (FS-XWHZP R26)", () => {
    const cards = EFFECT_CARDS.filter((c) => c.module === "loreDust");
    expect(cards.map((c) => c.name)).toEqual(["Lore line (lore)", "Lore line (dread)", "Lore line (hope)"]);
    for (const card of cards) expect(card.demo).toBeTypeOf("function");
  });

  // FS-9JV5K §F R24 (I-9JV5K-5): the antidote's shimmer, beside the heal's
  it("should card the heal and the antidote shimmers on the granted base, each playable", () => {
    const names = EFFECT_CARDS.filter((c) => c.module === "shimmer").map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["Heal shimmer (granted base)", "Antidote shimmer (granted base)"]));
  });

  // FS-9JV5K §Change: The Restoring Draught D6 (I-9JV5K-7): the draught's shimmer in each pool's colour
  it("should card the Restoring Draught's shimmer for mana, stamina and parry charges, each playable", () => {
    const cards = EFFECT_CARDS.filter((c) => c.module === "shimmer" && c.name.startsWith("Restoring Draught"));
    expect(cards.map((c) => c.name)).toEqual([
      "Restoring Draught shimmer (mana)",
      "Restoring Draught shimmer (stamina)",
      "Restoring Draught shimmer (parry charges)",
    ]);
    for (const card of cards) expect(card.demo).toBeTypeOf("function");
  });

  it("should card the ward on the mage, the gloom on the archer, and a ward under a heal, each playable (FS-1J1CB R38)", () => {
    const cards = EFFECT_CARDS.filter((c) => c.module === "aura");
    expect(cards.map((c) => c.name)).toEqual([
      "Ward (Spellwarden aura, on the mage)",
      "Gloom (Shadow Ranger aura, on the archer)",
      "Ward under a heal shimmer",
    ]);
    for (const card of cards) expect(card.demo).toBeTypeOf("function");
  });

  it("should card each tree ability, the flurry at 1, 3 and 5 charges, and the stun tell on a monster, each playable (FS-04EEA R49)", () => {
    const names = (module: string) => EFFECT_CARDS.filter((c) => c.module === module).map((c) => c.name);
    expect(names("earthbreaker")).toHaveLength(1);
    expect(names("blink")).toEqual(["Blink out and in"]);
    expect(names("arrowRain")).toHaveLength(1);
    expect(names("settleTheDebt")).toEqual([
      "Settle the Debt (1 charge)",
      "Settle the Debt (3 charges)",
      "Settle the Debt (5 charges)",
    ]);
    expect(names("stun")).toEqual(["Stun tell (on a ghoul)"]);
    for (const owner of ["earthbreaker", "blink", "arrowRain", "settleTheDebt", "stun"])
      for (const card of EFFECT_CARDS.filter((c) => c.module === owner)) expect(card.demo).toBeTypeOf("function");
  });

  // I-X2CMM-27: Far Hand arms on an interactable (FS-X2CMM §H R41, §J R50), so its amber ring is carded
  it("should card the reticle's ground ring, the interactable ring in amber and the hound's paw, one after another", () => {
    const card = EFFECT_CARDS.find((c) => c.module === "pageReticle");
    if (!card?.demo) throw new Error("the pageReticle card must play");
    const inks: number[] = [];
    const graphics = new Proxy({} as Record<string, unknown>, {
      get: (_, key) => (...args: unknown[]) => {
        if (key === "lineStyle") inks.push(args[1] as number);
        return graphics;
      },
    });
    const later: (() => void)[] = [];
    const stage = {
      scene: { add: { graphics: () => graphics } },
      aim: { x: 400, y: 300 },
      later: (_ms: number, fn: () => void) => later.push(fn),
    } as unknown as Stage;
    card.demo(stage);
    for (const step of later) step();
    const runs = inks.filter((ink, i) => ink !== inks[i - 1]);
    expect(runs).toEqual([palette.reticleGround, palette.reticleInteractable, palette.reticleGround]);
  });

  // FS-X2CMM §Change: The archer's wolf W2: the reticle card and the bay's card name the summon by its page
  it("should name the archer's summon on its cards the wolf, as its page reads, never the hound", () => {
    const reticle = EFFECT_CARDS.find((c) => c.module === "pageReticle");
    expect(reticle?.name).toContain("Call the Wolf's paw");
    for (const card of EFFECT_CARDS) expect(card.name).not.toMatch(/hound/i);
  });

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

describe("the arrival card's third leave (FS-PQ2TW §Change: Ash, R62)", () => {
  it("should show the ash as its own replayable card, beside the dust and the smoke", () => {
    const leaves = EFFECT_CARDS.filter((c) => c.module.startsWith("card"));
    expect(leaves.map((c) => [c.module, c.name])).toEqual([
      ["cardAsh", "Arrival card ash"],
      ["cardDust", "Arrival card dust"],
      ["cardSmoke", "Arrival card smoke"],
    ]);
    for (const c of leaves) expect(c.demo).toBeTypeOf("function");
  });
});
