import { describe, expect, it } from "vitest";
import { GameUiBridge, NO_FACTS, type World, type WorldFacts, type WorldReport } from "./uiBridge";
import { UiControlsBadge, type BadgePiece, type BadgeSpec } from "./uiSceneControlsBadge";

// FS-84N1G R4, R7, R8; FS-Q18Q3 R42: the controls badge stands in the run while its ability bar is live and the run has
// not ended; its hover plays menu_hover; its press toggles the controls panel, refused under the menu with
// menu_error

function onBadge() {
  const bridge = new GameUiBridge();
  const played: string[] = [];
  bridge.lendSounds({ act: (run) => run(), play: (effect) => void played.push(effect) });
  const built: { spec: BadgeSpec; destroyed: boolean; relayouts: number }[] = [];
  let toggles = 0;
  const badge = new UiControlsBadge(bridge, { toggle: () => void toggles++ }, (spec): BadgePiece => {
    const b = { spec, destroyed: false, relayouts: 0 };
    built.push(b);
    return { relayout: () => void b.relayouts++, destroy: () => void (b.destroyed = true) };
  });
  const facts: { -readonly [K in keyof WorldFacts]: WorldFacts[K] } = { ...NO_FACTS };
  const report = (world: World): WorldReport => {
    const r: WorldReport = {
      world,
      windows: () => ({ letter: false }),
      blockers: () => ({ dialogue: false }),
      facts: () => ({ ...facts }),
      answer: () => {},
    };
    bridge.report(r);
    badge.world(r);
    return r;
  };
  const standing = () => built.filter((b) => !b.destroyed).length;
  return { bridge, badge, built, played, facts, report, standing, toggles: () => toggles };
}

describe("the controls badge on the UI scene (FS-84N1G R4, R7, R8)", () => {
  it("should stand in the run while the run says its ability bar is live, and go as it stops being live", () => {
    const { badge, report, standing } = onBadge();
    report("run");
    expect(standing()).toBe(0);
    badge.abilityBar(true);
    badge.abilityBar(true);
    expect(standing()).toBe(1);
    badge.abilityBar(false);
    expect(standing()).toBe(0);
  });

  it("should go as the run ends, and stand again on nothing it is told after", () => {
    const { badge, report, facts, standing } = onBadge();
    const run = report("run");
    badge.abilityBar(true);
    facts.ended = true;
    badge.world(run);
    expect(standing()).toBe(0);
    badge.abilityBar(true);
    expect(standing()).toBe(0);
  });

  it("should go as the run leaves, and wait for the next run's bar", () => {
    const { badge, report, standing } = onBadge();
    report("run");
    badge.abilityBar(true);
    badge.world(null);
    expect(standing()).toBe(0);
    report("run");
    expect(standing()).toBe(0);
  });

  it("should never stand in the town or a field", () => {
    const { badge, report, standing } = onBadge();
    report("field");
    badge.abilityBar(true);
    report("hub");
    badge.abilityBar(true);
    expect(standing()).toBe(0);
  });

  it("should play menu_hover on the hover, toggle the panel on a press, and refuse a press under the menu with menu_error", () => {
    const { badge, bridge, report, built, played, toggles } = onBadge();
    report("run");
    badge.abilityBar(true);
    built[0].spec.hovered();
    built[0].spec.press();
    expect(toggles()).toBe(1);
    bridge.reportUi({ menuOpen: true });
    built[0].spec.press();
    expect(toggles()).toBe(1);
    expect(played).toEqual(["menu_hover", "menu_error"]);
  });

  it("should stand the badge again on a new view", () => {
    const { badge, report, built } = onBadge();
    report("run");
    badge.abilityBar(true);
    badge.relayout();
    expect(built[0].relayouts).toBe(1);
  });
});
