import { describe, expect, it } from "vitest";
import {
  CONTAINER_GUARDED,
  climbed,
  floorCard,
  floorLabel,
  interactNotice,
  isTopFloor,
  refusesContainer,
} from "./floor";

describe("floorLabel (FS-M8CSE R7)", () => {
  it.each([1, 3, 4, 10])("should read floor %i with no total", (floor) => {
    expect(floorLabel({ floor })).toBe(`Floor ${floor}`);
  });

  it("should have nothing to show in the hub, where there is no floor", () => {
    expect(floorLabel({})).toBeNull();
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

  it("should agree with a single missing player", () => {
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

describe("a guarded chest's refusal (FS-KE075 §J R60)", () => {
  const guarded = { success: false, message: "its guards still stand", reason: CONTAINER_GUARDED };

  it("should say it will not open, in the client's words, never the server's or the code", () => {
    expect(interactNotice(guarded)).toEqual({ text: "It will not open.", tone: "refused" });
  });

  it("should give no reason why: the monsters around it say so", () => {
    expect(interactNotice(guarded)?.text).not.toMatch(/guard|monster|lock|kill/i);
  });

  it("should close the chest only on that refusal", () => {
    expect(refusesContainer(guarded)).toBe(true);
    expect(refusesContainer({ success: false, message: "too far away to interact" })).toBe(false);
    expect(refusesContainer({ success: true, message: "", reason: CONTAINER_GUARDED })).toBe(false);
    expect(refusesContainer({ success: false, message: "", reason: "party_not_gathered" })).toBe(false);
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

describe("isTopFloor (FS-M8CSE R8)", () => {
  it("should read an empty stairs list as the top floor", () => {
    expect(isTopFloor({ stairs: [] })).toBe(true);
  });

  it("should not read a floor with a stair as the top", () => {
    expect(isTopFloor({ stairs: [{ entity_id: "st", position: { x: 1, y: 2 } }] })).toBe(false);
  });

  it("should not read an absent list as the top: the hub has no stairs at all", () => {
    expect(isTopFloor({})).toBe(false);
  });
});

describe("floorCard (FS-F6F88 req 32, FS-M8CSE R9)", () => {
  it("should name the floor the party has climbed to in words", () => {
    expect(floorCard({ floor: 2, top: false }).title).toBe("The Second Floor");
    expect(floorCard({ floor: 3, top: true }).title).toBe("The Third Floor");
  });

  it("should warn of worse to come below the top", () => {
    expect(floorCard({ floor: 3, top: false }).line).toBe("The dead walk heavier here.");
  });

  it("should say the stair ends at the top, on whichever floor that is", () => {
    for (const floor of [3, 7, 10])
      expect(floorCard({ floor, top: true }).line).toBe(
        "No stair climbs higher. Only the way out remains.",
      );
  });

  it("should fall back to the number past the floors it has words for", () => {
    expect(floorCard({ floor: 12, top: true }).title).toBe("Floor 12");
  });

  it("should read floor 10 as any top floor (R10)", () => {
    expect(floorCard({ floor: 10, top: true })).toEqual({
      title: "The Tenth Floor",
      line: floorCard({ floor: 3, top: true }).line,
    });
  });

  it("should speak in the lore voice, never the sci-fi register", () => {
    for (const floor of [1, 2, 3])
      for (const top of [false, true]) {
        const { title, line } = floorCard({ floor, top });
        expect(`${title} ${line}`).not.toMatch(/sector|level|deploy|extraction|operator/i);
      }
  });
});
