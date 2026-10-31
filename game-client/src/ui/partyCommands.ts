/**
 * What the party panel's and the invite prompt's actions send (FS-R82NV R12, R15, R16, R19, R20),
 * and where the server's top-level error replies to them go. The server answers a party action
 * with a `party_update` or a `party_notice`; an error reply (an action the pod has no handler for
 * yet, as kick, transfer and leave until slice 2) must never reach the session's global handler,
 * which treats an unclaimed error as fatal and logs the player out.
 */

import type { ActionMap } from "@/assets/types/client";
import type { MessageError } from "@/utils/class/SocketManager";

/** The part of the socket the commands use. */
export interface PartySocket {
  sendMessage<T extends keyof ActionMap>(
    action: T,
    payload: ActionMap[T],
  ): void;
}

/** The part of the socket that hears an action refused. */
export interface PartyErrorSocket {
  onError(action: string, callback: (info: MessageError) => void): void;
}

export interface PartyCommands {
  /** Sends an invite for a name or id; false (nothing sent) when it is blank. */
  invite(name: string): boolean;
  kick(playerId: string): void;
  transfer(playerId: string): void;
  leave(): void;
  /** Answers an invite yes (R16): the server seats the player in that party, or says why not. */
  accept(inviteId: string): void;
  decline(inviteId: string): void;
}

const PARTY_ACTIONS = [
  "party_invite",
  "party_kick",
  "party_transfer",
  "party_leave",
  "party_accept",
  "party_decline",
] as const;

/**
 * Claims every party action's error replies: logged, never handed to the global handler.
 * Installed once, at boot beside that handler, and never removed: a claim that came and went
 * with a scene would leave a gap at every scene switch in which a refusal logs the player out.
 * Calling it again replaces the same claims (one listener per action).
 */
export function routePartyErrors(socket: PartyErrorSocket): void {
  for (const action of PARTY_ACTIONS)
    socket.onError(action, (info) =>
      console.warn("party action refused:", info.action, info.error),
    );
}

export function partyCommands(socket: PartySocket): PartyCommands {
  return {
    invite: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return false;
      socket.sendMessage("party_invite", { name: trimmed });
      return true;
    },
    kick: (playerId) =>
      socket.sendMessage("party_kick", { target_id: playerId }),
    transfer: (playerId) =>
      socket.sendMessage("party_transfer", { target_id: playerId }),
    leave: () => socket.sendMessage("party_leave", {}),
    accept: (inviteId) =>
      socket.sendMessage("party_accept", { invite_id: inviteId }),
    decline: (inviteId) =>
      socket.sendMessage("party_decline", { invite_id: inviteId }),
  };
}
