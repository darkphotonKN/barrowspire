import { palette, toCss } from "../canvasPalette";
import {
  ActionMap,
  ClientMessage,
  WorldEnteredPayload,
  WorldHandoffPayload,
} from "@/assets/types/client";
import { ClientGameState, isGameState } from "@/types/gameState";
import { GameStateLogger } from "@/utils/gameStateLogger";
import { useGameStore } from "@/stores/gameStore";
import { useAuthStore } from "@/stores/authStore";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/** The game server a client reaches until a handoff moves it somewhere else. */
export const DEFAULT_SERVER_ADDR = "ws://localhost:5668/game/ws";

// WebSocket.readyState values, spelled out so the manager doesn't need the
// browser global to compare against
const SOCKET_OPEN = 1;
const SOCKET_CLOSING = 2;
const SOCKET_CLOSED = 3;

/** The part of a WebSocket the manager uses, so a test can drive one by hand. */
export interface SocketLike {
  readyState: number;
  onopen: ((ev: any) => void) | null;
  onclose: ((ev: any) => void) | null;
  onerror: ((ev: any) => void) | null;
  onmessage: ((ev: any) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

// SocketManager.js
export class SocketManager {
  private socket: SocketLike | null = null;
  private listeners: Map<string, (data: any) => void> = new Map();
  // Status callback
  private onStatusChange?: (status: string, color: string) => void;
  // Auth error callback
  private onAuthError?: () => void;
  // Generic server-side message error callback (top-level `error` field)
  private onMessageError?: (info: {
    action: string;
    error: string;
    message?: string;
  }) => void;
  // Connection status
  private connectionStatus: ConnectionStatus = "disconnected";
  private connectionStatusListeners: Set<(status: ConnectionStatus) => void> =
    new Set();
  private seq: number = 0;
  // Game state listeners
  private gameStateListeners: Set<(state: ClientGameState) => void> = new Set();

  // Where this client's game server is. It starts at the default and follows
  // every handoff, so a reconnect returns to the host the delver moved to rather
  // than the server they started on. FS-K2HKP §Requirements 29.
  private serverAddr: string = DEFAULT_SERVER_ADDR;
  private token = "";
  private name = "";
  // The socket to a run's host while the move is being decided, and the run it
  // is for. The run id stays after the move, so a repeated handoff is ignored.
  private pending: SocketLike | null = null;
  private handoffSessionId: string | null = null;

  constructor(
    private createSocket: (url: string) => SocketLike = (url) => new WebSocket(url),
  ) {}

  getServerAddress(): string {
    return this.serverAddr;
  }

  /** Connects to the game server as this delver, remembering who they are for later reconnects and handoffs. */
  connectToGame(token: string, name: string): void {
    this.token = token;
    this.name = name;
    this.connect(this.gameUrl());
  }

  /** Connects again as the same delver, to whichever server they were last on. */
  reconnect(): void {
    this.connect(this.gameUrl());
  }

  private gameUrl(): string {
    return `${this.serverAddr}?token=${this.token}&name=${this.name}`;
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  isConnected(): boolean {
    return this.connectionStatus === "connected";
  }

  onConnectionStatusChange(
    callback: (status: ConnectionStatus) => void,
  ): () => void {
    this.connectionStatusListeners.add(callback);
    // 立即觸發一次當前狀態
    callback(this.connectionStatus);
    // 返回取消訂閱函數
    return () => {
      this.connectionStatusListeners.delete(callback);
    };
  }

  private setConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatus = status;
    this.connectionStatusListeners.forEach((listener) => listener(status));
  }

  setOnAuthError(callback: () => void) {
    this.onAuthError = callback;
  }

  setOnMessageError(
    callback: (info: { action: string; error: string; message?: string }) => void,
  ) {
    this.onMessageError = callback;
  }

  disconnect() {
    this.dropPending();
    if (this.socket) {
      this.socket.close(1000, "client_disconnect");
      this.socket = null;
    }
    this.setConnectionStatus("disconnected");
  }

  private connect(url: string) {
    if (this.socket) return; // 避免重複連接

    this.setConnectionStatus("connecting");
    this.socket = this.createSocket(url);
    this.attach(this.socket);
  }

  /** Makes `socket` the one the game talks through: its status, its closes, its messages. */
  private attach(socket: SocketLike) {
    socket.onopen = () => {
      console.log("WebSocket connected");
      this.setConnectionStatus("connected");
      this.updateStatus("WebSocket Connected", toCss(palette.safe));
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.setConnectionStatus("error");
      this.updateStatus("WebSocket Error", toCss(palette.damageBright));
    };

    socket.onclose = (event) => {
      console.log("WebSocket disconnected, code:", event.code, "reason:", event.reason);
      if (this.socket === socket) {
        this.socket = null;
      }

      // Close code 4001 = auth error (token invalid/expired)
      if (event.code === 4001) {
        console.log("Auth error detected, redirecting to login...");
        if (this.onAuthError) {
          this.onAuthError();
        }
        return;
      }

      this.setConnectionStatus("disconnected");
      this.updateStatus("WebSocket Disconnected", toCss(palette.hudLabel));
    };

    socket.onmessage = (event) => {
      try {
        this.dispatch(JSON.parse(event.data));
      } catch (e) {
        console.error("Failed to parse message:", e);
        GameStateLogger.logError("Failed to parse WebSocket message", e);
      }
    };
  }

  private dispatch(data: any) {
    // Top-level server error (e.g. duplicate queue, invalid action). Surface to a global handler.
    if (data.error) {
      console.warn("Server error message received:", data);
      if (this.onMessageError) {
        this.onMessageError({
          action: data.action ?? "",
          error: String(data.error),
          message: data.payload?.message,
        });
      }
      return;
    }

    // Check if it's a game state update
    if (isGameState(data)) {
      this.handleGameStateUpdate(data);
    } else if (data.action === "world_entered") {
      // The ONE place the client learns which world it is in. Never infer
      // it from the shape of a state broadcast. FS-29KSH §Requirements 36.
      this.handleWorldEntered(data.payload as WorldEnteredPayload);
      this.listeners.get(data.action)?.(data.payload);
    } else if (data.action === "world_handoff") {
      // The run is on another server: move there, then let the world_entered
      // the host sends do the scene switch as it always does
      this.handoff(data.payload as WorldHandoffPayload);
      this.listeners.get(data.action)?.(data.payload);
    } else if (data.action && this.listeners.has(data.action)) {
      // Handle action-based messages
      console.log("Received action message:", data.action);
      this.listeners.get(data.action)?.(data.payload);
    } else {
      // Log unhandled messages for debugging
      console.log("Received unhandled message:", data);
    }
  }

  /**
   * Follows a handoff to the server hosting a run, make-before-break: the
   * current socket stays live until the host has seated us, so a refused or
   * failed move leaves the delver standing where they were.
   * FS-K2HKP §Requirements 22–24, 29, 31.
   */
  private handoff(payload: WorldHandoffPayload) {
    if (!payload?.addr || !payload?.session_id) {
      console.error("world_handoff missing addr or session_id:", payload);
      return;
    }

    // already moving to (or moved to) this run
    if (this.handoffSessionId === payload.session_id) return;

    this.dropPending();
    this.handoffSessionId = payload.session_id;

    const next = this.createSocket(`${payload.addr}?token=${this.token}&session_id=${payload.session_id}`);
    this.pending = next;

    // The host upgrades before it decides and refuses by closing with 4002, so
    // the socket opening proves nothing. Its world_entered is the acceptance.
    // Anything it sends before that is held and replayed after the swap.
    const held: any[] = [];
    next.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        console.error("Failed to parse handoff message:", e);
        return;
      }

      if (data.action !== "world_entered") {
        held.push(data);
        return;
      }

      this.promote(next, payload.addr);
      this.dispatch(data);
      held.forEach((message) => this.dispatch(message));
    };

    next.onerror = (error) => {
      // the close that follows decides what happens
      console.warn("Handoff socket error:", error);
    };

    next.onclose = (event) => {
      if (this.pending !== next) return;
      this.handoffFailed(payload.session_id, event.code);
    };
  }

  /** The host seated us: the new socket becomes the game's, and the old one is let go quietly. */
  private promote(next: SocketLike, addr: string) {
    const old = this.socket;
    this.pending = null;

    if (old) {
      // detached first, so its close reads as neither a disconnect nor an auth failure
      old.onopen = null;
      old.onclose = null;
      old.onerror = null;
      old.onmessage = null;
      old.close(1000, "handoff");
    }

    this.socket = next;
    this.serverAddr = addr;
    this.attach(next);
    this.setConnectionStatus("connected");
  }

  private handoffFailed(sessionId: string, code: number) {
    console.warn("Handoff to run refused or failed:", sessionId, "code:", code);
    this.pending = null;
    this.handoffSessionId = null;

    // Still on the old socket: stay in the hub. If it is gone too, go back to
    // the server we were on, which puts us in its hub.
    const old = this.socket;
    if (!old || old.readyState === SOCKET_CLOSING || old.readyState === SOCKET_CLOSED) {
      this.socket = null;
      this.reconnect();
    }

    this.listeners.get("world_handoff_failed")?.({ session_id: sessionId, code });
  }

  private dropPending() {
    const pending = this.pending;
    if (!pending) return;

    this.pending = null;
    pending.onopen = null;
    pending.onclose = null;
    pending.onerror = null;
    pending.onmessage = null;
    pending.close(1000, "handoff_cancelled");
  }

  /**
   * Records the world the server has placed us in. Scenes listen for
   * "world_entered" to switch; this keeps the store the single source of truth
   * for which world that is.
   */
  private handleWorldEntered(payload: WorldEnteredPayload): void {
    if (!payload?.session_id || !payload?.world_type) {
      console.error("world_entered missing session_id or world_type:", payload);
      return;
    }

    useGameStore.getState().setWorld(payload.session_id, payload.world_type);
    console.log(`Entered ${payload.world_type}:`, payload.session_id);
  }

  private updateStatus(status: string, color: string): void {
    if (this.onStatusChange) {
      this.onStatusChange(status, color);
    }
  }

  // websocket send message
  sendMessage<T extends keyof ActionMap>(
    action: T,
    payload: ActionMap[T],
  ): void {
    if (this.socket && this.socket.readyState === SOCKET_OPEN) {
      // Auto-inject player_id. The world a message belongs to is NOT sent —
      // the server routes on its own record of the player (FS-29KSH §Requirements 16).
      const playerId = useAuthStore.getState().memberInfo?.id;

      const enrichedPayload = {
        ...payload,
        player_id: playerId,
      };

      const message: ClientMessage<T> = {
        action,
        payload: enrichedPayload,
        seq: ++this.seq,
      };

      // Debug logging for outgoing messages (level 2+ = info)
      if (GameStateLogger.getLevel() >= 2) {
        console.log(
          `%c[WebSocket Send] Action: ${action}`,
          'color: #ff69b4; font-weight: bold',
          payload,
        );
      }

      this.socket.send(JSON.stringify(message));
    } else {
      console.warn('Cannot send message: WebSocket not connected');
    }
  }

  // 監聽特定 action
  on(action: string, callback: (payload: any) => void): void {
    this.listeners.set(action, callback);
  }

  // 取消監聽
  off(action: string): void {
    this.listeners.delete(action);
  }

  // Subscribe to game state updates
  onGameStateUpdate(callback: (state: ClientGameState) => void): () => void {
    this.gameStateListeners.add(callback);
    // Return unsubscribe function
    return () => {
      this.gameStateListeners.delete(callback);
    };
  }

  // Handle game state updates
  private handleGameStateUpdate(state: ClientGameState): void {
    // Log the state with formatted output
    GameStateLogger.logGameState(state);

    // Notify all game state listeners
    this.gameStateListeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        console.error("Error in game state listener:", error);
      }
    });
  }
}

export const socketManager = new SocketManager();
