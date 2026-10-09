import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import { creationRefusal, enterHubPayload, NAME_TAKEN } from "./entry";
import type { Character } from "./roster";

const kaelen: Character = {
  id: "0b6f9a52-6f43-4b5e-9a1c-2f1f7b0a9d11",
  name: "Kaelen",
  className: "mage",
  level: 3,
  experience: 420,
  levelFloor: 300,
  nextLevelAt: 600,
  createdAt: "2026-10-08T12:00:00Z",
};

describe("enterHubPayload (FS-BDA7X req 41)", () => {
  it("should carry the character id alongside today's fields", () => {
    expect(enterHubPayload(kaelen)).toEqual({
      characterId: kaelen.id,
      class: "mage",
      className: "mage",
      characterName: "Kaelen",
      username: "Kaelen",
    });
  });
});

describe("creationRefusal (FS-BDA7X req 39)", () => {
  const apiError = (status: number, code: string, detail = "server prose") =>
    new ApiError({ status, code, detail, errors: [] });

  it("should say the name is taken on a 409", () => {
    expect(creationRefusal(apiError(409, "ALREADY_EXISTS"))).toBe(NAME_TAKEN);
  });

  it("should show the server's reason for a refused name or class", () => {
    expect(
      creationRefusal(apiError(400, "VALIDATION_FAILED", "name too long")),
    ).toContain("name too long");
  });

  it.each([
    ["the service is down", apiError(503, "SERVICE_UNAVAILABLE")],
    ["the network fails", new TypeError("Failed to fetch")],
  ])("should ask for a retry when %s", (_l, err) => {
    expect(creationRefusal(err)).toMatch(/try again/i);
  });
});
