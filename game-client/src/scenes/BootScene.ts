import { socketManager } from "@/utils/class/SocketManager";
import { routePartyErrors } from "@/ui/partyCommands";
import { currentAccessToken, renewSession } from "@/utils/api";
import { forwardRenewedTokens } from "@/utils/socketTokenRenewal";
import { useAuthStore } from "@/stores/authStore";

// The token forwarder is wired once for the page's lifetime, however often the scene is created.
let forwardingTokens = false;
import * as Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    // Load minimal assets needed for preloader
  }

  create(): void {
    // Game-wide, not per-scene: right-clicking the canvas is a game input, and
    // every scene that remembered to disable the browser menu for itself was one
    // more that could forget. Set once, here, at the way in.
    this.input.mouse?.disableContextMenu();

    // 直接從 localStorage 讀取 auth 資料
    let token = "";
    let name = "Guest";

    try {
      const authStorage = localStorage.getItem("auth-storage");
      if (authStorage) {
        const parsed = JSON.parse(authStorage);
        token = parsed.state?.accessToken || "";
        name = parsed.state?.memberInfo?.name || "Guest";
      }
    } catch (e) {
      console.error("Failed to parse auth storage:", e);
    }

    // 沒有 token 直接跳轉到登入頁面
    if (!token) {
      window.location.href = "/login";
      return;
    }

    // Every socket opens with the access token current at that moment, and a handshake refused
    // with 4001 renews the session once and reconnects before it counts as an auth error
    // (FS-ZPX58 R20, R21).
    socketManager.setTokenSource(currentAccessToken);
    // The outcome as it is: an unavailable renewal (an auth outage) keeps the session and the
    // socket retries with a backoff; only a refused one reaches the auth error below (M3).
    socketManager.setRenewSession(renewSession);
    // ...and every renewed token is handed to the open socket, so the server's held token (the one
    // it reads gear with) is renewed too (FS-ZPX58 R27). Once per page: BootScene runs once.
    if (!forwardingTokens) {
      forwardingTokens = true;
      forwardRenewedTokens(useAuthStore.subscribe, socketManager);
    }

    // Handle auth errors (close code 4001 from server, once renewal was refused)
    socketManager.setOnAuthError(() => {
      localStorage.removeItem("auth-storage");
      window.location.href = "/login";
    });

    // Handle generic server-side message errors. Most are fatal session issues
    // (e.g. operator already queued from another tab/session) — kick out and force re-auth.
    socketManager.setOnMessageError(({ message, error }) => {
      const reason =
        message ||
        error ||
        "This player is already abroad in another window. You have been disconnected.";
      sessionStorage.setItem("auth-error-message", reason);
      socketManager.disconnect();
      localStorage.removeItem("auth-storage");
      window.location.href = "/login";
    });
    // party refusals are the party's own business, claimed once for the session (FS-R82NV)
    routePartyErrors(socketManager);

    console.log("token: ", token);
    console.log("name: ", name);
    socketManager.connectToGame(token, name);
    this.scene.start("PreloadScene");
  }
}
