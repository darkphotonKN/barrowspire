/**
 * What the passive tree sends, and where the server's refusals of it go (FS-8RZ51 §G R38, §D R16, R21;
 * ADR-0085 Decision 2). The spend is the tree piece's own command, as `partyCommands` is the party's:
 * composing it reads only the node and target rank the piece holds and the world type in the game store,
 * never a world's fields, and it never crosses the UI bridge.
 *
 * A spend is refused by an error reply on the action. One nobody claims reaches the session's global
 * handler, which treats it as fatal, so the UI scene claims it as it mounts the tree, open or not.
 */

import { ActionType, type ActionMap, type WorldType } from "@/assets/types/client";
import { useGameStore } from "@/stores/gameStore";
import type { MessageError } from "@/utils/class/SocketManager";

export const SPEND_PASSIVE_POINT = ActionType.SpendPassivePoint;

/** The part of the socket the tree uses: it sends the spend and hears it refused. */
export interface TreeSocket {
  sendMessage<T extends keyof ActionMap>(action: T, payload: ActionMap[T]): void;
  onError(action: string, callback: (info: MessageError) => void): void;
}

export interface PassiveTreeCommands {
  /** Spends one point on `nodeId` up to `rank`, in town only (R38); whether it was sent. */
  spend(nodeId: string, rank: number): boolean;
  /** Claims the spend's refusals: each one's reason, in the server's words (R21), handed to `heard`. */
  onRefused(heard: (reason: string) => void): void;
}

export function passiveTreeCommands(
  socket: TreeSocket,
  world: () => WorldType | null = () => useGameStore.getState().worldType,
): PassiveTreeCommands {
  return {
    spend: (nodeId, rank) => {
      if (world() !== "hub") return false;
      socket.sendMessage(SPEND_PASSIVE_POINT, { node_id: nodeId, rank });
      return true;
    },
    onRefused: (heard) =>
      socket.onError(SPEND_PASSIVE_POINT, (info) => {
        console.warn("passive spend refused:", info.message ?? info.error);
        heard(info.message ?? info.error);
      }),
  };
}
