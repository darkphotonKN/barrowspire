# FS-MCYWK: Reconnect returns to the pod still holding the player

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Transport" → "Reconnect returns to the pod still holding the player"; `game-client/SPECIFICATION.md` "### Hub" → "Return to the server still holding the player" → this FS · Related ADRs: [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (one connection per pod, replaced only across pods), [ADR-0037](../adr/0037-party-state-lives-in-redis-membership-spans-pods.md) (the presence index) · Builds on: [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) (pod address, `pod:alive`, R29 `serverAddr` follows a move), [FS-NCC9J](NCC9J-party-membership-across-pods.md) (R7 the presence index covers every present player; R18–R20 travel)

Promoted 2026-11-04 from the 2026-11-01 draft under Nick's approved charter (stage 2, defaults
#1–#12 all approved). The draft's two open questions are answered by charter #1 (redirect at the
WebSocket handshake) and charter #2 (a player in a run takes the same path). Decisions are marked
**[draft]** (from the scoping notes, Nick's own), **[charter #N]** (an approved default, with its
reason), **[derived]** (follows directly from a charter default), or **[escalation, approved]**
(raised at promotion and decided by Nick on 2026-11-04, see *Escalated decisions* below).

**Lane.** game-service is the human lane (root `CLAUDE.md`); the server slice is authorised by
the charter. The client is the agent lane.

**Words.** *Present* is the glossary's word (game-service `CONTEXT.md`): a pod holds a player
while they are seated there or within its reconnect grace, and writes them into the presence
index. The **holding pod** is the pod the presence index names for a player. The **landing pod**
is wherever the load balancer put a new connection. The **redirect** is the landing pod's
one message sending a client to the holding pod. All four (holding pod, landing pod,
redirect, redirected connection) are in game-service `CONTEXT.md` under *Pods*; its "Hub
handoff" entry no longer claims this return, which per charter #3 is a break-before-make
reconnect with no `enter_hub`.

## Summary

A dropped player is held for a reconnect grace on the pod that served them, but a fresh
connection (a page refresh, a new login, another browser) goes through the shared entry address
and may land on any pod. Today it then starts fresh there and the held record is lost to them.
With this feature the landing pod asks the presence index, at the WebSocket handshake, whether
another live pod still holds the player; if one does, it tells the client to go there, and the
client reconnects to that pod, whose existing in-place reconnect puts the player back in the
world they stood in: hub, field or run. If no live pod holds them, nothing changes.

## Requirements

### A. The landing pod decides at the handshake (game-service)

1. **The server decides, not the client.** Where a player is held is server knowledge, found in
   the presence index; the client keeps no memory of its pod across a refresh. **[draft]**
   (Rejected: the client remembers its pod in `sessionStorage` or similar. It is lost on another
   computer or browser, or when site data is cleared.)
2. **Where the decision is made.** In `HandleWebSocketConnection`, after the member is verified
   and **before** `connectPlayer` creates or reattaches a record, and before anything else is done
   for the connection. A landing pod that redirects never creates a record, so it can never
   overwrite the holding pod's presence entry. **[charter #1: a record created on the wrong pod
   would overwrite presence, and a refreshed client may not have chosen a character yet, so
   `enter_hub` is too late and may never come]**
3. **Who is looked up.** Only a connection that is all of:
   - not a handoff arrival (no `session_id`): an arrival is FS-K2HKP's and keeps its own path;
   - not marked `redirected=1` (R8);
   - for a member with **no record on this pod**. A member on record here reconnects in place
     exactly as today, never looked up. This includes a dead delver kept until their run ends.
   **[charter #1, #2, #4]**
4. **The lookup.** The presence index by player id (`partypresence.Redis.Lookup`), and the
   holding pod's liveness `pod:alive:<podID>` (FS-K2HKP), both inside one bound of about
   **500 ms**. The bound is a named constant. **[charter #6: worst case is today's behaviour]**
   The liveness read is a narrow new one (see *Escalated decisions*). **[escalation, approved:
   Nick, 2026-11-04]**
5. **Redirect when, and only when,** the lookup finds an entry whose pod is **not this pod**, that
   entry carries a pod address, and that pod's `pod:alive` key exists. **[charter #5, #7; draft
   "must not be sent to a dead pod", as FS-R82NV R3 does for pointers]**
6. **Otherwise the connection is seated where it landed, exactly as today.** That covers: no
   entry; an entry naming this pod with no record here (stale) **[charter #7]**; an entry whose
   pod is not alive **[charter #5]**; an entry with no pod address (written by a pod from before
   addresses were kept, as travel treats it); a lookup or liveness read that errs or exceeds the
   bound **[charter #6]**; and a pod built without the presence index or without the liveness
   reader (no Redis, as in tests), which never looks up **[derived from charter #6: no lookup is
   possible, so the worst case is today's]**.
7. **The redirect.** The landing pod upgrades the connection, sends exactly one message,
   `world_handoff {addr: <the holding pod's address>, reconnect: true}`, with no `session_id` and
   no `hub`, then closes the socket with a normal close (`1000`, reason `redirected`). It creates
   no record, maps no connection, starts no writer, and writes nothing to the presence index or
   the queue. The redirect is logged at info with the player id and the holding pod's id.
   **[charter #3: the landing pod holds nothing, so make-before-break buys nothing, and the
   existing hub handoff sends `enter_hub`, which needs a chosen character]**
8. **Loop guard.** A connection that carries `redirected=1` is never looked up and never
   redirected: it is seated where it lands. The WebSocket auth middleware passes the query
   parameter through to the handler as it already passes `session_id`. **[charter #4]**
9. **A player in a run on another pod takes the same path.** The redirected connection is a plain
   one; the holding pod's record already names the run, so its existing in-place reconnect
   (`reconnected`, then `world_entered` for the run) puts them back. `?session_id=` stays for a
   handoff's first arrival only. **[charter #2: the holding pod's record already names the run]**
10. **A second tab or device.** A member connected on pod A who opens another connection that
    lands on B is still redirected to A; A's one-live-connection rule (`MapConnToPlayer`)
    supersedes the older socket, as it does today on one pod. **[charter #11]**
11. **No occupancy check on the return.** A grace-held player still occupies their seat:
    `holdForReconnect` only unmaps the connection, and `Session.AdmitPast` checks the cap only
    for a player not already seated. The in-place reconnect is not a new admission, and this
    feature adds no cap check. **[charter #12]**
12. **The grace lapsed between the lookup and the arrival.** The holding pod has no record by the
    time the redirected connection reaches it, so it treats it as a fresh connection (it carries
    `redirected=1`, so it is seated there, not looked up again), and the client runs its normal
    fresh flow. Nothing is refused for it. The existing refusal of a record that goes *during*
    connection setup (`CloseTryAgainLater`) is unchanged. **[charter #8]**

### B. Presence during the grace (game-service)

13. **No new write.** `PresentPlayers` already lists a player within the reconnect grace (their
    record kept, their connection unmapped), so the presence keeper keeps seating and refreshing
    their entry until the grace ends, when the record is deleted and the next tick unseats them.
    This feature adds only a test asserting it. **[charter #10; draft "the holding pod keeps
    refreshing it until the grace ends"]**

### C. The client follows the redirect (game-client)

14. **A distinct branch.** `SocketManager` handles `world_handoff` with `reconnect: true` on its
    own path, checked before the hub and run handoff branches (the redirect carries neither
    `hub` nor `session_id`, so today it would fall into the run handoff and be dropped as
    malformed). `WorldHandoffPayload` gains `reconnect?: boolean`. **[charter #3]**
15. **Break-before-make.** On a redirect received on the game's current socket, the client
    detaches that socket's handlers (so its close reads as neither a disconnect nor an auth
    failure) and lets it go, sets `serverAddr` to `addr`, and runs its ordinary reconnect to it as
    the same player, adding `redirected=1` to that one connection. The connection status goes
    `connecting`, then `connected` on open. What the holding pod then sends (`reconnected`,
    `world_entered`) is dispatched as on any connection. **[charter #3, #4; FS-K2HKP R29: a later
    reconnect returns to the server the player moved to]**
16. **Only the redirected connection carries the flag.** A later reconnect (the scene's
    `connectToServer`, `reconnectIfGone`) is a plain one to `serverAddr`. **[charter #4]**
17. **The client follows one redirect per connect.** A redirect arriving on a connection the client
    opened with `redirected=1` is ignored and logged; the server never sends one (R8), so this is
    belt and braces. A redirect with no `addr` is ignored and logged, and the landing pod's close
    then reads as an ordinary disconnect. **[derived from charter #4]**
18. **The redirect target cannot be reached.** If the redirected socket closes without ever
    opening, the client tries **once** more at `DEFAULT_SERVER_ADDR`, also carrying
    `redirected=1`, sets `serverAddr` back to `DEFAULT_SERVER_ADDR`, and is seated wherever that
    lands. If that also closes without opening, it is an ordinary disconnect; nothing further is
    retried by this feature. A redirected socket that opened and then closed is an ordinary close
    (`4001` still means an auth failure). **[charter #9]**
19. **A travel's hub handoff connection carries `redirected=1` too.** Under FS-NCC9J R18–R20 a
    traveller's new, plain connection lands on the leader's pod while their old pod may still
    name itself in the presence index (it stops writing them on its next one-second tick, and the
    unseat is written asynchronously). Without the flag, the leader's pod would redirect the
    traveller straight back and the travel would fail as "unreachable". A connection a server
    directed the client to make is seated where it lands. A run handoff's arrival needs no flag:
    its `session_id` already exempts it (R3). **[escalation, approved: Nick, 2026-11-04;
    extends charter #4's flag]**

### Escalated decisions (approved by Nick, 2026-11-04)

- **R19 extends charter #4's flag to a travel's hub handoff connection.** Not in the charter;
  escalated at promotion and approved as written.
  Without it, R3–R5 race FS-NCC9J travel: the traveller's old pod unseats them on its next tick
  (up to ~1 s, plus the ordered writer's latency), and in that window the leader's pod finds them
  present on a live other pod and redirects them back. It changes only `SocketManager` (in the
  charter's bounds). Because the server slice would break travel without it, the client slice
  must merge before or with the server slice.
- **Pod liveness is read through a narrow new read** of the existing `pod:alive:<podID>` key
  (today only written, by the matchmaker's heartbeat, and read inside the match-queue Lua
  scripts). A consumer-owned interface in `internal/gameserver`, implemented on the match-queue
  Redis that owns the key, injected in `config/routes.go`. No key, TTL or write changes. It
  reaches beyond `handler.go` (`internal/match_queue/redis.go`, `config/routes.go`), so it was
  escalated rather than assumed in bounds, and approved.

R6's "no presence index or liveness reader → never look up" and R17's client-side guard are
**[derived]**: direct readings of charter #6 and #4, not escalations.

## User Stories

1. As a player who refreshes the page in the hub, I want to come back to the same pod's hub, so that I stand where I was with the same people around me.
2. As a player who refreshes mid-run, I want to be put back in my run, so that a refresh never costs me my delve.
3. As a player in a field, I want a refresh to return me to the pod holding me, so that the field's existing reconnect rules apply rather than a fresh start elsewhere.
4. As a player whose network blipped, I want my reconnect to find my pod even through the shared address, so that the 30 s grace actually protects me on a multi-pod deployment.
5. As a player who logs in on another computer within the grace, I want to land on the pod holding me, so that where I am is not tied to one browser's storage.
6. As a player with two tabs open, I want the new tab to take over my one connection on my pod, so that I never end up seated twice on two pods.
7. As a player whose holding pod has died, I want to be seated where I land, so that I am never sent to a dead server.
8. As a player when Redis is slow or down, I want to be seated where I land within about half a second, so that the lookup never makes connecting worse than today.
9. As a player whose grace ran out just as I was redirected, I want to start fresh on the pod I was sent to, so that a lost race never ends in a refusal.
10. As a player whose redirect target cannot be reached, I want one more try through the shared address, so that a broken pod address does not strand me.
11. As a player, I want the redirect to be invisible beyond a brief "connecting", so that coming back feels like reconnecting, not like moving.
12. As a player who has not chosen a character yet, I want the return to work anyway, so that the character select screen does not stop me getting back.
13. As a player connected on a single-pod deployment, I want nothing to change, so that local development behaves as before.
14. As a party member travelling to my leader's village, I want my move to land, so that this feature never bounces me back to my own pod.
15. As a player handed off to a run, I want my arrival to work as before, so that matchmaking is untouched.
16. As a dead delver kept until my run ends, I want my reconnect to the pod holding my body to work as before, so that I can still see the result.
17. As an operator, I want every redirect logged with the player and the holding pod, so that I can see returns happening on GKE.
18. As an operator, I want a landing pod that redirects to leave no record and no presence entry behind, so that the holding pod's entry is never overwritten.
19. As an operator, I want a redirected connection never to be redirected again, so that two pods with stale views cannot bounce a client between them.
20. As a developer, I want the presence entry of a player in grace asserted by a test, so that a later change to `PresentPlayers` cannot silently break returns.
21. As a developer, I want a pod built without Redis to skip the lookup entirely, so that existing tests and the single-pod setup need no fakes.
22. As a player reconnecting after a handoff moved me, I want later reconnects to keep going to the pod I was returned to, so that FS-K2HKP R29 still holds.

## Acceptance Criteria

### Server (game-service)

- [ ] A fresh connection for a member with no record here, found present on another live pod with an address, gets exactly one `world_handoff {addr, reconnect: true}` and a `1000` close; the landing pod keeps no record, mapped connection or presence entry for them.
- [ ] A member already on record on the landing pod is never looked up and reconnects in place as today.
- [ ] A connection carrying `session_id` is never looked up and follows FS-K2HKP's arrival path unchanged.
- [ ] A connection carrying `redirected=1` is never looked up and is seated where it lands.
- [ ] No entry, an entry naming this pod, an entry with no address, or an entry whose pod has no `pod:alive` key: seated where it landed.
- [ ] A lookup or liveness read that errs or takes longer than the bound: seated where it landed, within the bound.
- [ ] A pod built without the presence index or the liveness reader never looks up.
- [ ] On the holding pod, the redirected connection of a member in a run gets `reconnected` and the run's `world_entered`, and is back in the run.
- [ ] On the holding pod, a redirected connection whose record went before it arrived is seated as a fresh connection, not refused.
- [ ] The return admits a grace-held player into a full hub (no cap check on an in-place reconnect).
- [ ] A test asserts `PresentPlayers` lists a player within the reconnect grace, and not after it ends.
- [ ] The middleware passes `redirected` through; nothing else in the handshake, proto, gateway or manifests changes.
- [ ] Tests pass.

### Client (game-client)

- [ ] `world_handoff` with `reconnect: true` takes its own branch: the current socket is let go quietly (no disconnected status, no auth error), `serverAddr` becomes `addr`, and a new connection opens to `addr` with `token`, `name` and `redirected=1`.
- [ ] Messages the holding pod sends on that connection dispatch as usual (`reconnected`, `world_entered` switch the scene).
- [ ] A later `reconnect()` goes to the new `serverAddr` without `redirected=1`.
- [ ] A redirect on a connection opened with `redirected=1`, or one with no `addr`, is ignored.
- [ ] A redirected socket that closes without opening triggers exactly one retry at `DEFAULT_SERVER_ADDR` with `redirected=1`, and `serverAddr` is `DEFAULT_SERVER_ADDR` after it; a second failure is an ordinary disconnect.
- [ ] A redirected socket that opens and then closes is an ordinary close (`4001` still routes to the auth error handler).
- [ ] A travel's hub handoff connection URL carries `redirected=1`; a run handoff's URL is unchanged.
- [ ] Tests pass.

### Live (two pods)

- [ ] With two local pods behind one entry address, a player in the hub of pod A who refreshes and lands on pod B is returned to A's hub; a player in a run on A who refreshes is returned to the run.
- [ ] Stopping pod A, then refreshing after its `pod:alive` has lapsed, seats the player on B.
- [ ] A party travel between the two pods still lands.

## Edge States

- **Holding pod died:** its `pod:alive` lapses within 3 s, its presence keys within 30 s. In between, the entry exists but the pod is not alive: seated where landed (R5, R6). **[charter #5]**
- **Holding pod is alive but its address is unreachable from the client** (closed port, wrong `POD_ADDR`): the redirected socket closes before opening; one retry at the default address, seated wherever it lands (R18). Whether `pod_addr` is reachable from the browser on GKE is FS-K2HKP's concern. **[charter #9]**
- **Redis slow or down:** the bound expires, seated where landed (R6). Connecting is at most ~500 ms slower than today. **[charter #6]**
- **Stale self-entry:** the index names the landing pod but it has no record (it restarted with the same pod id, or the record went just now): seated here (R6). **[charter #7]**
- **Grace lapsed in flight:** fresh connection on the holding pod, normal fresh flow (R12). **[charter #8]**
- **Two tabs:** the second is redirected to the first's pod, which supersedes the older socket (R10). The older tab sees its socket closed. **[charter #11]**
- **Both pods stale:** B redirects to A; A has no record and the connection carries `redirected=1`, so A seats it. No loop (R8). **[charter #4]**
- **Player without a character on the holding pod** (connected but still on the character screen): `PresentPlayers` skips a record with no character, so they are not in the index, and a second connection lands fresh wherever it lands. Unchanged from today.
- **A traveller let go by their old pod:** out of the index on the old pod's next tick; their travel connection carries `redirected=1` and is never redirected (R19). A traveller who refreshes mid-travel is looked up like anyone else.
- **Messages the client sent on the landing socket before the redirect arrived** are lost with it; the holding pod's `reconnected` / `world_entered` decide where the player is.
- **A run handoff arrival** (`session_id`) is never looked up (R3); its refusals and `4002` close are unchanged.
- **A later reconnect to a holding pod that has since died** goes to the pinned `serverAddr` and fails as any handoff-pinned reconnect does today (FS-K2HKP R29). Not changed here.
- **Single pod (local dev):** the index always names this pod or nothing; never redirects.
- **Unauthorized:** the auth middleware refuses with `4001` before any lookup, as today.
- **Full hub met by a player whose grace already lapsed:** today's `ErrWorldFull` path, out of scope.

## Out of Scope

- Session affinity in the deployment manifests.
- The client remembering its pod across a refresh (rejected, R1).
- Whether `pod_addr` is reachable from the browser on GKE (FS-K2HKP).
- A full hub met by a player whose grace already lapsed (today's `ErrWorldFull` path).
- Any change to proto, the gateway or its OpenAPI, new endpoints, the data model or migrations, Kubernetes manifests, or the presence write path (R13 adds a test only).
- Recovering a later reconnect pinned to a dead pod's address.
- Pulling party members to a party pod (FS-R82NV R24's recall, superseded by FS-NCC9J); this FS only returns a player to the pod that still holds them.
