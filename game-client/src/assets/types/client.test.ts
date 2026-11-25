import { describe, expect, it } from "vitest";
import type { ActionMap, ClientAction } from "./client";

// FS-JS7C8 §E R47: nothing about facing goes up; the client has no `face` action to send (checked
// by tsc: the directive fails once the entry exists)
describe("ActionMap (FS-JS7C8 §E R47)", () => {
  it("should carry no face action", () => {
    // @ts-expect-error: there is no face action
    const face: ActionMap["face"] | undefined = undefined;
    expect(face).toBeUndefined();
  });
});

// FS-9JV5K §B R5, §D R17: the merchant's buy and the bag's use_item are both client actions (checked by
// tsc: an action missing from the union extracts to never, and the object fails to type)
describe("ClientAction (FS-9JV5K §B R5, §D R17)", () => {
  it("should carry a buy and a use_item", () => {
    const buy: Extract<ClientAction, { action: "buy" }> = { action: "buy", payload: { merchant_id: "merchant-1", ware: "antidote" }, seq: 1 };
    const use: Extract<ClientAction, { action: "use_item" }> = { action: "use_item", payload: { item_entity_id: "antidote-1" }, seq: 2 };
    expect([buy.action, use.action]).toEqual(["buy", "use_item"]);
  });
});
