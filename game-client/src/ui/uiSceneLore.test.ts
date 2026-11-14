import { describe, expect, it } from "vitest";
import type { LoreLine } from "./loreLine";
import { GameUiBridge, NO_FACTS, answering, type UiRequest, type World, type WorldReport } from "./uiBridge";
import { UiLoreSlot, hearLore, type LoreMessage } from "./uiSceneLore";

// FS-XWHZP (the lore lines), FS-TQZ5J § Change: Merge with main, the owner's 2026-11-14 call
// (「蓋在面板上方」): the run's lore lines are the UI scene's, said through the bridge as plain data
// (ADR-0084), so they draw over the UI scene's panels; the slot owns the queue, timing and dust, and
// lets a world's lines go as it leaves.

const hope = (text: string): LoreLine => ({ text, tone: "hope" });

function onLore() {
  const bridge = new GameUiBridge();
  const heard: string[] = [];
  const lines = {
    say: (line: LoreLine) => void heard.push(`say ${line.text}`),
    clear: () => void heard.push("clear"),
    relayout: () => void heard.push("relayout"),
  };
  const slot = new UiLoreSlot(bridge, lines);
  const stop = hearLore(slot, bridge);
  const asked: UiRequest[] = [];
  const report = (world: World): WorldReport => {
    const r: WorldReport = {
      world,
      windows: () => ({ letter: false }),
      blockers: () => ({ dialogue: false }),
      facts: () => NO_FACTS,
      answer: (request) => void asked.push(request),
    };
    bridge.report(r);
    return r;
  };
  heard.length = 0;
  return { bridge, slot, heard, report, stop, asked };
}

const say = (world: World, line: LoreLine): LoreMessage => ({ world, kind: "say", line });

describe("the UI scene's lore slot (FS-XWHZP; FS-TQZ5J § Change: Merge with main, 2026-11-14)", () => {
  it("should say each line the run hands, through the bridge, to the UI scene's lines", () => {
    const { bridge, report, heard } = onLore();
    report("run");
    heard.length = 0;

    bridge.lore(say("run", hope("The way out stands open.")));
    bridge.lore(say("run", hope("The seal breaks. Somewhere, a door gives.")));

    expect(heard).toEqual(["say The way out stands open.", "say The seal breaks. Somewhere, a door gives."]);
  });

  it("should take every line down, the queue with them, as the run's floor changes (R15)", () => {
    const { bridge, report, heard } = onLore();
    report("run");
    bridge.lore(say("run", hope("a")));
    heard.length = 0;

    bridge.lore({ world: "run", kind: "clear" });

    expect(heard).toEqual(["clear"]);
  });

  it("should take the lines down as the run leaves, and draw none a world that has left says late", () => {
    const { bridge, report, heard } = onLore();
    report("run");
    bridge.lore(say("run", hope("a")));
    heard.length = 0;

    bridge.left("run");
    expect(heard).toEqual(["clear"]);

    bridge.lore(say("run", hope("late")));
    report("hub");
    bridge.lore(say("run", hope("later")));
    expect(heard.filter((h) => h.startsWith("say"))).toEqual([]);
  });

  it("should keep the lines through a report of the same world again", () => {
    const { bridge, report, heard } = onLore();
    report("run");
    bridge.lore(say("run", hope("a")));
    heard.length = 0;

    bridge.changed();
    report("run");

    expect(heard).toEqual([]);
  });

  it("should stand the line at its place in a new view, and stop hearing the bridge on its stop", () => {
    const { bridge, slot, report, heard, stop } = onLore();
    report("run");
    slot.relayout();
    expect(heard).toEqual(["relayout"]);

    stop();
    bridge.lore(say("run", hope("a")));
    expect(heard).toEqual(["relayout"]);
  });
});

describe("the lore line's tremor as a request the run answers (FS-XWHZP R10)", () => {
  it("should hand the tremor's numbers to the world's answer", () => {
    const shook: [number, number][] = [];
    const answer = answering({ tremor: (durationMs, intensity) => void shook.push([durationMs, intensity]) });

    answer({ kind: "tremor", durationMs: 220, intensity: 0.002 });

    expect(shook).toEqual([[220, 0.002]]);
  });
});
