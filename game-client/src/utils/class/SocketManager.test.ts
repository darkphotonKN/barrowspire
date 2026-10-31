import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SERVER_ADDR, SocketManager, type SocketLike } from "./SocketManager";
import { useGameStore } from "../../stores/gameStore";
import { useChatStore } from "../../stores/chatStore";
import { usePartyStore } from "../../stores/partyStore";
import { useAuthStore } from "../../stores/authStore";

/** A socket the test drives by hand: the server side of each event is a method. */
class FakeSocket implements SocketLike {
  readyState = 0; // CONNECTING
  sent: string[] = [];
  closedWith?: { code?: number; reason?: string };

  onopen: ((ev: any) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;

  constructor(public url: string) {}

  send(data: string) {
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.closedWith = { code, reason };
    this.readyState = 3;
  }

  // the server's side
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  serverClose(code: number, reason = "") {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

const HOST = "ws://localhost:5669/game/ws";

function setup() {
  const sockets: FakeSocket[] = [];
  const manager = new SocketManager((url) => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket;
  });

  manager.connectToGame("jwt-1", "Ash");
  const old = sockets[0];
  old.open();

  return { manager, sockets, old };
}

const handoff = (sessionId = "run-1", addr = HOST) => ({
  action: "world_handoff",
  payload: { addr, session_id: sessionId },
});
const runEntered = { action: "world_entered", payload: { session_id: "run-1", world_type: "run" } };

describe("SocketManager handoff", () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });

  it("connects to the default server with the token on the way in", () => {
    expect(env.old.url).toBe(`${DEFAULT_SERVER_ADDR}?token=jwt-1&name=Ash`);
  });

  it("opens a socket to the host with the token and session id, keeping the old one open", () => {
    env.old.receive(handoff());

    expect(env.sockets).toHaveLength(2);
    expect(env.sockets[1].url).toBe(`${HOST}?token=jwt-1&session_id=run-1`);
    expect(env.old.closedWith).toBeUndefined();
  });

  // The host refuses by upgrading and then closing (4002), so an open socket is
  // not yet an accepted one. FS-K2HKP §Requirements 24.
  it("does not treat the new socket opening as acceptance", () => {
    env.old.receive(handoff());
    env.sockets[1].open();

    expect(env.old.closedWith).toBeUndefined();
  });

  it("swaps sockets on the host's world_entered: old closed with 1000, new one carries traffic", () => {
    const entered = vi.fn();
    env.manager.on("world_entered", entered);

    env.old.receive(handoff());
    const next = env.sockets[1];
    next.open();
    next.receive(runEntered);

    expect(env.old.closedWith).toEqual({ code: 1000, reason: "handoff" });
    expect(entered).toHaveBeenCalledWith(runEntered.payload);

    env.manager.sendMessage("move" as any, { vx: 1, vy: 0 } as any);
    expect(next.sent).toHaveLength(1);
    expect(env.old.sent).toHaveLength(0);
  });

  it("does not report a disconnect or an auth error when the old socket closes for a handoff", () => {
    const authError = vi.fn();
    env.manager.setOnAuthError(authError);

    env.old.receive(handoff());
    env.sockets[1].open();
    env.sockets[1].receive(runEntered);
    env.old.serverClose(4001);

    expect(authError).not.toHaveBeenCalled();
    expect(env.manager.getConnectionStatus()).toBe("connected");
  });

  it("ignores a second world_handoff for the run it is already moving to", () => {
    env.old.receive(handoff("run-1"));
    env.old.receive(handoff("run-1"));

    expect(env.sockets).toHaveLength(2);
  });

  it("stays on the old socket and says so when the host refuses (4002)", () => {
    const failed = vi.fn();
    env.manager.on("world_handoff_failed", failed);

    env.old.receive(handoff());
    env.sockets[1].open();
    env.sockets[1].serverClose(4002, "no seat");

    expect(env.old.closedWith).toBeUndefined();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(env.manager.getConnectionStatus()).toBe("connected");

    env.manager.sendMessage("move" as any, { vx: 1, vy: 0 } as any);
    expect(env.old.sent).toHaveLength(1);
  });

  it("stays on the old socket when the host cannot be reached at all", () => {
    const failed = vi.fn();
    env.manager.on("world_handoff_failed", failed);

    env.old.receive(handoff());
    env.sockets[1].serverClose(1006);

    expect(env.old.closedWith).toBeUndefined();
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it("reconnects to the original address when the handoff fails and the old socket is gone", () => {
    env.old.receive(handoff());
    env.old.readyState = 3;
    env.sockets[1].serverClose(4002);

    expect(env.sockets).toHaveLength(3);
    expect(env.sockets[2].url).toBe(`${DEFAULT_SERVER_ADDR}?token=jwt-1&name=Ash`);
  });

  it("reconnects to the host it moved to, not the server it started on", () => {
    env.old.receive(handoff());
    env.sockets[1].open();
    env.sockets[1].receive(runEntered);

    expect(env.manager.getServerAddress()).toBe(HOST);

    env.sockets[1].serverClose(1006);
    env.manager.reconnect();

    expect(env.sockets[2].url).toBe(`${HOST}?token=jwt-1&name=Ash`);
  });
});

describe("DEFAULT_SERVER_ADDR", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("falls back to the local game server when NEXT_PUBLIC_GAME_SERVER_ADDR is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_GAME_SERVER_ADDR", "");
    vi.resetModules();
    const mod = await import("./SocketManager");
    expect(mod.DEFAULT_SERVER_ADDR).toBe("ws://localhost:5668/game/ws");
  });

  it("uses NEXT_PUBLIC_GAME_SERVER_ADDR when set", async () => {
    vi.stubEnv("NEXT_PUBLIC_GAME_SERVER_ADDR", "ws://localhost:5669/game/ws");
    vi.resetModules();
    const mod = await import("./SocketManager");
    expect(mod.DEFAULT_SERVER_ADDR).toBe("ws://localhost:5669/game/ws");
  });
});

describe("SocketManager field worlds (FS-X2F2H §Requirements 10, 14, 55, 60)", () => {
  it("records the field a field's world_entered names", () => {
    const { manager, old } = setup();
    const entered = vi.fn();
    manager.on("world_entered", entered);

    old.receive({
      action: "world_entered",
      payload: { session_id: "meadows-1", world_type: "field", field: "gentle_meadows" },
    });

    expect(useGameStore.getState()).toMatchObject({
      sessionId: "meadows-1",
      worldType: "field",
      fieldId: "gentle_meadows",
    });
    expect(entered).toHaveBeenCalledOnce();
  });

  it("hands a refusal's stable reason to the action's listener", () => {
    const { manager, old } = setup();
    const refused = vi.fn();
    manager.onError("enter_field", refused);

    old.receive({
      action: "enter_field",
      payload: { message: "Walk to the gate first.", reason: "not_at_gate" },
      error: "Walk to the gate first.",
    });

    expect(refused).toHaveBeenCalledWith({
      action: "enter_field",
      error: "Walk to the gate first.",
      message: "Walk to the gate first.",
      reason: "not_at_gate",
    });
  });
});

describe("SocketManager refused actions (FS-QPDKN req 13, 14)", () => {
  const refusal = {
    action: "leave_run",
    payload: { message: "You are not in a delve." },
    error: "not in run",
  };

  it("hands an action's error reply to that action's own listener, not the global handler", () => {
    const { manager, old } = setup();
    const global = vi.fn();
    manager.setOnMessageError(global);
    const refused = vi.fn();
    manager.onError("leave_run", refused);

    old.receive(refusal);

    expect(refused).toHaveBeenCalledWith({
      action: "leave_run",
      error: "not in run",
      message: "You are not in a delve.",
    });
    expect(global).not.toHaveBeenCalled();
  });

  it("falls back to the global handler for an action nobody listens to, and once the listener is gone", () => {
    const { manager, old } = setup();
    const global = vi.fn();
    manager.setOnMessageError(global);
    const refused = vi.fn();
    manager.onError("leave_run", refused);

    old.receive({ ...refusal, action: "find_game" });
    manager.offError("leave_run");
    old.receive(refusal);

    expect(refused).not.toHaveBeenCalled();
    expect(global).toHaveBeenCalledTimes(2);
  });

  it("keeps an error reply away from the action's ordinary listener", () => {
    const { manager, old } = setup();
    const ordinary = vi.fn();
    manager.on("leave_run", ordinary);
    manager.onError("leave_run", vi.fn());

    old.receive(refusal);

    expect(ordinary).not.toHaveBeenCalled();
  });
});

describe("SocketManager chat (FS-WJGFJ §Requirements C20, C29: the socket feeds the chat store)", () => {
  const stamped = {
    message_id: "22222222-2222-4222-8222-222222222222",
    sender_id: "11111111-1111-4111-8111-111111111111",
    sender_name: "Wren",
    channel: "area",
    scope: "pod-host",
    sent_at: "2026-10-31T09:30:15.250Z",
    text: "hi",
  };

  it("puts a chat line in the chat store whether or not a scene listens, and still tells a listener", () => {
    const { manager, old } = setup();
    const heard = vi.fn();
    manager.on("chat", heard);

    old.receive({ action: "chat", payload: stamped });

    expect(useChatStore.getState().lines).toContainEqual({ kind: "line", ...stamped });
    expect(heard).toHaveBeenCalledWith(stamped);
  });

  it("keeps a malformed chat frame out of the store (review 2026-10-31)", () => {
    const { old } = setup();
    const before = useChatStore.getState().lines.length;

    old.receive({ action: "chat", payload: { text: "no channel, no id" } });
    old.receive({ action: "chat", payload: { ...stamped, channel: "shout" } });
    old.receive({ action: "chat_notice", payload: { code: 7 } });

    expect(useChatStore.getState().lines.length).toBe(before);
  });

  it("puts a chat_notice in the chat store as a system line", () => {
    const { old } = setup();

    old.receive({ action: "chat_notice", payload: { code: "channel_closed", text: "That channel is not open yet." } });

    expect(useChatStore.getState().lines).toContainEqual({
      kind: "system",
      code: "channel_closed",
      text: "That channel is not open yet.",
    });
  });
});

describe("SocketManager party (FS-R82NV §Requirements R21, R31: the socket feeds the party store and the chat window)", () => {
  const ME = "11111111-1111-4111-8111-111111111111";
  const update = {
    party_id: "99999999-9999-4999-8999-999999999999",
    leader_id: ME,
    members: [
      { player_id: ME, name: "Aldric", class: "warrior", joined_at: "2026-11-01T05:00:00Z", where: "hub", online: true },
    ],
    size: 2,
    reason: "joined",
    subject_id: ME,
  };

  beforeEach(() => {
    useAuthStore.setState({ memberInfo: { id: ME } });
  });
  afterEach(() => {
    usePartyStore.setState({ party: null, invites: [] });
    useAuthStore.setState({ memberInfo: null });
  });

  it("puts a party_update in the party store, and still tells a listener", () => {
    const { manager, old } = setup();
    const heard = vi.fn();
    manager.on("party_update", heard);

    old.receive({ action: "party_update", payload: update });

    expect(usePartyStore.getState().party).toEqual(update);
    expect(heard).toHaveBeenCalledWith(update);
  });

  it("keeps a malformed party_update out of the store", () => {
    const { old } = setup();

    old.receive({ action: "party_update", payload: { ...update, members: null } });

    expect(usePartyStore.getState().party).toBeNull();
  });

  it("puts a party_notice in the chat window as a system line in the client's own words (R36)", () => {
    const { old } = setup();

    old.receive({ action: "party_notice", payload: { code: "already_in_party", name: "Wren" } });

    expect(useChatStore.getState().lines.at(-1)).toEqual({
      kind: "system",
      code: "already_in_party",
      text: "Wren walks with another party.",
    });
  });

  it("shows nothing for a party_notice code it has no words for", () => {
    const { old } = setup();
    const before = useChatStore.getState().lines.length;

    old.receive({ action: "party_notice", payload: { code: "brand_new" } });
    old.receive({ action: "party_notice", payload: { name: "no code" } });

    expect(useChatStore.getState().lines.length).toBe(before);
  });

  const invite = {
    invite_id: "inv-1",
    party_id: "99999999-9999-4999-8999-999999999999",
    party_pod_addr: "10.0.0.7:5660",
    leader_name: "Wren",
    member_count: 2,
    size: 4,
    expires_at: "2026-11-01T05:01:00Z",
  };

  it("raises a prompt for a party_invite, and still tells a listener (R32)", () => {
    const { manager, old } = setup();
    const heard = vi.fn();
    manager.on("party_invite", heard);

    old.receive({ action: "party_invite", payload: invite });

    expect(usePartyStore.getState().invites).toMatchObject([invite]);
    expect(heard).toHaveBeenCalledWith(invite);
  });

  it("raises no prompt for a malformed party_invite", () => {
    const { old } = setup();

    old.receive({ action: "party_invite", payload: { ...invite, invite_id: null } });

    expect(usePartyStore.getState().invites).toEqual([]);
  });
});
