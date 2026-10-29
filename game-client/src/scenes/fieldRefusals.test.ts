import { describe, expect, it } from "vitest";
import { ActionType } from "@/assets/types/client";
import { fieldRefusalCopy, lootRefusalCopy } from "./fieldRefusals";

describe("lootRefusalCopy (FS-X2F2H §Requirements 33, 59, 60)", () => {
  it("should give loot_reserved its own words, never the code", () => {
    const copy = lootRefusalCopy("loot_reserved") ?? "";
    expect(copy).not.toMatch(/_/);
    expect(copy.length).toBeGreaterThan(0);
  });

  it("should say nothing for a refusal that is not a reserved pile's", () => {
    expect(lootRefusalCopy("some_other_reason")).toBeUndefined();
    expect(lootRefusalCopy(undefined)).toBeUndefined();
  });
});

describe("fieldRefusalCopy (FS-X2F2H §Requirements 10, 14, 60)", () => {
  const enterReasons = [
    "not_in_hub",
    "no_character",
    "unknown_field",
    "not_at_gate",
    "queued",
    "loadout_unavailable",
  ];
  const leaveReasons = ["not_in_field", "not_at_gate", "fallen"];

  it.each(enterReasons)("should give enter_field's %s its own words, never the code", (reason) => {
    const copy = fieldRefusalCopy(ActionType.EnterField, reason);
    expect(copy).not.toBe(reason);
    expect(copy).not.toMatch(/_/);
    expect(copy.length).toBeGreaterThan(0);
  });

  it.each(leaveReasons)("should give leave_field's %s its own words, never the code", (reason) => {
    const copy = fieldRefusalCopy(ActionType.LeaveField, reason);
    expect(copy).not.toBe(reason);
    expect(copy).not.toMatch(/_/);
  });

  it("should say every enter reason differently", () => {
    const copies = enterReasons.map((r) => fieldRefusalCopy(ActionType.EnterField, r));
    expect(new Set(copies).size).toBe(enterReasons.length);
  });

  it("should send a player at the wrong spot to the gate going in, and to the road home coming out", () => {
    expect(fieldRefusalCopy(ActionType.EnterField, "not_at_gate")).not.toBe(
      fieldRefusalCopy(ActionType.LeaveField, "not_at_gate"),
    );
  });

  it("should fall back to its own words for a reason it does not know, or none", () => {
    const unknown = fieldRefusalCopy(ActionType.EnterField, "some_new_reason");
    expect(unknown).not.toContain("some_new_reason");
    expect(fieldRefusalCopy(ActionType.LeaveField, undefined)).toBe(
      fieldRefusalCopy(ActionType.LeaveField, "some_new_reason"),
    );
  });
});
