import { palette, toCss } from "../canvasPalette";
import {
  ActionMap,
  ClientMessage,
  EnterHubPayload,
  WorldEnteredPayload,
  WorldHandoffPayload,
} from "@/assets/types/client";
import { ClientGameState, isGameState } from "@/types/gameState";
import { GameStateLogger } from "@/utils/gameStateLogger";
import { travelArrival } from "@/ui/travelArrival";
import { useGameStore } from "@/stores/gameStore";
import { useAuthStore } from "@/stores/authStore";
import { isChatLine, isChatNotice, useChatStore } from "@/stores/chatStore";
import {
  isPartyInvite,
  isPartyNotice,
  isPartyReadyCheck,
  isPartyUpdate,
  usePartyStore,
} from "@/stores/partyStore";
import { useMailboxStore } from "@/stores/mailboxStore";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/** The game server a client reaches until a handoff moves it somewhere else. */
export const DEFAULT_SERVER_ADDR =
  process.env.NEXT_PUBLIC_GAME_SERVER_ADDR || "ws://localhost:5668/game/ws";

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

/**
 * What a travel's hub handoff needs from the game (FS-NCC9J R20): what to enter the leader's hub
 * with (null when there is nothing to enter as), and how to tell the player a move did not happen.
 */
export interface HubArrival {
  enterHub(): EnterHubPayload | null;
  refused(text: string): void;
}

/** Said when a travel's move cannot be made: the leader's server unreachable, or no character. */
export const TRAVEL_UNREACHABLE = "Your party's village could not be reached.";

/** A refused action: the action, the server's error, and its message for the player if any. */
export interface MessageError {
  action: string;
  error: string;
  message?: string;
  /** The refusal's stable reason code, when the server sends one: switched on, never shown. */
  reason?: string;
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
  private onMessageError?: (info: MessageError) => void;
  // Error replies a scene handles for one action itself; everything else goes to the global one
  private errorListeners: Map<string, (info: MessageError) => void> = new Map();
  // Connection status
  private connectionStatus: ConnectionStatus = "disconnected";
  private connectionStatusListeners: Set<(status: ConnectionStatus) => void> =
    new Set();
  private seq: number = 0;
  // Game state listeners
  private gameStateListeners: Set<(state: ClientGameState) => void> = new Set();

  // Where this client's game server is. It starts at the default and follows
  // every handoff, so a reconnect returns to the host the player moved to rather
  // than the server they started on. FS-K2HKP §Requirements 29.
  private serverAddr: string = DEFAULT_SERVER_ADDR;
  private token = "";
  private name = "";
  // The socket to a run's host while the move is being decided, and the run it
  // is for. The run id stays after the move, so a repeated handoff is ignored.
  private pending: SocketLike | null = null;
  private handoffSessionId: string | null = null;
  // Sockets opened with redirected=1: a server sent the client there, so a redirect arriving on
  // one is never followed. FS-MCYWK C17.
  private redirected = new WeakSet<SocketLike>();

  constructor(
    private createSocket: (url: string) => SocketLike = (url) =>
      new WebSocket(url),
    private arrival: HubArrival = travelArrival,
  ) {}

  getServerAddress(): string {
    return this.serverAddr;
  }

  /** Connects to the game server as this player, remembering who they are for later reconnects and handoffs. */
  connectToGame(token: string, name: string): void {
    this.token = token;
    this.name = name;
    this.connect(this.gameUrl());
  }

  /** Connects again as the same player, to whichever server they were last on. */
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

  setOnMessageError(callback: (info: MessageError) => void) {
    this.onMessageError = callback;
  }

  /**
   * Hear the server refuse one action (a reply on that action with `error` set) instead of the
   * global handler: the refusal is that action's own business, not a session problem. One
   * listener per action; `offError` hands the action back to the global handler.
   */
  onError(action: string, callback: (info: MessageError) => void): void {
    this.errorListeners.set(action, callback);
  }

  offError(action: string): void {
    this.errorListeners.delete(action);
  }

  disconnect() {
    this.dropPending();
    if (this.socket) {
      this.socket.close(1000, "client_disconnect");
      this.socket = null;
    }
    this.setConnectionStatus("disconnected");
  }

  private connect(url: string, closedUnopened?: () => void) {
    if (this.socket) return; // 避免重複連接

    this.setConnectionStatus("connecting");
    this.socket = this.createSocket(url);
    this.attach(this.socket, closedUnopened);
  }

  /**
   * Makes `socket` the one the game talks through: its status, its closes, its messages.
   * `closedUnopened`, when given, takes the place of the ordinary error and close if the socket
   * fails before it ever opened.
   */
  private attach(socket: SocketLike, closedUnopened?: () => void) {
    // a socket promoted after a handoff is attached already open
    let opened = socket.readyState === SOCKET_OPEN;
    socket.onopen = () => {
      opened = true;
      console.log("WebSocket connected");
      this.setConnectionStatus("connected");
      this.updateStatus("WebSocket Connected", toCss(palette.safe));
    };

    socket.onerror = (error) => {
      if (!opened && closedUnopened) {
        // the close that follows decides what happens; no error is shown meanwhile
        console.warn("WebSocket error before open:", error);
        return;
      }
      console.error("WebSocket error:", error);
      this.setConnectionStatus("error");
      this.updateStatus("WebSocket Error", toCss(palette.damageBright));
    };

    socket.onclose = (event) => {
      console.log(
        "WebSocket disconnected, code:",
        event.code,
        "reason:",
        event.reason,
      );
      const current = this.socket === socket;
      if (current) {
        this.socket = null;
      }

      // only while it is still the game's socket: a client that let it go is done with it
      if (!opened && current && closedUnopened) {
        closedUnopened();
        return;
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
      const info: MessageError = {
        action: data.action ?? "",
        error: String(data.error),
        message: data.payload?.message,
      };
      // a stable reason the client writes its own copy for (FS-X2F2H §Requirements 60)
      if (typeof data.payload?.reason === "string")
        info.reason = data.payload.reason;
      const scoped = this.errorListeners.get(info.action);
      if (scoped) scoped(info);
      else this.onMessageError?.(info);
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
    } else if (
      data.action === "world_handoff" &&
      data.payload?.reconnect === true
    ) {
      // A landing pod sending us back to the pod still holding the player: it carries neither
      // `hub` nor `session_id`, so it is checked first. FS-MCYWK C14.
      this.redirect(data.payload as WorldHandoffPayload);
    } else if (data.action === "world_handoff" && data.payload?.hub === true) {
      // A travel to the party leader's town: no match, so the delve's listener
      // hears nothing; the host's world_entered switches the scene. FS-NCC9J R20.
      this.hubHandoff(data.payload as WorldHandoffPayload);
    } else if (data.action === "world_handoff") {
      // The run is on another server: move there, then let the world_entered
      // the host sends do the scene switch as it always does
      this.handoff(data.payload as WorldHandoffPayload);
      this.listeners.get(data.action)?.(data.payload);
    } else if (data.action === "chat") {
      // The chat stream outlives any scene, so a line goes to the store here
      // rather than to whichever scene happens to listen. FS-WJGFJ §C20.
      if (!isChatLine(data.payload)) return;
      useChatStore.getState().receive(data.payload);
      this.listeners.get(data.action)?.(data.payload);
    } else if (data.action === "chat_notice") {
      if (!isChatNotice(data.payload)) return;
      useChatStore.getState().notice(data.payload);
      this.listeners.get(data.action)?.(data.payload);
    } else if (data.action === "party_update") {
      // The party outlives any scene too: the store holds it for the panel. FS-R82NV R21.
      if (!isPartyUpdate(data.payload)) return;
      usePartyStore.getState().apply(data.payload);
      this.listeners.get(data.action)?.(data.payload);
    } else if (data.action === "party_invite") {
      // An invite waits in the store for an answer, whatever scene is up. FS-R82NV R32.
      if (!isPartyInvite(data.payload)) return;
      usePartyStore.getState().receiveInvite(data.payload);
      this.listeners.get(data.action)?.(data.payload);
    } else if (data.action === "party_notice") {
      // A code and maybe a name; the words are the client's, shown as a system line. FS-R82NV R31, R36.
      if (!isPartyNotice(data.payload)) return;
      usePartyStore.getState().receiveNotice(data.payload);
      this.listeners.get(data.action)?.(data.payload);
    } else if (data.action === "party_ready_check") {
      // The ready-check popup reads the store; the hub's one listener still hears it, to give the
      // door's Enter as a party back. FS-BJNYC R21, R23.
      if (!isPartyReadyCheck(data.payload)) return;
      usePartyStore.getState().receiveReadyCheck(data.payload);
      this.listeners.get(data.action)?.(data.payload);
    } else if (data.action === "mail_arrived") {
      // A letter was just sent to this player: a hint to look, carrying no letter. The mailbox
      // store fetches the summary while the player is in the town and drops it anywhere else.
      // The client never sends this action. FS-1GZGD R34, R43; ADR-0045.
      void useMailboxStore.getState().arrived();
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
   * Follows a redirect to the pod still holding the player, break-before-make: the landing pod
   * holds nothing for us, so its socket is let go quietly and we reconnect, as the same player,
   * to `addr`. FS-MCYWK C15.
   */
  private redirect(payload: WorldHandoffPayload) {
    const landing = this.socket;
    if (!landing) return;
    if (!payload?.addr) {
      console.warn("redirect world_handoff missing addr, ignored:", payload);
      return;
    }
    if (this.redirected.has(landing)) {
      console.warn("redirect on a redirected connection, ignored:", payload);
      return;
    }

    this.detach(landing);
    landing.close(1000, "redirect");
    this.socket = null;
    this.serverAddr = payload.addr;
    // The holding pod unreachable (closed before ever opening): one try at the default address,
    // seated wherever that lands. FS-MCYWK C18.
    this.connectRedirected(() => {
      this.serverAddr = DEFAULT_SERVER_ADDR;
      this.connectRedirected();
    });
  }

  /** Connects to `serverAddr` as this player on a connection a server sent us to make. */
  private connectRedirected(closedUnopened?: () => void) {
    this.connect(`${this.gameUrl()}&redirected=1`, closedUnopened);
    if (this.socket) this.redirected.add(this.socket);
  }

  /**
   * Follows a handoff to the server hosting a run, make-before-break: the
   * current socket stays live until the host has seated us, so a refused or
   * failed move leaves the player standing where they were.
   * FS-K2HKP §Requirements 22–24, 29, 31.
   */
  private handoff(payload: WorldHandoffPayload) {
    const sessionId = payload?.session_id;
    if (!payload?.addr || !sessionId) {
      console.error("world_handoff missing addr or session_id:", payload);
      return;
    }

    // already moving to (or moved to) this run
    if (this.handoffSessionId === sessionId) return;

    this.dropPending();
    this.handoffSessionId = sessionId;

    const next = this.createSocket(
      `${payload.addr}?token=${this.token}&session_id=${sessionId}`,
    );
    this.pending = next;

    // The host upgrades before it decides and refuses by closing with 4002, so
    // the socket opening proves nothing. Its world_entered is the acceptance.
    this.holdUntilEntered(next, payload.addr);

    next.onerror = (error) => {
      // the close that follows decides what happens
      console.warn("Handoff socket error:", error);
    };

    next.onclose = (event) => {
      if (this.pending !== next) return;
      this.handoffFailed(sessionId, event.code);
    };
  }

  /**
   * Follows a travel's handoff to the hub of the party leader's server (FS-NCC9J R18, R20),
   * make-before-break as a run's is: a connection there, flagged redirected (FS-MCYWK C19), which
   * enters the hub as the arrival says once it opens; the hub's world_entered is the acceptance. A
   * refused entry (the hub full) or a server that cannot be reached leaves the player where they
   * stand, on the old socket (or back on the server they were on, if it died meanwhile), and the
   * arrival tells them why. One move at a time.
   */
  private hubHandoff(payload: WorldHandoffPayload) {
    if (!payload?.addr) {
      console.error("hub world_handoff missing addr:", payload);
      return;
    }
    if (this.pending) return;
    const enter = this.arrival.enterHub();
    if (!enter) {
      console.warn("hub world_handoff with no character to enter as");
      this.arrival.refused(TRAVEL_UNREACHABLE);
      return;
    }

    // flagged redirected: the leader's pod seats a traveller where they land rather than send
    // them back to the old pod that may still name itself as holding them. FS-MCYWK C19.
    const next = this.createSocket(
      `${payload.addr}?token=${this.token}&name=${this.name}&redirected=1`,
    );
    this.redirected.add(next);
    this.pending = next;
    next.onopen = () => next.send(this.encode("enter_hub", enter));

    this.holdUntilEntered(next, payload.addr, (data) => {
      if (data.action !== "enter_hub" || !data.error) return false;
      this.dropPending();
      this.arrival.refused(String(data.payload?.message ?? data.error));
      this.reconnectIfGone();
      return true;
    });
    next.onerror = (error) => {
      // the close that follows decides what happens
      console.warn("Hub handoff socket error:", error);
    };
    next.onclose = (event) => {
      if (this.pending !== next) return;
      console.warn("Hub handoff refused or failed, code:", event.code);
      this.pending = null;
      this.arrival.refused(TRAVEL_UNREACHABLE);
      this.reconnectIfGone();
    };
  }

  /**
   * Listens on a pending socket: everything it says is held until the host's world_entered, which
   * promotes it and is replayed with the rest after the swap. `refused`, when given, sees each
   * message first and ends the move by returning true.
   */
  private holdUntilEntered(
    next: SocketLike,
    addr: string,
    refused?: (data: any) => boolean,
  ) {
    const held: any[] = [];
    next.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        console.error("Failed to parse handoff message:", e);
        return;
      }
      if (refused?.(data)) return;
      if (data.action !== "world_entered") {
        held.push(data);
        return;
      }
      this.promote(next, addr);
      this.dispatch(data);
      held.forEach((message) => this.dispatch(message));
    };
  }

  /** Still on the old socket: stay. If it is gone too, go back to the server we were on. */
  private reconnectIfGone() {
    const old = this.socket;
    if (
      !old ||
      old.readyState === SOCKET_CLOSING ||
      old.readyState === SOCKET_CLOSED
    ) {
      this.socket = null;
      this.reconnect();
    }
  }

  /** The host seated us: the new socket becomes the game's, and the old one is let go quietly. */
  private promote(next: SocketLike, addr: string) {
    const old = this.socket;
    this.pending = null;

    if (old) {
      // detached first, so its close reads as neither a disconnect nor an auth failure
      this.detach(old);
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
    this.reconnectIfGone();

    this.listeners.get("world_handoff_failed")?.({
      session_id: sessionId,
      code,
    });
  }

  private dropPending() {
    const pending = this.pending;
    if (!pending) return;

    this.pending = null;
    this.detach(pending);
    pending.close(1000, "handoff_cancelled");
  }

  /** Stops listening to a socket, so whatever it does next reaches no handler of ours. */
  private detach(socket: SocketLike) {
    socket.onopen = null;
    socket.onclose = null;
    socket.onerror = null;
    socket.onmessage = null;
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

    useGameStore
      .getState()
      .setWorld(payload.session_id, payload.world_type, payload.field);
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
      // Debug logging for outgoing messages (level 2+ = info)
      if (GameStateLogger.getLevel() >= 2) {
        console.log(
          `%c[WebSocket Send] Action: ${action}`,
          "color: #ff69b4; font-weight: bold",
          payload,
        );
      }

      this.socket.send(this.encode(action, payload));
    } else {
      console.warn("Cannot send message: WebSocket not connected");
    }
  }

  /**
   * One outgoing message as it goes on the wire, with player_id injected. The world a message
   * belongs to is NOT sent: the server routes on its own record of the player (FS-29KSH
   * §Requirements 16).
   */
  private encode<T extends keyof ActionMap>(
    action: T,
    payload: ActionMap[T],
  ): string {
    const message: ClientMessage<T> = {
      action,
      payload: { ...payload, player_id: useAuthStore.getState().memberInfo?.id },
      seq: ++this.seq,
    };
    return JSON.stringify(message);
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
