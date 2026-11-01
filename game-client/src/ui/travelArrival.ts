/**
 * What a travel's hub handoff enters the leader's hub with, and how a move that did not happen is
 * told (FS-NCC9J R20, R28): the character this player plays, from the game store, and a system
 * line in the chat window. The socket asks for these and only moves.
 */

import { enterHubPayload } from "@/characters/entry";
import { useChatStore } from "@/stores/chatStore";
import { useGameStore } from "@/stores/gameStore";
import type { HubArrival } from "@/utils/class/SocketManager";

export const travelArrival: HubArrival = {
  enterHub: () => {
    const character = useGameStore.getState().getActiveCharacter();
    return character ? enterHubPayload(character) : null;
  },
  refused: (text) =>
    useChatStore.getState().notice({ code: "travel_refused", text }),
};
