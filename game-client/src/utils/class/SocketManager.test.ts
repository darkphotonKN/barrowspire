import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SERVER_ADDR, SocketManager, TRAVEL_UNREACHABLE, type SocketLike } from "./SocketManager";
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
  /** A server that cannot be reached, as a browser reports it: error, then close (1006), never open. */
  unreachable() {
    this.readyState = 3;
    this.onerror?.({ type: "error" });
    this.onclose?.({ code: 1006, reason: "" });
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
    usePartyStore.setState({ party: null, invites: [], readyCheck: null });
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

  it("puts a party_ready_check in the party store, and still tells the scene's one listener (FS-BJNYC R23)", () => {
    const { manager, old } = setup();
    const heard = vi.fn();
    manager.on("party_ready_check", heard);
    const check = {
      check_id: "chk-1",
      leader_id: ME,
      expires_in_ms: 30_000,
      members: [{ player_id: ME, name: "Aldric", state: "accepted" }],
      outcome: "open",
    };

    old.receive({ action: "party_ready_check", payload: check });

    expect(usePartyStore.getState().readyCheck).toMatchObject({ check_id: "chk-1", answer: null });
    expect(heard).toHaveBeenCalledWith(check);

    old.receive({
      action: "party_ready_check",
      payload: { ...check, outcome: "cancelled", reason: "declined", names: ["Wren"] },
    });

    expect(usePartyStore.getState().readyCheck).toBeNull();
    expect(useChatStore.getState().lines.at(-1)).toMatchObject({
      kind: "system",
      text: "Wren declined. The party stays.",
    });
  });

  it("keeps a malformed party_ready_check out of the store and from the scene", () => {
    const { manager, old } = setup();
    const heard = vi.fn();
    manager.on("party_ready_check", heard);

    old.receive({ action: "party_ready_check", payload: { check_id: "chk-1", outcome: "open" } });

    expect(usePartyStore.getState().readyCheck).toBeNull();
    expect(heard).not.toHaveBeenCalled();
  });

  it("says a party_enter's not_in_town with every name it carries, as the server sends it (FS-BJNYC R22)", () => {
    const { old } = setup();

    old.receive({ action: "party_notice", payload: { code: "not_in_town", names: ["Wren", "Mira"] } });

    expect(useChatStore.getState().lines.at(-1)).toEqual({
      kind: "system",
      code: "not_in_town",
      text: "Wren and Mira are not in the town.",
    });
  });

  it("shows nothing for a party_notice whose names are not a list of names", () => {
    const { old } = setup();
    const before = useChatStore.getState().lines.length;

    old.receive({ action: "party_notice", payload: { code: "not_in_town", names: "Wren" } });
    old.receive({ action: "party_notice", payload: { code: "not_in_town", names: ["Wren", 7] } });

    expect(useChatStore.getState().lines.length).toBe(before);
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

// FS-NCC9J §Requirements R18, R20, R28; I-NCC9J-8. A travel's handoff is to a hub: no run, no
// seat; the client connects to the leader's server and enters its hub as the character it plays.
// What it enters with, and how a refusal is told, come in as a HubArrival: the socket only moves.
describe("SocketManager hub handoff (FS-NCC9J R20)", () => {
  const LEADER_POD = "ws://pod-a.test/game/ws";
  const hubHandoff = { action: "world_handoff", payload: { addr: LEADER_POD, hub: true } };
  const hubEntered = { action: "world_entered", payload: { session_id: "hub-a", world_type: "hub" } };
  const enterAs = { characterId: "c-1", class: "warrior", className: "warrior", characterName: "Marl", username: "Marl" };

  function hubSetup(character: typeof enterAs | null = enterAs) {
    const sockets: FakeSocket[] = [];
    const arrival = { enterHub: vi.fn(() => character), refused: vi.fn() };
    const manager = new SocketManager((url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    }, arrival);
    manager.connectToGame("jwt-1", "Ash");
    const old = sockets[0];
    old.open();
    return { manager, sockets, old, arrival };
  }

  const sentOn = (socket: FakeSocket) => socket.sent.map((raw) => JSON.parse(raw));

  // A connection a server directed the client to make is seated where it lands, never
  // redirected back to the traveller's old pod. FS-MCYWK C19.
  it("connects to the leader's server, flagged redirected, and enters its hub as the arrival says once open", () => {
    const { old, sockets } = hubSetup();

    old.receive(hubHandoff);
    expect(sockets).toHaveLength(2);
    const next = sockets[1];
    expect(next.url).toBe(`${LEADER_POD}?token=jwt-1&name=Ash&redirected=1`);
    expect(old.closedWith).toBeUndefined();

    next.open();
    const [enter] = sentOn(next);
    expect(enter.action).toBe("enter_hub");
    expect(enter.payload.characterId).toBe("c-1");
    expect(sentOn(old).some((m) => m.action === "enter_hub")).toBe(false);
  });

  it("swaps sockets on the hub's world_entered, replays what came before it, and reconnects there afterwards", () => {
    const { manager, old, sockets } = hubSetup();
    const entered = vi.fn();
    const said = vi.fn();
    manager.on("world_entered", entered);
    manager.on("hub_greeting", said);

    old.receive(hubHandoff);
    sockets[1].open();
    sockets[1].receive({ action: "hub_greeting", payload: { hello: 1 } });
    expect(said).not.toHaveBeenCalled();
    sockets[1].receive(hubEntered);

    expect(old.closedWith).toEqual({ code: 1000, reason: "handoff" });
    expect(entered).toHaveBeenCalledWith(hubEntered.payload);
    expect(said).toHaveBeenCalledWith({ hello: 1 });
    expect(manager.getServerAddress()).toBe(LEADER_POD);

    sockets[1].serverClose(1006);
    manager.reconnect();
    expect(sockets[2].url).toBe(`${LEADER_POD}?token=jwt-1&name=Ash`);
  });

  it("never tells the delve's world_handoff listener: a travel is not a match", () => {
    const { manager, old } = hubSetup();
    const delve = vi.fn();
    manager.on("world_handoff", delve);

    old.receive(hubHandoff);

    expect(delve).not.toHaveBeenCalled();
  });

  it("stays on the old socket and has the refusal told when the hub refuses the entry", () => {
    const { manager, old, sockets, arrival } = hubSetup();
    old.receive(hubHandoff);
    const next = sockets[1];
    next.open();

    next.receive({
      action: "enter_hub",
      payload: { message: "The hub is full. Try again shortly." },
      error: "The hub is full. Try again shortly.",
    });

    expect(next.closedWith?.code).toBe(1000);
    expect(old.closedWith).toBeUndefined();
    expect(manager.isConnected()).toBe(true);
    expect(arrival.refused).toHaveBeenCalledWith("The hub is full. Try again shortly.");
    expect(sockets).toHaveLength(2);
  });

  it("reconnects to the server it was on when the hub refuses and the old socket died meanwhile", () => {
    const { old, sockets } = hubSetup();
    old.receive(hubHandoff);
    sockets[1].open();
    old.serverClose(1006);

    sockets[1].receive({ action: "enter_hub", payload: { message: "The hub is full." }, error: "The hub is full." });

    expect(sockets).toHaveLength(3);
    expect(sockets[2].url).toBe(`${DEFAULT_SERVER_ADDR}?token=jwt-1&name=Ash`);
  });

  it("stays on the old socket, and says so, when the leader's server cannot be reached", () => {
    const { manager, old, sockets, arrival } = hubSetup();
    old.receive(hubHandoff);

    sockets[1].serverClose(1006);

    expect(old.closedWith).toBeUndefined();
    expect(manager.isConnected()).toBe(true);
    expect(sockets).toHaveLength(2);
    expect(arrival.refused).toHaveBeenCalledWith(TRAVEL_UNREACHABLE);
  });

  it("moves nowhere, and says so, with no character to enter as", () => {
    const { old, sockets, arrival } = hubSetup(null);

    old.receive(hubHandoff);

    expect(sockets).toHaveLength(1);
    expect(arrival.refused).toHaveBeenCalledWith(TRAVEL_UNREACHABLE);
  });

  it("ignores a second travel while one is under way, and gives way to a run's handoff", () => {
    const { old, sockets } = hubSetup();
    old.receive(hubHandoff);
    old.receive(hubHandoff);
    expect(sockets).toHaveLength(2);

    old.receive(handoff());

    expect(sockets[1].closedWith).toEqual({ code: 1000, reason: "handoff_cancelled" });
    expect(sockets).toHaveLength(3);
    expect(sockets[2].url).toContain("session_id=run-1");
  });

  it("does not follow a redirect on the travel's connection once it is the game's (FS-MCYWK C17, C19)", () => {
    const { manager, old, sockets } = hubSetup();
    old.receive(hubHandoff);
    sockets[1].open();
    sockets[1].receive(hubEntered);

    sockets[1].receive({ action: "world_handoff", payload: { addr: "ws://pod-b/game/ws", reconnect: true } });

    expect(sockets).toHaveLength(2);
    expect(sockets[1].closedWith).toBeUndefined();
    expect(manager.getServerAddress()).toBe(LEADER_POD);
  });
});

describe("SocketManager redirect to the holding pod (FS-MCYWK C14–C19)", () => {
  const HOLDING = "ws://pod-a/game/ws";
  const redirect = (addr: string | null = HOLDING) => ({
    action: "world_handoff",
    payload: { ...(addr === null ? {} : { addr }), reconnect: true },
  });

  it("lets the landing socket go and connects to the holding pod as the same player, flagged redirected", () => {
    const { manager, old, sockets } = setup();

    old.receive(redirect());

    expect(sockets).toHaveLength(2);
    expect(sockets[1].url).toBe(`${HOLDING}?token=jwt-1&name=Ash&redirected=1`);
    expect(manager.getServerAddress()).toBe(HOLDING);
    expect(old.closedWith?.code).toBe(1000);
  });

  it("reads the landing socket's close as neither a disconnect nor an auth failure", () => {
    const { manager, old } = setup();
    const authError = vi.fn();
    manager.setOnAuthError(authError);
    const statuses: string[] = [];
    manager.onConnectionStatusChange((status) => statuses.push(status));

    old.receive(redirect());
    old.serverClose(4001);

    expect(authError).not.toHaveBeenCalled();
    expect(statuses).not.toContain("disconnected");
    expect(manager.getConnectionStatus()).toBe("connecting");
  });

  it("goes connected on open and dispatches what the holding pod sends as on any connection", () => {
    const { manager, old, sockets } = setup();
    const reconnected = vi.fn();
    manager.on("reconnected", reconnected);

    old.receive(redirect());
    const holding = sockets[1];
    holding.open();
    holding.receive({ action: "reconnected", payload: { x: 3 } });
    holding.receive({ action: "world_entered", payload: { session_id: "hub-a", world_type: "hub" } });

    expect(manager.getConnectionStatus()).toBe("connected");
    expect(reconnected).toHaveBeenCalledWith({ x: 3 });
    expect(useGameStore.getState().sessionId).toBe("hub-a");
    expect(useGameStore.getState().worldType).toBe("hub");

    manager.sendMessage("move" as any, { vx: 1, vy: 0 } as any);
    expect(holding.sent).toHaveLength(1);
    expect(old.sent).toHaveLength(0);
  });

  it("reconnects later to the holding pod plainly, without the redirected flag", () => {
    const { manager, old, sockets } = setup();

    old.receive(redirect());
    sockets[1].open();
    sockets[1].serverClose(1006);
    manager.reconnect();

    expect(sockets).toHaveLength(3);
    expect(sockets[2].url).toBe(`${HOLDING}?token=jwt-1&name=Ash`);
  });

  it("ignores a redirect on a connection it opened as redirected: one redirect per connect", () => {
    const { manager, old, sockets } = setup();

    old.receive(redirect());
    sockets[1].open();
    sockets[1].receive(redirect("ws://pod-b/game/ws"));

    expect(sockets).toHaveLength(2);
    expect(sockets[1].closedWith).toBeUndefined();
    expect(manager.getServerAddress()).toBe(HOLDING);
  });

  it("ignores a redirect with no addr, so the landing pod's close is an ordinary disconnect", () => {
    const { manager, old, sockets } = setup();

    old.receive(redirect(null));
    expect(sockets).toHaveLength(1);
    expect(old.closedWith).toBeUndefined();

    old.serverClose(1000);
    expect(manager.getConnectionStatus()).toBe("disconnected");
    expect(manager.getServerAddress()).toBe(DEFAULT_SERVER_ADDR);
  });

  it("falls back once to the default address, still redirected, when the holding pod cannot be reached", () => {
    const { manager, old, sockets } = setup();
    const authError = vi.fn();
    manager.setOnAuthError(authError);

    old.receive(redirect());
    const statuses: string[] = [];
    manager.onConnectionStatusChange((status) => statuses.push(status));
    sockets[1].unreachable();

    expect(sockets).toHaveLength(3);
    expect(sockets[2].url).toBe(`${DEFAULT_SERVER_ADDR}?token=jwt-1&name=Ash&redirected=1`);
    expect(manager.getServerAddress()).toBe(DEFAULT_SERVER_ADDR);
    expect(manager.getConnectionStatus()).toBe("connecting");
    // invisible beyond a brief connecting: no error painted before the fallback (R15)
    expect(statuses).not.toContain("error");

    sockets[2].unreachable();

    expect(sockets).toHaveLength(3);
    expect(manager.getConnectionStatus()).toBe("disconnected");
    expect(authError).not.toHaveBeenCalled();
  });

  it("is seated wherever the fallback lands, and a redirect there is not followed", () => {
    const { manager, old, sockets } = setup();

    old.receive(redirect());
    sockets[1].unreachable();
    sockets[2].open();
    sockets[2].receive(redirect());

    expect(manager.getConnectionStatus()).toBe("connected");
    expect(sockets).toHaveLength(3);
  });

  it("treats a redirected socket that opened and then closed as an ordinary close: no fallback", () => {
    const { manager, old, sockets } = setup();

    old.receive(redirect());
    sockets[1].open();
    sockets[1].serverClose(1006);

    expect(sockets).toHaveLength(2);
    expect(manager.getConnectionStatus()).toBe("disconnected");
    expect(manager.getServerAddress()).toBe(HOLDING);
  });

  it("still routes a 4001 on a redirected socket that opened to the auth error handler", () => {
    const { manager, old, sockets } = setup();
    const authError = vi.fn();
    manager.setOnAuthError(authError);

    old.receive(redirect());
    sockets[1].open();
    sockets[1].serverClose(4001);

    expect(authError).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(2);
  });

  it("does not fall back when the client itself disconnected while the redirect was connecting", () => {
    const { manager, old, sockets } = setup();

    old.receive(redirect());
    manager.disconnect();
    sockets[1].serverClose(1000); // the browser's close event for the client's own close

    expect(sockets).toHaveLength(2);
    expect(manager.getConnectionStatus()).toBe("disconnected");
  });
});
