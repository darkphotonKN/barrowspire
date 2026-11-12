/**
 * What the main menu's primary button and status line say for the game socket's status, and what
 * pressing the button does (FS-R6EYZ §C). Phaser-free; `MainMenuScene` draws it.
 */

import type { ConnectionStatus } from "@/utils/class/SocketManager";

/**
 * The primary button takes the player into the town (the hub), not into a delve: the Spire's door
 * starts those.
 */
export const ENTER_LABEL = "ENTER THE TOWN";

/** What pressing the primary button does: enter the town, reconnect, or nothing. */
export type MenuPress = "enter" | "reconnect" | null;

export interface MenuConnectionView {
  /** The primary button's words. */
  label: string;
  press: MenuPress;
  /** The status line under it, and its tone in the menu's palette. */
  line: string;
  tone: "label" | "text" | "danger";
}

/** Down: the button reconnects, so a server still restarting never leaves a dead button (R15). */
const DOWN: MenuConnectionView = {
  label: "RECONNECT",
  press: "reconnect",
  line: "The torch gutters // Connection lost",
  tone: "danger",
};

const VIEWS: Record<ConnectionStatus, MenuConnectionView> = {
  connected: {
    label: ENTER_LABEL,
    press: "enter",
    line: "The way is open // Server connected",
    tone: "label",
  },
  connecting: {
    label: "CONNECTING...",
    press: null,
    line: "Kindling torch // Connecting to game server...",
    tone: "text",
  },
  disconnected: DOWN,
  error: DOWN,
};

export function menuConnectionView(status: ConnectionStatus): MenuConnectionView {
  return VIEWS[status];
}

/** The socket as the menu reconnects it. `SocketManager` is one. */
export interface MenuSocket {
  getConnectionStatus(): ConnectionStatus;
  reconnectFromMenu(): void;
}

/**
 * The menu came up: with the socket down it reconnects at once (R14), as after the disconnect
 * notice's Return to menu or a boot that could not reach the server. Open or connecting, nothing.
 */
export function reconnectOnArrival(socket: MenuSocket): void {
  const status = socket.getConnectionStatus();
  if (status === "disconnected" || status === "error") socket.reconnectFromMenu();
}
