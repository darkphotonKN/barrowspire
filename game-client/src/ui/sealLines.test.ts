import { describe, expect, it } from "vitest";
import type { SealState } from "@/types/gameState";
import { loreForReply } from "./loreCopy";
import { SEAL_REPLY_REASONS, SHRINE_LINES, SealWatch, sealKindName, sealReplyNotice } from "./sealLines";

const seal = (over: Partial<SealState> = {}): SealState => ({ kind: "lever_order", stage: 1, stages: 1, broken: false, ...over });

describe("the seal's names (FS-5FZ4J §J R53, CONTEXT.md Seal)", () => {
  it.each([
    ["lever_order", "Lever Order"],
    ["weighted_plates", "Weighted Plates"],
    ["hidden_key", "The Hidden Key"],
    ["chasm", "The Chasm"],
    ["braziers", "Braziers"],
    ["sunken_bell", "Sunken Bell"],
  ])("should name %s as %s", (kind, name) => expect(sealKindName(kind)).toBe(name));
});

describe("the seal's reply lines (FS-5FZ4J §I R49, §J R53)", () => {
  it.each(["stairs_sealed", "gate_sealed"])("should say %s is held by the seal's kind, refused", (reason) => {
    const reply = { success: false, message: "the stairs are sealed", reason };
    expect(sealReplyNotice(reply, seal({ kind: "weighted_plates" }), 0)).toEqual({ text: "Sealed. Weighted Plates holds it.", tone: "refused" });
  });

  it("should still say sealed with no seal in sight", () => {
    expect(sealReplyNotice({ success: false, message: "", reason: "stairs_sealed" }, undefined, 0)).toEqual({ text: "Sealed.", tone: "refused" });
  });

  it("should say the levers spring back on a wrong pull", () => {
    expect(sealReplyNotice({ success: false, message: "out of turn", reason: "lever_wrong" }, seal(), 0)).toEqual({
      text: "Wrong. The levers spring back.",
      tone: "refused",
    });
  });

  it("should read the mural's glyphs in order", () => {
    const reply = { success: true, message: "", reason: "mural", glyphs: ["crow", "serpent", "moon"] };
    expect(sealReplyNotice(reply, seal(), 0)).toEqual({ text: "The mural shows: Crow, Serpent, Moon.", tone: "waiting" });
  });

  it("should say one of three shrine lines, by the pick", () => {
    expect(SHRINE_LINES).toHaveLength(3);
    const said = [0, 1, 2, 3].map((n) => sealReplyNotice({ success: true, message: "", reason: "shrine" }, undefined, n));
    expect(said.map((n) => n?.text)).toEqual([...SHRINE_LINES, SHRINE_LINES[0]]);
    expect(said.every((n) => n?.tone === "waiting")).toBe(true);
    for (const line of SHRINE_LINES) expect(line).not.toMatch(/delver/i);
  });

  it("should say nothing at a lever already down or a secret door already open, nor for a reply that is not the seal's", () => {
    expect(sealReplyNotice({ success: false, message: "", reason: "lever_down" }, seal(), 0)).toBeNull();
    expect(sealReplyNotice({ success: false, message: "the door stands open", reason: "door_open" }, seal(), 0)).toBeNull();
    expect(sealReplyNotice({ success: false, message: "too far", reason: "party_not_gathered" }, seal(), 0)).toBeNull();
    expect(sealReplyNotice({ success: false, message: "too far" }, seal(), 0)).toBeNull();
  });

  it("should keep the server's words for the seal's reasons out of the lore lines: the notice says them", () => {
    for (const reason of SEAL_REPLY_REASONS) expect(loreForReply({ success: false, message: "the stairs are sealed", reason })).toBeNull();
  });
});

describe("SealWatch: the seal's events off the state (FS-5FZ4J §I R48, §J R53)", () => {
  const watched = (...states: { floor?: number; seal?: SealState }[]) => {
    const watch = new SealWatch();
    return states.map((s) => watch.see(s).map((n) => `${n.tone}: ${n.text}`));
  };

  it("should say nothing on a first broadcast, however the seal stands", () => {
    expect(watched({ floor: 3, seal: seal({ broken: true, key_carried: true }) })).toEqual([[]]);
  });

  it("should name the seal on arriving on a sealed floor", () => {
    expect(watched({ floor: 2 }, { floor: 3, seal: seal({ kind: "hidden_key" }) })).toEqual([[], ["waiting: The stairs are sealed: The Hidden Key."]]);
  });

  it("should say nothing arriving on a floor with no seal", () => {
    expect(watched({ floor: 2, seal: seal() }, { floor: 3 })).toEqual([[], []]);
  });

  it("should say the first seal breaks when the stage rises, and the seal breaks when all are", () => {
    expect(
      watched(
        { floor: 8, seal: seal({ stages: 2 }) },
        { floor: 8, seal: seal({ kind: "braziers", stage: 2, stages: 2 }) },
        { floor: 8, seal: seal({ kind: "braziers", stage: 2, stages: 2, broken: true }) },
        { floor: 8, seal: seal({ kind: "braziers", stage: 2, stages: 2, broken: true }) },
      ),
    ).toEqual([[], ["done: The first seal breaks. Another holds."], ["done: The seal breaks."], []]);
  });

  it("should say the seal breaks, once, for a one-seal floor", () => {
    expect(watched({ floor: 4, seal: seal() }, { floor: 4, seal: seal({ broken: true }) })).toEqual([[], ["done: The seal breaks."]]);
  });

  it("should say the key is taken when the party takes it", () => {
    expect(
      watched({ floor: 4, seal: seal({ kind: "hidden_key" }) }, { floor: 4, seal: seal({ kind: "hidden_key", key_carried: true }) }),
    ).toEqual([[], ["waiting: The stair key. Now the gate."]]);
  });

  it("should say the braziers gutter out when the window ends unbroken, and not when it ends in the break", () => {
    const braziers = (over: Partial<SealState>) => ({ floor: 6, seal: seal({ kind: "braziers", ...over }) });
    expect(watched(braziers({ window_ends_in: 2 }), braziers({ window_ends_in: 1 }), braziers({}))).toEqual([
      [],
      [],
      ["refused: The braziers gutter out."],
    ]);
    expect(watched(braziers({ window_ends_in: 1 }), braziers({ broken: true }))).toEqual([[], ["done: The seal breaks."]]);
  });

  it("should take a new floor as its own baseline: nothing of the last floor's seal carries", () => {
    expect(
      watched({ floor: 4, seal: seal({ kind: "hidden_key", key_carried: true }) }, { floor: 5, seal: seal({ kind: "chasm" }) }),
    ).toEqual([[], ["waiting: The stairs are sealed: The Chasm."]]);
  });

  it("should forget the last state on reset: the next is a first broadcast", () => {
    const watch = new SealWatch();
    watch.see({ floor: 2 });
    watch.reset();
    expect(watch.see({ floor: 3, seal: seal() })).toEqual([]);
  });
});
