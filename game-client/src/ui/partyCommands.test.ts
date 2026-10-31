import { describe, expect, it, vi } from "vitest";
import {
  partyCommands,
  routePartyErrors,
  type PartyErrorSocket,
  type PartySocket,
} from "./partyCommands";

// FS-R82NV §Requirements R4a, R12, R19, R20, R29, R30, R32: what the panel's and the invite prompt's actions send.

function fakeSocket() {
  const sent: [string, unknown][] = [];
  const socket: PartySocket = {
    sendMessage: (action, payload) => {
      sent.push([action, payload]);
    },
  };
  return { socket, sent };
}

function fakeErrorSocket() {
  const refusals = new Map<
    string,
    (info: { action: string; error: string }) => void
  >();
  const socket: PartyErrorSocket = {
    onError: (action, callback) => {
      refusals.set(action, callback);
    },
  };
  return { socket, refusals };
}

describe("partyCommands", () => {
  it("should send party_invite with the name as typed, trimmed", () => {
    const { socket, sent } = fakeSocket();
    expect(partyCommands(socket).invite("  Wren ")).toBe(true);
    expect(sent).toEqual([["party_invite", { name: "Wren" }]]);
  });

  it("should send nothing for a blank name", () => {
    const { socket, sent } = fakeSocket();
    expect(partyCommands(socket).invite("   ")).toBe(false);
    expect(sent).toEqual([]);
  });

  it("should send party_create with no payload (R4a, R30)", () => {
    const { socket, sent } = fakeSocket();
    partyCommands(socket).create();
    expect(sent).toEqual([["party_create", {}]]);
  });

  it("should send kick, transfer and leave", () => {
    const { socket, sent } = fakeSocket();
    const party = partyCommands(socket);
    party.kick("p-2");
    party.transfer("p-3");
    party.leave();
    expect(sent).toEqual([
      ["party_kick", { target_id: "p-2" }],
      ["party_transfer", { target_id: "p-3" }],
      ["party_leave", {}],
    ]);
  });

  it("should answer an invite by its id (R32)", () => {
    const { socket, sent } = fakeSocket();
    const party = partyCommands(socket);
    party.accept("inv-1");
    party.decline("inv-2");
    expect(sent).toEqual([
      ["party_accept", { invite_id: "inv-1" }],
      ["party_decline", { invite_id: "inv-2" }],
    ]);
  });

  it("should claim every party action's error replies once routed, so no refusal reaches the session's handler", () => {
    const { socket, refusals } = fakeErrorSocket();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    routePartyErrors(socket);

    expect([...refusals.keys()].sort()).toEqual([
      "party_accept",
      "party_create",
      "party_decline",
      "party_invite",
      "party_kick",
      "party_leave",
      "party_transfer",
    ]);
    // a server without the handler yet answers "Unknown action": swallowed, logged
    expect(() =>
      refusals.get("party_kick")!({
        action: "party_kick",
        error: "Unknown action",
      }),
    ).not.toThrow();
    warn.mockRestore();
  });
});
