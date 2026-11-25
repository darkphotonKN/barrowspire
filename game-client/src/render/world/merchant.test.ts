import { describe, expect, it } from "vitest";
import { npcArtFor } from "@/render/art/sceneArt";
import type { MerchantState } from "@/types/gameState";
import { palette } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import { MerchantSet, merchantLantern, type MerchantLook } from "./merchant";
import { INTERACT_RANGE } from "./stairs";

type Point = { x: number; y: number };

/** A stand-in for the scene and its art: each body drawn and every call made on it, the art's fetches. */
function recording(own = false) {
  type Body = { look: MerchantLook; at: Point; calls: string[]; destroyed: boolean; destroy(): void };
  const made: Body[] = [];
  const fetches: { group: string; landed: () => void }[] = [];
  const art = {
    held: own,
    has: (sheet: string) => sheet !== "npc_merchant" || art.held,
    fetch: (group: string, landed: () => void) => void fetches.push({ group, landed }),
  };
  const set = new MerchantSet<Body>(
    {
      add: (look, at) => {
        const body: Body = { look, at, calls: [], destroyed: false, destroy: () => void (body.destroyed = true) };
        made.push(body);
        return body;
      },
      wear: (body, look) => {
        body.look = look;
        body.calls.push(`wear ${look.sheet}`);
      },
      stand: (body, at) => {
        body.at = at;
        body.calls.push(`stand ${at.x},${at.y}`);
      },
    },
    () => art,
  );
  const live = () => made.filter((b) => !b.destroyed);
  return { set, made, live, fetches, art };
}

const merchant = (over: Partial<MerchantState> = {}): MerchantState => ({
  entity_id: "merchant-1",
  position: { x: 900, y: 420 },
  wares: [{ ware: "antidote", price: 40, left: 3, item: { name: "Antidote", item_type: "consumable" } }],
  ...over,
});

// FS-9JV5K §F R21, §G R26 (I-9JV5K-5)
describe("MerchantSet: the wandering merchant on the canvas (FS-9JV5K §F R21)", () => {
  it("should draw him at his position as his stand-in, and fetch his own group the first time a state carries him", () => {
    const { set, made, fetches } = recording();
    set.sync({ merchant: merchant() });
    const row = npcArtFor("merchant")!;
    expect(made.map(({ look, at }) => ({ look, at }))).toEqual([
      { look: { sheet: "char_mercenary_base", tint: palette.merchantStandIn }, at: { x: 900, y: 420 } },
    ]);
    expect(fetches.map((f) => f.group)).toEqual([row.group]);
  });

  it("should re-dress him in his own sheet, untinted, once his group lands", () => {
    const { set, made, fetches, art } = recording();
    set.sync({ merchant: merchant() });
    art.held = true;
    fetches[0].landed();
    expect(made[0].look).toEqual({ sheet: "npc_merchant" });
    expect(made[0].calls).toEqual(["wear npc_merchant"]);
  });

  it("should draw him in his own sheet at once, fetching nothing, when it is already in", () => {
    const { set, made, fetches } = recording(true);
    set.sync({ merchant: merchant() });
    expect(made[0].look).toEqual({ sheet: "npc_merchant" });
    expect(fetches).toEqual([]);
  });

  it("should keep one body across states, stand it again when he moves, and take it down when he leaves the state", () => {
    const { set, made, live } = recording(true);
    set.sync({ merchant: merchant() });
    set.sync({ merchant: merchant() });
    set.sync({ merchant: merchant({ position: { x: 920, y: 420 } }) });
    expect(made).toHaveLength(1);
    expect(made[0].calls).toEqual(["stand 920,420"]);
    set.sync({});
    expect(live()).toEqual([]);
    expect(set.current()).toBeUndefined();
  });

  it("should draw a new body for a merchant with another entity id (a new floor's)", () => {
    const { set, made, live } = recording(true);
    set.sync({ merchant: merchant() });
    set.sync({ merchant: merchant({ entity_id: "merchant-2" }) });
    expect(made).toHaveLength(2);
    expect(live()).toEqual([made[1]]);
  });

  it("should leave a body that landed after he left as it is: nothing is re-dressed", () => {
    const { set, made, fetches, art } = recording();
    set.sync({ merchant: merchant() });
    set.sync({});
    art.held = true;
    fetches[0].landed();
    expect(made[0].calls).toEqual([]);
  });

  it("should hold his latest wares for the panel", () => {
    const { set } = recording(true);
    const sold = merchant({ wares: [{ ware: "antidote", price: 40, left: 0 }] });
    set.sync({ merchant: merchant() });
    set.sync({ merchant: sold });
    expect(set.current()).toBe(sold);
  });

  it("should be the E target within the interact range, with how far he stands, and none beyond it", () => {
    const { set } = recording(true);
    set.sync({ merchant: merchant() });
    expect(set.reach({ x: 900 + 30, y: 420 })).toEqual({ target: { kind: "merchant", entityId: "merchant-1" }, distance: 30 });
    expect(set.reach({ x: 900 + INTERACT_RANGE, y: 420 })).toBeNull();
    set.sync({});
    expect(set.reach({ x: 900, y: 420 })).toBeNull();
  });

  it("should list where he stands for the hide rule, and clear or forget him", () => {
    const { set, made, live } = recording(true);
    set.sync({ merchant: merchant() });
    expect(set.placed()).toEqual([{ sprite: made[0], pos: { x: 900, y: 420 } }]);
    set.clear();
    expect(live()).toEqual([]);
    expect(set.placed()).toEqual([]);
    set.sync({ merchant: merchant() });
    set.forget();
    expect(made[1].destroyed).toBe(false);
    expect(set.placed()).toEqual([]);
  });
});

describe("merchantLantern: his soft lantern light (FS-9JV5K §F R21)", () => {
  it("should be a small warm light at his lantern, softer than a sconce, steady per place", () => {
    const at = { x: 120, y: 80 };
    const light = merchantLantern(at, 7);
    expect(light).toMatchObject({ x: 120, color: BARROW_HEX.amberBright, seed: 7 });
    expect(light.y).toBeLessThan(at.y);
    expect(light.intensity).toBeLessThan(0.6);
    expect(merchantLantern(at, 7)).toEqual(light);
  });
});
