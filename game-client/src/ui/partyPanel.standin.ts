import { EventEmitter } from "eventemitter3";
import { vi } from "vitest";
import { absorbing } from "@/scenes/phaser.standin";
import { createPartyStore } from "@/stores/partyStore";
import { PartyPanel } from "./PartyPanel";

type PanelOptions = ConstructorParameters<typeof PartyPanel>[1];
export type PanelStore = PanelOptions["store"];

/**
 * Test-only: a party panel on a scene that draws nothing, its invite field silent, refused while
 * `refused` says so. `pressT` presses the panel's key. The store is a fresh one for "me" unless
 * a test hands the shared one.
 */
export function partyPanelOn(
  refused: () => boolean,
  {
    store = createPartyStore({ selfId: () => "me" }),
    opening,
    wrapper,
  }: { store?: PanelStore; opening?: () => void; wrapper?: PanelOptions["wrapper"] } = {},
) {
  const any = absorbing();
  const keyboard = new EventEmitter();
  const scene = {
    add: { graphics: () => any, text: () => any },
    input: Object.assign(new EventEmitter(), { keyboard }),
    events: new EventEmitter(),
  } as unknown as ConstructorParameters<typeof PartyPanel>[0];
  const panel = new PartyPanel(scene, {
    store,
    world: () => null,
    selfId: () => "me",
    commands: { create: vi.fn(), invite: vi.fn(), kick: vi.fn(), transfer: vi.fn(), leave: vi.fn() },
    makeField: () => ({
      value: "",
      setEnabled: vi.fn(),
      moveTo: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      blur: vi.fn(),
      destroy: vi.fn(),
    }),
    activeElement: () => null,
    blocked: refused,
    opening,
    wrapper,
  });
  return { panel, pressT: () => keyboard.emit("keydown-T") };
}
