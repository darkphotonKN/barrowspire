import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AbilityBarView } from "./abilityBarView";
import { RESOURCE_HUD_AT } from "./ResourceHud";
import { GameUiBridge, NO_FACTS, type World, type WorldReport } from "./uiBridge";
import { HUD_PLACES, UiHudSlot, type HudBuild, type HudKind, type HudMessage } from "./uiSceneHud";

// FS-TQZ5J § Change: Batch 5, R67–R69, R73: the UI scene's HUD slot builds each piece for the world
// reported, at its place there, on the first message that shows it; takes them all down as the world
// leaves; builds them anew for the next

interface Built {
  kind: HudKind;
  at: unknown;
  shown: unknown[];
  relayouts: number;
  destroyed: boolean;
  /** What the level bar was last told of the ability bar's top. */
  cueOver?: number | null;
}

/** The ability bar's top in the fake: where it stands while up. */
const BAR_TOP = 612;

function onHud() {
  const bridge = new GameUiBridge();
  const built: Built[] = [];
  const piece = (kind: HudKind) => (at?: unknown) => {
    const b: Built = { kind, at, shown: [], relayouts: 0, destroyed: false };
    built.push(b);
    return {
      show: (view: unknown) => void b.shown.push(view),
      relayout: () => void b.relayouts++,
      destroy: () => void (b.destroyed = true),
      top: () => (b.shown.at(-1) ? BAR_TOP : null),
      cueOver: (top: number | null) => void (b.cueOver = top),
    };
  };
  const build: HudBuild = {
    bar: piece("bar"),
    bars: piece("bars"),
    progress: piece("progress"),
  };
  const slot = new UiHudSlot(bridge, build);
  const report = (world: World): WorldReport => {
    const r: WorldReport = {
      world,
      windows: () => ({ letter: false }),
      blockers: () => ({ dialogue: false }),
      facts: () => NO_FACTS,
      answer: () => {},
    };
    bridge.report(r);
    slot.world(r);
    return r;
  };
  const leave = (world: World) => {
    bridge.left(world);
    slot.world(null);
  };
  const standing = () => built.filter((b) => !b.destroyed);
  return { bridge, slot, built, report, leave, standing };
}

type HudData = HudMessage extends infer M ? (M extends HudMessage ? Omit<M, "world"> : never) : never;
const VIEW: AbilityBarView = {
  potion: { count: 2, greyed: false, field: false },
  ability: { icon: "dash", greyed: false, active: false, cost: 25 },
  tree: { locked: true, ability: "earthbreaker", greyed: true, cost: null },
  costChannel: "stamina",
  cooldowns: { ability: null, tree: null },
};
const BAR: HudData = { kind: "bar", bar: VIEW };
const BARS: HudData = { kind: "bars", bars: [{ channel: "health", label: "Health:", fill: 1 }] };
const PROGRESS: HudData = {
  kind: "progress",
  progress: { level: 2, experience: 150, level_floor: 100, next_level_at: 230 },
};
/** A HUD message as `world` sends it (FS-TQZ5J § Change: Batch 6, R137). */
const from = (world: World, data: HudData) => ({ ...data, world }) as HudMessage;

describe("the UI scene's HUD slot (FS-TQZ5J § Change: Batch 5, R67–R69)", () => {
  // FS-77DVN §A, §C.13, §E.17: the level bar in every world, placing itself along the bottom middle;
  // the run's bars in the very top left, as a field's; FS-Q18Q3 R29, R34, R35: the ability bar in a run
  // and a field, placing itself, never in the hub; no card and no potion cell anywhere
  it("should stand each piece where its world stands it (R69; FS-77DVN; FS-Q18Q3 R29)", () => {
    expect(HUD_PLACES.hub).toEqual({ progress: true });
    expect(HUD_PLACES.field).toEqual({ progress: true, bars: RESOURCE_HUD_AT.field, bar: true });
    expect(RESOURCE_HUD_AT.run).toEqual(RESOURCE_HUD_AT.field);
    expect(HUD_PLACES.run).toEqual({ progress: true, bars: RESOURCE_HUD_AT.run, bar: true });
  });

  it.each([
    ["field", BAR, undefined],
    ["run", BAR, undefined],
    ["field", BARS, RESOURCE_HUD_AT.field],
    ["run", BARS, RESOURCE_HUD_AT.run],
    ["hub", PROGRESS, undefined],
    ["field", PROGRESS, undefined],
    ["run", PROGRESS, undefined],
  ] as const)("should build the piece in a %s at its place on the first message, and hand it each one after", (world, message, at) => {
    const { slot, built, report } = onHud();
    report(world);
    expect(built).toEqual([]);
    slot.hear(from(world, message));
    slot.hear(from(world, message));
    expect(built).toHaveLength(1);
    expect(built[0]).toMatchObject({ kind: message.kind, at });
    expect(built[0].shown).toHaveLength(2);
  });

  it("should hand the bar none as it comes down, the piece kept (FS-Q18Q3 R30)", () => {
    const { slot, built, report } = onHud();
    report("run");
    slot.hear(from("run", BAR));
    slot.hear({ world: "run", kind: "bar", bar: null });
    expect(built).toHaveLength(1);
    expect(built[0].shown.at(-1)).toBeNull();
    expect(built[0].destroyed).toBe(false);
  });

  it.each([
    ["hub", BAR],
    ["hub", BARS],
  ] as const)("should draw nothing in a %s for a piece it has no place for (R69)", (world, message) => {
    const { slot, built, report } = onHud();
    report(world);
    slot.hear(from(world, message));
    expect(built).toEqual([]);
  });

  it("should draw nothing with no world reported", () => {
    const { slot, built } = onHud();
    slot.hear(from("run", BAR));
    slot.hear(from("hub", PROGRESS));
    expect(built).toEqual([]);
  });

  // FS-TQZ5J § Change: Batch 6, R137: a message names the world it came from; one from a world whose
  // pieces no longer stand (sent late, after its leave) draws nothing on the next world's
  it("should draw nothing for a late message from a world that has left", () => {
    const { slot, built, report, leave } = onHud();
    report("run");
    leave("run");
    report("hub");
    slot.hear(from("run", PROGRESS));
    slot.hear(from("run", BAR));
    expect(built).toEqual([]);
    slot.hear(from("hub", PROGRESS));
    expect(built).toHaveLength(1);
  });

  it("should take every piece down as its world leaves, and build anew for the next (R67)", () => {
    const { slot, built, report, leave, standing } = onHud();
    report("run");
    slot.hear(from("run", BAR));
    slot.hear(from("run", BARS));
    slot.hear(from("run", PROGRESS));
    expect(standing()).toHaveLength(3);
    leave("run");
    expect(standing()).toEqual([]);
    slot.hear(from("run", PROGRESS));
    expect(built).toHaveLength(3);
    report("run");
    slot.hear(from("run", PROGRESS));
    expect(standing()).toHaveLength(1);
    expect(built).toHaveLength(4);
  });

  it("should take the old world's pieces down on another world's report, with no leave between", () => {
    const { slot, report, standing } = onHud();
    report("hub");
    slot.hear(from("hub", PROGRESS));
    report("run");
    expect(standing()).toEqual([]);
  });

  it("should keep its pieces when the same world reports again (a changed report)", () => {
    const { slot, bridge, report, standing } = onHud();
    const run = report("run");
    slot.hear(from("run", BAR));
    bridge.changed();
    slot.world(run);
    expect(standing()).toHaveLength(1);
  });

  it("should send each standing piece back to its anchor on a new view, and take them all down with the scene", () => {
    const { slot, built, report, standing } = onHud();
    report("run");
    slot.hear(from("run", BAR));
    slot.hear(from("run", BARS));
    slot.relayout();
    expect(built.map((b) => b.relayouts)).toEqual([1, 1]);
    slot.destroy();
    expect(standing()).toEqual([]);
  });
});

// FS-Q18Q3 §B R12, §L R43: the level bar and the ability bar both stand in the slot, so the slot tells the
// level bar where the ability bar's top stands while it is up, and nothing crosses the bridge for it
describe("the level-up cue over the ability bar (FS-Q18Q3 R12, R43)", () => {
  const cue = (built: Built[]) => built.find((b) => b.kind === "progress")?.cueOver;

  it("should tell the level bar the ability bar's top while the bar is up, and none once it comes down", () => {
    const { slot, built, report } = onHud();
    report("run");
    slot.hear(from("run", PROGRESS));
    expect(cue(built)).toBeNull();
    slot.hear(from("run", BAR));
    expect(cue(built)).toBe(BAR_TOP);
    slot.hear({ world: "run", kind: "bar", bar: null });
    expect(cue(built)).toBeNull();
  });

  it("should tell a level bar built after the ability bar where it stands", () => {
    const { slot, built, report } = onHud();
    report("field");
    slot.hear(from("field", BAR));
    slot.hear(from("field", PROGRESS));
    expect(cue(built)).toBe(BAR_TOP);
  });

  it("should tell the level bar none in the hub, where no ability bar stands", () => {
    const { slot, built, report } = onHud();
    report("hub");
    slot.hear(from("hub", PROGRESS));
    slot.hear(from("hub", BAR));
    expect(built.map((b) => b.kind)).toEqual(["progress"]);
    expect(cue(built)).toBeNull();
  });

  it("should tell it again on a new view", () => {
    const { slot, built, report } = onHud();
    report("run");
    slot.hear(from("run", PROGRESS));
    slot.hear(from("run", BAR));
    built.find((b) => b.kind === "progress")!.cueOver = undefined;
    slot.relayout();
    expect(cue(built)).toBe(BAR_TOP);
  });
});

describe("the UI bridge's HUD (FS-TQZ5J § Change: Batch 5, R68)", () => {
  it("should tell the UI scene each HUD message as the world says it, as plain data", () => {
    const bridge = new GameUiBridge();
    const told: HudMessage[] = [];
    const stop = bridge.onScreen({ hud: (message) => void told.push(message) });
    bridge.hud(from("run", BAR));
    stop();
    bridge.hud(from("run", BARS));
    expect(told).toEqual([from("run", BAR)]);
    expect(JSON.parse(JSON.stringify(told))).toEqual(told);
  });
});

describe("the HUD slot's wiring, shared (FS-TQZ5J § Change: Batch 6, R138)", () => {
  it("should keep no test-only accessor of its pieces: what is built is the builder's to read", () => {
    expect("piece" in UiHudSlot.prototype).toBe(false);
  });

  it("should leave the bridge's wiring to hearHud, the one mountHud and the stand-in both use", () => {
    const standin = readFileSync(join(__dirname, "uiSceneHud.standin.ts"), "utf8");
    expect(standin).toMatch(/\bhearHud\(/);
    expect(standin).not.toMatch(/onScreen\(/);
    expect(standin).not.toMatch(/onWorld\(/);
  });
});

describe("the worlds leave the HUD pieces to the UI scene (FS-TQZ5J § Change: Batch 5, R67; FS-Q18Q3 R41)", () => {
  it.each(["AbilityBar", "ResourceHud", "ProgressHud"])("should import %s in no world scene", (piece) => {
    for (const scene of ["HubScene", "FieldScene", "BarrowspireScene"]) {
      const source = readFileSync(join(__dirname, `../scenes/${scene}.ts`), "utf8");
      expect(source, scene).not.toMatch(new RegExp(`import \\{[^}]*\\b${piece}\\b[^}]*\\} from "@/ui/${piece}"`));
    }
  });
});
