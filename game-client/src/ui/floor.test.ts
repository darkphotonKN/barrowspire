import { describe, expect, it } from "vitest";
import { climbed, floorCard, floorLabel, interactNotice } from "./floor";

describe("floorLabel (FS-F6F88 req 29)", () => {
  it("should read 'Floor N of M' from the broadcast", () => {
    expect(floorLabel({ floor: 2, floor_count: 3 })).toBe("Floor 2 of 3");
  });

  it("should read the first and the top floor the same way", () => {
    expect(floorLabel({ floor: 1, floor_count: 3 })).toBe("Floor 1 of 3");
    expect(floorLabel({ floor: 3, floor_count: 3 })).toBe("Floor 3 of 3");
  });

  it("should have nothing to show in the hub, where both are absent", () => {
    expect(floorLabel({})).toBeNull();
  });

  it("should have nothing to show when only one of the two arrived", () => {
    expect(floorLabel({ floor: 2 })).toBeNull();
    expect(floorLabel({ floor_count: 3 })).toBeNull();
  });
});

describe("interactNotice (FS-F6F88 req 22, 31)", () => {
  const gather = (missing?: number) => ({
    success: false,
    message: "the party has not gathered at the stairs",
    reason: "party_not_gathered",
    missing,
  });

  it("should answer a gather refusal in the lore voice, naming how many are missing", () => {
    const notice = interactNotice(gather(2));
    expect(notice?.text).toContain("2");
    expect(notice?.text).toMatch(/stair/i);
    expect(notice?.text).not.toBe("the party has not gathered at the stairs");
    expect(notice?.tone).toBe("waiting");
  });

  it("should agree with a single missing delver", () => {
    expect(interactNotice(gather(1))?.text).toBe(
      "The stair waits. 1 of your party is not yet with you.",
    );
    expect(interactNotice(gather(2))?.text).toBe(
      "The stair waits. 2 of your party are not yet with you.",
    );
  });

  it("should still turn the party back when the count is missing or nonsense", () => {
    for (const missing of [undefined, 0, -1]) {
      const notice = interactNotice(gather(missing));
      expect(notice?.text).toBe("The stair waits for the whole party.");
      expect(notice?.tone).toBe("waiting");
    }
  });

  it("should keep the server's words for any other refusal", () => {
    expect(
      interactNotice({ success: false, message: "too far away to interact" }),
    ).toEqual({ text: "too far away to interact", tone: "refused" });
  });

  it("should keep the server's words for a success that carries one", () => {
    expect(interactNotice({ success: true, message: "The door gives way." })).toEqual({
      text: "The door gives way.",
      tone: "done",
    });
  });

  it("should say nothing for the empty frame that follows a reply", () => {
    expect(interactNotice({ success: false, message: "" })).toBeNull();
    expect(interactNotice({ success: true, message: "" })).toBeNull();
  });
});

describe("climbed (FS-F6F88 req 28, 32)", () => {
  it("should see a climb when the floor goes up between broadcasts", () => {
    expect(climbed(1, 2)).toBe(true);
    expect(climbed(2, 3)).toBe(true);
  });

  it("should see nothing while the party stays on its floor", () => {
    expect(climbed(2, 2)).toBe(false);
  });

  it("should take the first broadcast after a (re)connect as the baseline, not a climb", () => {
    expect(climbed(undefined, 2)).toBe(false);
    expect(climbed(undefined, 3)).toBe(false);
  });

  it("should see nothing where the broadcast carries no floor (the hub)", () => {
    expect(climbed(2, undefined)).toBe(false);
    expect(climbed(undefined, undefined)).toBe(false);
  });

  it("should not call a lower floor a climb", () => {
    expect(climbed(3, 1)).toBe(false);
  });
});

describe("floorCard (FS-F6F88 req 32)", () => {
  it("should name the floor the party has climbed to in words", () => {
    expect(floorCard({ floor: 2, floor_count: 3 }).title).toBe("The Second Floor");
    expect(floorCard({ floor: 3, floor_count: 3 }).title).toBe("The Third Floor");
  });

  it("should warn of worse to come below the top, and that the stair ends at the top", () => {
    const below = floorCard({ floor: 2, floor_count: 3 }).line;
    const top = floorCard({ floor: 3, floor_count: 3 }).line;
    expect(below).not.toBe(top);
    expect(top).toMatch(/no stair/i);
  });

  it("should fall back to the number past the floors it has words for", () => {
    expect(floorCard({ floor: 12, floor_count: 12 }).title).toBe("Floor 12");
  });

  it("should speak in the lore voice, never the sci-fi register", () => {
    for (const floor of [1, 2, 3]) {
      const { title, line } = floorCard({ floor, floor_count: 3 });
      expect(`${title} ${line}`).not.toMatch(/sector|level|deploy|extraction|operator/i);
    }
  });
});
