import { describe, expect, it } from "vitest";
import { escapeStep } from "./escapeOrder";

// FS-R82NV § Change C2 (extending FS-HRH2J R5, FS-1GZGD R40, FS-G4VMQ R1–R3): one Esc press
// closes the one thing on top; with nothing open it opens the world's menu. I-R82NV-13.
describe("escapeStep (FS-R82NV § Change C2: one press closes one thing)", () => {
  const none = { letter: false, menu: false, gear: false, party: false };

  it.each([
    ["the letter panel, over everything", { ...none, letter: true, gear: true, party: true }, "letter"],
    ["the open menu", { ...none, menu: true }, "close-menu"],
    ["the gear overlay, drawn over the party panel", { ...none, gear: true, party: true }, "gear"],
    ["the party panel", { ...none, party: true }, "party"],
    ["nothing open: the menu opens", none, "open-menu"],
  ] as const)("should close %s", (_case, open, step) => {
    expect(escapeStep(open)).toBe(step);
  });
});
