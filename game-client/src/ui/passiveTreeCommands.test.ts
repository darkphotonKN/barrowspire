import { describe, expect, it, vi } from "vitest";
import type { MessageError } from "@/utils/class/SocketManager";
import { SPEND_PASSIVE_POINT, passiveTreeCommands, type TreeSocket } from "./passiveTreeCommands";

// FS-8RZ51 §G R38, §D R16, R21 (I-8RZ51-8): what the tree's own command module sends, and where the
// server's refusal of a spend goes.

function fakeSocket() {
  const sent: [string, unknown][] = [];
  const refusals = new Map<string, (info: MessageError) => void>();
  const socket: TreeSocket = {
    sendMessage: (action, payload) => void sent.push([action, payload]),
    onError: (action, callback) => void refusals.set(action, callback),
  };
  return { socket, sent, refusals };
}

describe("passiveTreeCommands (FS-8RZ51 R38, R16)", () => {
  it("should send spend_passive_point with the node and its target rank in town", () => {
    const { socket, sent } = fakeSocket();
    expect(passiveTreeCommands(socket, () => "hub").spend("mage.t1a", 1)).toBe(true);
    expect(sent).toEqual([["spend_passive_point", { node_id: "mage.t1a", rank: 1 }]]);
  });

  it.each(["field", "run", null] as const)("should send nothing in %s: points are spent in town", (world) => {
    const { socket, sent } = fakeSocket();
    expect(passiveTreeCommands(socket, () => world).spend("mage.t1a", 1)).toBe(false);
    expect(sent).toEqual([]);
  });

  it("should read the world as it spends, not as it was made", () => {
    const { socket, sent } = fakeSocket();
    let world: "hub" | "field" = "field";
    const tree = passiveTreeCommands(socket, () => world);
    world = "hub";
    expect(tree.spend("warrior.t1b", 2)).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it("should claim the spend's refusals and hand on the reason the server gives (R21)", () => {
    const { socket, refusals } = fakeSocket();
    const heard: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    passiveTreeCommands(socket, () => "hub").onRefused((reason) => void heard.push(reason));
    expect([...refusals.keys()]).toEqual([SPEND_PASSIVE_POINT]);
    refusals.get(SPEND_PASSIVE_POINT)!({ action: SPEND_PASSIVE_POINT, error: "No points to spend.", message: "No points to spend." });
    refusals.get(SPEND_PASSIVE_POINT)!({ action: SPEND_PASSIVE_POINT, error: "Unknown node." });
    expect(heard).toEqual(["No points to spend.", "Unknown node."]);
    warn.mockRestore();
  });
});
