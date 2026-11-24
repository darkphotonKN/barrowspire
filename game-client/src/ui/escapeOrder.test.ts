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
    // FS-8RZ51 R36: the tree stands over the gear overlay and under the party panel
    ["the party panel, drawn over the tree", { ...none, tree: true, party: true }, "party"],
    ["the tree, over the gear overlay", { ...none, tree: true, gear: true }, "tree"],
    ["the tree", { ...none, tree: true }, "tree"],
    ["the open menu, over the tree", { ...none, menu: true, tree: true }, "close-menu"],
    ["the controls panel, before every other step", { letter: true, menu: true, gear: true, party: true, controls: true }, "controls"],
    // FS-X2CMM R36: the class book stands over the party panel, the tree and the gear overlay, under the menu
    ["the book, over the party panel, the tree and the gear overlay", { ...none, book: true, party: true, tree: true, gear: true }, "book"],
    ["the book", { ...none, book: true }, "book"],
    ["the open menu, over the book", { ...none, menu: true, book: true }, "close-menu"],
    ["the controls panel, before the book", { ...none, book: true, controls: true }, "controls"],
  ] as const)("should close %s", (_case, open, step) => {
    expect(escapeStep(open)).toBe(step);
  });
});
