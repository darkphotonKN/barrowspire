import { describe, expect, it, vi } from "vitest";
import type { ConnectionStatus } from "@/utils/class/SocketManager";
import { ENTER_LABEL, menuConnectionView, reconnectOnArrival } from "./menuConnection";

describe("menuConnectionView (FS-R6EYZ R15: the menu's primary button by the socket's status)", () => {
  it.each([
    ["connected", ENTER_LABEL, "enter", "The way is open // Server connected", "label"],
    ["connecting", "CONNECTING...", null, "Kindling torch // Connecting to game server...", "text"],
    ["disconnected", "RECONNECT", "reconnect", "The torch gutters // Connection lost", "danger"],
    ["error", "RECONNECT", "reconnect", "The torch gutters // Connection lost", "danger"],
  ] as const)("should show %s as %s", (status, label, press, line, tone) => {
    expect(menuConnectionView(status)).toEqual({ label, press, line, tone });
  });

  it("should still take the player into the town when connected", () => {
    expect(ENTER_LABEL).toBe("ENTER THE TOWN");
  });
});

describe("reconnectOnArrival (FS-R6EYZ R14: the menu reconnects when it comes up with the socket down)", () => {
  it.each([
    ["disconnected", 1],
    ["error", 1],
    ["connected", 0],
    ["connecting", 0],
  ] as const)("should reconnect from the menu %s: %i time(s)", (status, times) => {
    const socket = {
      getConnectionStatus: (): ConnectionStatus => status,
      reconnectFromMenu: vi.fn(),
    };
    reconnectOnArrival(socket);
    expect(socket.reconnectFromMenu).toHaveBeenCalledTimes(times);
  });
});
