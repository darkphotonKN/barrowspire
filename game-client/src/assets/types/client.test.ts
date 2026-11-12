import { describe, expect, it } from "vitest";
import type { ActionMap } from "./client";

// FS-JS7C8 §E R47: nothing about facing goes up; the client has no `face` action to send (checked
// by tsc: the directive fails once the entry exists)
describe("ActionMap (FS-JS7C8 §E R47)", () => {
  it("should carry no face action", () => {
    // @ts-expect-error: there is no face action
    const face: ActionMap["face"] | undefined = undefined;
    expect(face).toBeUndefined();
  });
});
