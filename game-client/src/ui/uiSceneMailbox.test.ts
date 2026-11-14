import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GameUiBridge, NO_FACTS, type World, type WorldBlockers, type WorldReport } from "./uiBridge";
import { UiMailboxSlot, type MailboxPiece, type MailboxWiring } from "./uiSceneMailbox";

// FS-TQZ5J § Change: Batch 4: the mailbox (I-TQZ5J-40): the town's mailbox is the UI scene's, built as
// the town is reported and taken down as it leaves (R101, R110); its envelope refused by the town's
// dialogue and the menu slot, its opening closing the UI scene's gear overlay and party panel (R104);
// its tips reading the gear's last level (R102); its own inputs through the UI scene's act (R109).

/** A world as it reports itself, its blockers as they are now. */
function aWorld(world: World, start: Partial<WorldBlockers> = {}) {
  const blockers: { -readonly [K in keyof WorldBlockers]: WorldBlockers[K] } = { dialogue: false, ...start };
  const report: WorldReport = {
    world,
    windows: () => ({ letter: false }),
    blockers: () => ({ ...blockers }),
    facts: () => NO_FACTS,
    answer: () => {},
  };
  return { report, blockers };
}

/** A mailbox as the slot keeps it, recording what was done to it and the wiring it was built with. */
interface BuiltMailbox extends MailboxPiece {
  wiring: MailboxWiring;
  relayouts: number;
  destroyed: boolean;
}

function onSlot() {
  const bridge = new GameUiBridge();
  const closed: string[] = [];
  let level: number | undefined;
  const built: BuiltMailbox[] = [];
  const slot = new UiMailboxSlot(
    bridge,
    {
      gear: { close: () => void closed.push("gear") },
      party: { close: () => void closed.push("party") },
      level: () => level,
    },
    (wiring) => {
      const made: BuiltMailbox = {
        wiring,
        relayouts: 0,
        destroyed: false,
        relayout: () => void made.relayouts++,
        destroy: () => void (made.destroyed = true),
      };
      built.push(made);
      return made;
    },
  );
  const live = () => built.filter((m) => !m.destroyed);
  const setLevel = (n: number | undefined) => void (level = n);
  return { bridge, slot, built, live, closed, setLevel };
}

describe("the UI scene's mailbox slot, built for the town (FS-TQZ5J § Change: Batch 4, R101, R110)", () => {
  it("should build the mailbox as the town is reported, and keep it while the town stands", () => {
    const { slot, built, live } = onSlot();
    const town = aWorld("hub");
    slot.show(town.report);
    slot.show(town.report);
    expect(built).toHaveLength(1);
    expect(live()).toHaveLength(1);
  });

  it.each(["field", "run"] as const)("should build none in %s", (world) => {
    const { slot, built } = onSlot();
    slot.show(aWorld(world).report);
    expect(built).toHaveLength(0);
  });

  it("should take it down as the town leaves, and build it anew on the next town", () => {
    const { slot, built, live } = onSlot();
    slot.show(aWorld("hub").report);
    slot.show(null);
    expect(live()).toHaveLength(0);
    slot.show(aWorld("field").report);
    expect(live()).toHaveLength(0);
    slot.show(aWorld("hub").report);
    expect(built).toHaveLength(2);
    expect(live()).toHaveLength(1);
  });

  it("should take it down as a field is reported over the town, and with the game", () => {
    const { slot, live } = onSlot();
    slot.show(aWorld("hub").report);
    slot.show(aWorld("field").report);
    expect(live()).toHaveLength(0);
    slot.show(aWorld("hub").report);
    slot.destroy();
    expect(live()).toHaveLength(0);
  });

  it("should stand it again on a new view", () => {
    const { slot, built } = onSlot();
    slot.relayout();
    slot.show(aWorld("hub").report);
    slot.relayout();
    expect(built[0].relayouts).toBe(1);
  });
});

describe("the mailbox's wiring on the UI scene (FS-TQZ5J § Change: Batch 4, R102, R104, R109)", () => {
  it("should refuse the envelope while the town's dialogue is open or the menu slot is filled, and only then", () => {
    const { bridge, slot, built } = onSlot();
    const town = aWorld("hub");
    bridge.report(town.report);
    slot.show(town.report);
    const { blocked } = built[0].wiring;
    expect(blocked()).toBe(false);
    town.blockers.dialogue = true;
    expect(blocked()).toBe(true);
    town.blockers.dialogue = false;
    bridge.reportUi({ menuOpen: true });
    expect(blocked()).toBe(true);
    bridge.reportUi({ menuOpen: false });
    expect(blocked()).toBe(false);
    bridge.left("hub");
    expect(blocked()).toBe(true);
  });

  it("should close the gear overlay and the party panel as the envelope opens the letter panel", () => {
    const { slot, built, closed } = onSlot();
    slot.show(aWorld("hub").report);
    built[0].wiring.opening();
    expect(closed).toEqual(["gear", "party"]);
  });

  it("should read the level the world last handed the gear", () => {
    const { slot, built, setLevel } = onSlot();
    slot.show(aWorld("hub").report);
    expect(built[0].wiring.level()).toBeUndefined();
    setLevel(7);
    expect(built[0].wiring.level()).toBe(7);
  });

  it("should run its own inputs through the UI scene's act and play through its player", () => {
    const { bridge, slot, built } = onSlot();
    const acts: string[] = [];
    const played: string[] = [];
    bridge.lendSounds({
      act: (run) => (acts.push("act"), run()),
      play: (effect) => void played.push(effect),
    });
    slot.show(aWorld("hub").report);
    let ran = false;
    built[0].wiring.wrapper.act(() => void (ran = true));
    built[0].wiring.play("menu_hover");
    expect([ran, acts, played]).toEqual([true, ["act"], ["menu_hover"]]);
  });
});

// FS-TQZ5J § Change: Batch 6, R140: one wiring type, the piece's; the piece module knows nothing of the slot
describe("the mailbox's types (FS-TQZ5J § Change: Batch 6, R140)", () => {
  const source = (file: string) => readFileSync(join(__dirname, file), "utf8");

  it("should import nothing of the slot module in the mailbox's own", () => {
    expect(source("mailboxHud.ts")).not.toMatch(/from "\.\/uiSceneMailbox"/);
  });

  it("should derive the slot's wiring from the mailbox's deps, not restate it", () => {
    expect(source("mailboxHud.ts")).toMatch(/export type MailboxWiring = /);
    expect(source("uiSceneMailbox.ts")).not.toMatch(/export interface MailboxWiring/);
  });

  it("should keep the letter panel's reader beside the store, not in the mailbox's module", () => {
    expect(source("mailboxHud.ts")).not.toMatch(/letterPanelState/);
  });
});
