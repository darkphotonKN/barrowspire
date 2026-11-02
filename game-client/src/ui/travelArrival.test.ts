import { beforeEach, describe, expect, it } from "vitest";
import { useChatStore } from "@/stores/chatStore";
import { useGameStore } from "@/stores/gameStore";
import { travelArrival } from "./travelArrival";

// FS-NCC9J §Requirements R20, R28; I-NCC9J-8: what a travel's hub handoff enters with, and how a
// move that did not happen is told.

const marl = {
  id: "c-1",
  name: "Marl",
  className: "Warrior",
  level: 3,
  experience: 900,
  levelFloor: 800,
  createdAt: "2026-11-01T00:00:00Z",
};

describe("travelArrival", () => {
  beforeEach(() => {
    useChatStore.setState({ lines: [] } as never);
  });

  it("enters as the character this player plays", () => {
    useGameStore.setState({ characters: [marl] as never, activeCharacterId: "c-1" });

    expect(travelArrival.enterHub()).toMatchObject({ characterId: "c-1", characterName: "Marl" });
  });

  it("has nothing to enter as with no character", () => {
    useGameStore.setState({ characters: [], activeCharacterId: null });

    expect(travelArrival.enterHub()).toBeNull();
  });

  it("tells a refusal as a system line in the chat window", () => {
    travelArrival.refused("The hub is full. Try again shortly.");

    expect(useChatStore.getState().lines).toContainEqual(
      expect.objectContaining({ kind: "system", text: "The hub is full. Try again shortly." }),
    );
  });
});
