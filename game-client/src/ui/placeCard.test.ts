import { describe, expect, it } from "vitest";
import type { FieldId } from "@/assets/types/client";
import { FIELD_IDS, FIELD_NAMES, type FieldDestination } from "@/scenes/hubGates";
import { floorCard } from "./floor";
import { PLACE_CARDS, placeCard, type CardWords } from "./placeCard";

// FS-PQ2TW §C R19, R23; ADR-0073 Decision 5. I-PQ2TW-1: the arrival card's words, one table.

describe("placeCard (FS-PQ2TW R19, R23)", () => {
  it("should give a climbed floor the words the climb has today", () => {
    for (const floor of [2, 3, 10, 12])
      for (const top of [false, true])
        expect(placeCard({ world: "run", floor, top })).toEqual(floorCard({ floor, top }));
  });

  it("should name the town by the screen's word for the hub", () => {
    expect(placeCard({ world: "hub" })).toEqual({
      title: "The Town",
      line: "The Spire's shadow lies on every roof.",
    });
  });

  it.each<[FieldId, string, string]>([
    ["gentle_meadows", "Gentle Meadows", "The grass is soft, and the Spire is far."],
    ["forlorn_forest", "The Forlorn Forest", "The dead have not left these trees."],
    ["dev_test_room", "Dev Test Room", "Nothing here is kept."],
  ])("should give the field %s its name and its line", (field, title, line) => {
    expect(placeCard({ world: "field", field })).toEqual({ title, line });
  });

  it("should title each field as its gate's signpost names it", () => {
    for (const [gate, id] of Object.entries(FIELD_IDS) as [FieldDestination, FieldId][])
      expect(PLACE_CARDS.field[id].title).toBe(FIELD_NAMES[gate]);
  });

  it("should not compile a table that leaves a field out", () => {
    const words: CardWords = { title: "A Place", line: "A line." };
    // @ts-expect-error a field id with no entry does not build (R23): the forest is missing
    const short: typeof PLACE_CARDS.field = { gentle_meadows: words, dev_test_room: words };
    expect(Object.keys(short)).toHaveLength(2);
  });

  it("should speak in the lore voice, never the sci-fi register", () => {
    const all = [PLACE_CARDS.hub, ...Object.values(PLACE_CARDS.field)];
    for (const { title, line } of all)
      expect(`${title} ${line}`).not.toMatch(/sector|level|deploy|extraction|operator|uplink|void/i);
  });
});
