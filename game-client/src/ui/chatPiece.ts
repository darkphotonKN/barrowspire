/**
 * The chat window on the UI scene (FS-TQZ5J § Change: Batch 6, R125): the app's chat store, the bottom-left
 * corner above the canvas bottom, the real DOM input row, a sent line on the socket (ADR-0082: the piece's
 * own command), the player who is playing (a whisper they sent is their echo), and its wiring whole.
 */

import type Phaser from "phaser";
import { ActionType } from "@/assets/types/client";
import { viewport } from "@/render/viewport";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";
import { socketManager } from "@/utils/class/SocketManager";
import { ChatWindow } from "./ChatWindow";
import { domChatInputField } from "./chatInputField";
import { CHAT_WINDOW_MARGIN, CHAT_WINDOW_X } from "./chatWindowLayout";
import type { ChatWiring } from "./uiSceneChat";

export function mountChat(scene: Phaser.Scene, wiring: ChatWiring): ChatWindow {
  return new ChatWindow(scene, useChatStore, CHAT_WINDOW_X, viewport.height - CHAT_WINDOW_MARGIN, {
    input: {
      mayOpen: wiring.mayOpen,
      keepsDraft: wiring.keepsDraft,
      send: (line) => socketManager.sendMessage(ActionType.Chat, line),
      makeField: domChatInputField,
    },
    selfId: () => useAuthStore.getState().memberInfo?.id,
    play: wiring.play,
    typing: wiring.typing,
  });
}
