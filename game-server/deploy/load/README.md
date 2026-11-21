# Load tests (k6)

Drives real traffic through the gateway so the RED dashboard, exemplars,
traces and the service graph have something to show. Runs from your machine
against prod (`https://api.barrowspire.app`); nothing here is deployed.

## Install k6 (macOS)

```bash
brew install k6
k6 version
```

## Account

Use a dedicated test account, never a real player's. Pass its credentials
through env, never in a file:

```bash
export EMAIL='loadtest@example.com'
read -s PASSWORD && export PASSWORD   # typed, not left in shell history
```

Every sign-in runs bcrypt in auth (~200ms of CPU). The browse scenario signs
each VU in once and reuses the token, the way a player's client does, so its
cost is the page views. The wrong-password scenario is the one that drives
bcrypt, so keep `LOGIN_RATE` low.

## What a run should show

The end-of-run summary has `browse_signins`, one per sign-in the browse
scenario made. It should be close to `vus_max` (about `RATE * 2`, the
pre-allocated VUs), not to `iterations`. If it tracks iterations, tokens are
not being reused and every page view is paying for bcrypt again.

On the dashboard, `/api/member/signin` is a small burst at the start of the run
and then flat, and `/api/characters` and `/api/marketplace/listings` carry the
steady rate.

## Scenarios

Run from `game-server/deploy/load/`.

**1. Baseline: 5 page views a second for 3 minutes.** The steady-state
picture: request rate, p50/p95/p99 per route, and exemplar dots on the latency
panels.

```bash
RATE=5 DURATION=3m k6 run k6/signin-flow.js
```

**2. Wrong-password bot.** Adds a second scenario alongside the browsing:
`LOGIN_RATE` sign-ins a second (default 1), every 3rd on a wrong password. The
401 rate on `/api/member/signin` rises on the errors panel while the browse
routes stay clean, and each failure still costs a full bcrypt compare in auth.

```bash
RATE=5 DURATION=3m BAD_PW_EVERY=3 k6 run k6/signin-flow.js
RATE=5 DURATION=3m BAD_PW_EVERY=3 LOGIN_RATE=2 k6 run k6/signin-flow.js   # a busier bot
```

**3. One slow route (gateway env toggle).** Set `DEBUG_SLOW_ROUTE` on the
gateway, roll it, then run the baseline. Only the listings route's latency
moves, and its exemplars open traces where the gap sits in the gateway span,
before any downstream call.

```bash
kubectl --context gke_barrowspire-512613_asia-east1_barrowspire-dev -n barrowspire \
  set env deploy/gateway DEBUG_SLOW_ROUTE=/api/marketplace/listings=300ms
RATE=5 DURATION=3m k6 run k6/signin-flow.js
```

Turn it off afterwards (this rolls the gateway again):

```bash
kubectl --context gke_barrowspire-512613_asia-east1_barrowspire-dev -n barrowspire \
  set env deploy/gateway DEBUG_SLOW_ROUTE-
```

The format is `route=duration[,route=duration]`, where route is the gin route
template the RED metrics label by (`/api/items/:id`, not `/api/items/42`). The
gateway logs a warning at startup while it is set. `set env` changes the live
Deployment only, so git and the cluster differ until you remove it.

**4. Combined: bot plus slow route.** Both toggles at once, to practise telling
two problems apart from the dashboard alone: the 401s belong to signin, the
latency to listings.

```bash
RATE=5 DURATION=3m BAD_PW_EVERY=3 k6 run k6/signin-flow.js   # with DEBUG_SLOW_ROUTE still set
```

## Game metrics (not drilled yet)

game-service serves these on its metrics port (8195) next to the tick and gRPC
metrics. k6 does not drive them: they need WebSocket players. The pod comes
from the scrape's `pod` label.

| Series | Kind | Read it as |
|---|---|---|
| `game_ws_connections` | gauge | `sum(game_ws_connections)`, or by `pod` to see the spread |
| `game_delves_active` | gauge | escape runs per pod; the hub and fields do not count |
| `game_matchmaking_queue_depth` | gauge | the global queue, sampled from Redis once a second. Every pod reports the same list, so use `max()`, never `sum()` |
| `game_matchmaking_wait_seconds` | histogram | join to match, observed by the pod that queued the player, up to 1s late. `histogram_quantile(0.95, sum by (le) (rate(game_matchmaking_wait_seconds_bucket[5m])))` |
| `game_ws_messages_total{direction,type}` | counter | `direction` is `in` or `out`; `type` is the action, `state` for the per-tick world state, `malformed` for frames that are not JSON, `other` for an action the game does not know |
