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

Every sign-in runs bcrypt in auth (~200ms of CPU), so the sign-in rate is the
cost driver. Start low.

## Scenarios

Run from `game-server/deploy/load/`.

**1. Baseline: 5 rps for 3 minutes.** The steady-state picture: request rate,
p50/p95/p99 per route, and exemplar dots on the latency panels.

```bash
RATE=5 DURATION=3m k6 run k6/signin-flow.js
```

**2. Wrong-password bot.** Every 3rd iteration signs in with a wrong password.
The 401 rate on `/api/member/signin` rises on the errors panel, and each
failure still costs a full bcrypt compare in auth.

```bash
RATE=5 DURATION=3m BAD_PW_EVERY=3 k6 run k6/signin-flow.js
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
