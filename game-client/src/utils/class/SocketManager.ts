import { palette, toCss } from "../canvasPalette";
import {
  ActionMap,
  ClientMessage,
  EnterHubPayload,
  WorldEnteredPayload,
  WorldHandoffPayload,
} from "@/assets/types/client";
import { ClientGameState, isFloorMap, isGameState } from "@/types/gameState";
import { GameStateLogger } from "@/utils/gameStateLogger";
import type { RenewOutcome } from "@/utils/sessionRenewal";
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

/** The backoff between refused handshakes of the game socket (FS-ZPX58 H1). */
export const AUTH_RETRY_BASE_MS = 1000;
export const AUTH_RETRY_MAX_MS = 30_000;

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
  // The token from the first connect. Every socket opens with currentToken() instead, which asks
  // the token source when one is set: the access token is renewed under a long session, and a
  // URL built from this copy would carry an expired one (FS-ZPX58 R20).
  private token = "";
  private tokenSource: (() => string | null) | null = null;
  private name = "";
  // Renews the session when a handshake is refused with 4001 (FS-ZPX58 R21).
  private renewSession: (() => Promise<RenewOutcome>) | null = null;
  // Refused handshakes in a row. game-service upgrades a socket BEFORE it checks the token, so a
  // refused socket opens, says auth_error and closes 4001: opening proves nothing. Only a message
  // that is not auth_error (or a promoted handoff) means the token was taken, and resets this.
  private authAttempts = 0;
  private authRetryTimer: ReturnType<typeof setTimeout> | undefined;
  // The token each socket's URL carried, or the server last took over it: a socket that opens, or a
  // handoff that is promoted, after a renewal it missed is handed the current one (FS-ZPX58 L-a).
  private openedWith = new WeakMap<SocketLike, string>();
  // Bumped by disconnect(): a renewal that resolves after it acts on nothing (FS-ZPX58 L-b).
  private generation = 0;
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
  ) {
    // A refused renew_token keeps the server's old token and the connection; it is never a session
    // problem for the global handler, which signs the player out (FS-ZPX58 R30).
    this.errorListeners.set("renew_token", (info) => console.warn("renew_token refused:", info.message ?? info.error));
  }

  /**
   * Hands the server the renewed access token on the open game socket, so the token it reads the
   * player's gear with is renewed too (FS-ZPX58 R27). A socket that is not open gets nothing: the
   * next one opens with the current token anyway (R20).
   */
  renewToken(token: string): void {
    if (this.socket?.readyState !== SOCKET_OPEN) return;
    this.socket.send(this.encode("renew_token", { token }));
    this.openedWith.set(this.socket, token);
  }

  /** An open socket whose server holds an older token than the current one is handed it (L-a). */
  private handOverIfStale(socket: SocketLike): void {
    const token = this.currentToken();
    if (!token || socket.readyState !== SOCKET_OPEN || this.openedWith.get(socket) === token) return;
    socket.send(this.encode("renew_token", { token }));
    this.openedWith.set(socket, token);
  }

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
    return `${this.serverAddr}?token=${this.currentToken()}&name=${this.name}`;
  }

  /** Where the access token to open a socket with comes from; read at every open (FS-ZPX58 R20). */
  setTokenSource(source: () => string | null): void {
    this.tokenSource = source;
  }

  /**
   * How to renew the session when a socket is refused with 4001 (FS-ZPX58 R21). Only a refused
   * renewal is an auth error; without it wired a 4001 goes straight to the auth error.
   */
  setRenewSession(renew: () => Promise<RenewOutcome>): void {
    this.renewSession = renew;
  }

  private currentToken(): string {
    return this.tokenSource?.() || this.token;
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
    this.generation++;
    clearTimeout(this.authRetryTimer);
    this.authRetryTimer = undefined;
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
    // the URL was just built from the current token
    const token = this.currentToken();
    this.socket = this.createSocket(url);
    this.openedWith.set(this.socket, token);
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
      this.handOverIfStale(socket);
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

      // Close code 4001 = auth error (token invalid/expired, or auth-service unable to tell).
      // Renew and connect again, backing off while it keeps being refused; only a refused
      // renewal is an auth error (FS-ZPX58 R21).
      if (event.code === 4001) {
        if (current && this.renewSession) {
          this.recoverAuth(this.redirected.has(socket));
          return;
        }
        this.authFailed();
        return;
      }

      this.setConnectionStatus("disconnected");
      this.updateStatus("WebSocket Disconnected", toCss(palette.hudLabel));
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // anything but the refusal means the handshake was taken (FS-ZPX58 H1)
        if (data?.action !== "auth_error") this.authAttempts = 0;
        this.dispatch(data);
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
    } else if (data.action === "floor_map") {
      // A run floor's layout, once per floor: the store keeps it for whichever run scene is up or
      // still loading (FS-KE075 §H.40, ADR-0060 Decision 3).
      if (!isFloorMap(data.payload)) return;
      useGameStore.getState().receiveFloorMap(data.payload);
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
    this.openRunHandoff(payload.addr, sessionId, false);
  }

  /**
   * Opens the socket to a run's host. A host that refuses the token (4001) gets one more socket
   * after a renewal (FS-ZPX58 L4); `renewed` marks that one, whose refusal is the handoff's
   * failure like any other.
   */
  private openRunHandoff(addr: string, sessionId: string, renewed: boolean) {
    const token = this.currentToken();
    const next = this.createSocket(`${addr}?token=${token}&session_id=${sessionId}`);
    this.openedWith.set(next, token);
    this.pending = next;

    // The host upgrades before it decides and refuses by closing with 4002, so
    // the socket opening proves nothing. Its world_entered is the acceptance.
    this.holdUntilEntered(next, addr);

    next.onerror = (error) => {
      // the close that follows decides what happens
      console.warn("Handoff socket error:", error);
    };

    next.onclose = (event) => {
      if (this.pending !== next) return;
      if (event.code === 4001 && !renewed && this.renewSession) {
        this.pending = null;
        this.renewThen(() => {
          // a later handoff took over meanwhile
          if (this.handoffSessionId !== sessionId || this.pending) return;
          this.openRunHandoff(addr, sessionId, true);
        });
        return;
      }
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

    this.openHubHandoff(payload.addr, enter, false);
  }

  /**
   * Opens the socket to the leader's hub. A pod that refuses the token (4001) gets one more socket
   * after a renewal, flagged redirected like the first (FS-ZPX58 L4); `renewed` marks that one.
   */
  private openHubHandoff(addr: string, enter: EnterHubPayload, renewed: boolean) {
    // flagged redirected: the leader's pod seats a traveller where they land rather than send
    // them back to the old pod that may still name itself as holding them. FS-MCYWK C19.
    const token = this.currentToken();
    const next = this.createSocket(`${addr}?token=${token}&name=${this.name}&redirected=1`);
    this.openedWith.set(next, token);
    this.redirected.add(next);
    this.pending = next;
    next.onopen = () => next.send(this.encode("enter_hub", enter));

    this.holdUntilEntered(next, addr, (data) => {
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
      if (event.code === 4001 && !renewed && this.renewSession) {
        this.pending = null;
        this.renewThen(() => {
          if (this.pending) return; // another move started meanwhile
          this.openHubHandoff(addr, enter, true);
        });
        return;
      }
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

  /**
   * The game socket's handshake was refused (FS-ZPX58 R21, H1): renew, then connect again as the
   * same player, `redirected=1` kept when the refused socket was a redirect target (FS-MCYWK C17).
   * The first try is at once; each further refusal in a row waits twice as long, from 1 s up to
   * 30 s, so a token that keeps being refused, or an auth outage, never spins. Meanwhile the player
   * is shown as reconnecting, and the session is kept: only a refused renewal signs them out.
   */
  private recoverAuth(redirected: boolean) {
    const attempt = this.authAttempts++;
    const delay = attempt === 0 ? 0 : Math.min(AUTH_RETRY_BASE_MS * 2 ** (attempt - 1), AUTH_RETRY_MAX_MS);

    this.setConnectionStatus("connecting");
    this.updateStatus("Disconnected, retrying…", toCss(palette.hudLabel));

    clearTimeout(this.authRetryTimer);
    this.authRetryTimer = setTimeout(() => {
      this.authRetryTimer = undefined;
      this.renewThen(() => {
        if (this.socket) return; // connected again some other way meanwhile
        if (redirected) this.connectRedirected();
        else this.reconnect();
      });
    }, delay);
  }

  /** Renews the session; a refused renewal is the auth error, anything else goes on to `next`. */
  private renewThen(next: () => void) {
    if (!this.renewSession) return this.authFailed();
    const generation = this.generation;
    void this.renewSession().then(
      (outcome) => {
        if (generation !== this.generation) return; // disconnected meanwhile (L-b)
        if (outcome === "refused") this.authFailed();
        else next();
      },
      () => {
        if (generation === this.generation) next();
      },
    );
  }

  private authFailed() {
    console.log("Auth error detected, redirecting to login...");
    this.onAuthError?.();
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
    this.authAttempts = 0;

    if (old) {
      // detached first, so its close reads as neither a disconnect nor an auth failure
      this.detach(old);
      old.close(1000, "handoff");
    }

    this.socket = next;
    this.serverAddr = addr;
    this.attach(next);
    this.setConnectionStatus("connected");
    // renewed while the handoff was pending: the host holds the URL's token (L-a)
    this.handOverIfStale(next);
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
