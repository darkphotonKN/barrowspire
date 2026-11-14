import { describe, expect, it } from "vitest";
import { escapeStep } from "./escapeOrder";

// FS-R82NV § Change C2 (extending FS-HRH2J R5, FS-1GZGD R40, FS-G4VMQ R1–R3): one Esc press
// closes the one thing on top; with nothing open it opens the world's menu. I-R82NV-13.
describe("escapeStep (FS-R82NV § Change C2: one press closes one thing)", () => {
  const none = { letter: false, menu: false, gear: false, party: false };

  it.each([
    ["the letter panel, over everything", { ...none, letter: true, gear: true, party: true }, "letter"],
    ["the open menu", { ...none, menu: true }, "close-menu"],
    // the party panel is drawn over the inventory and the character panel (FS-3EBCA R8, owner
    // 2026-11-12: "開道具欄跟角色欄時開不了隊伍"), so it is the one on top
    ["the party panel, drawn over the gear overlay", { ...none, gear: true, party: true }, "party"],
    ["the gear overlay", { ...none, gear: true }, "gear"],
    ["the party panel", { ...none, party: true }, "party"],
    ["the open menu, over the party panel and the gear overlay", { ...none, menu: true, gear: true, party: true }, "close-menu"],
    ["nothing open: the menu opens", none, "open-menu"],
    // FS-84N1G R17 (the owner: 「esc也可以關」): the run's controls panel first, before the whole order
    ["the controls panel, before every other step", { letter: true, menu: true, gear: true, party: true, controls: true }, "controls"],
  ] as const)("should close %s", (_case, open, step) => {
    expect(escapeStep(open)).toBe(step);
  });
});
