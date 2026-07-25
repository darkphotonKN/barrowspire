# SPECIFICATION — game-client

> ⚠️ **GENERATED DRAFT (spec-bootstrap).** Reverse-engineered from the code on 2026-07-25 —
> captures what the client *does*, not what was intended. Correct it, don't trust it. `> REVIEW:`
> marks inferences, dead code, and suspected accidents. This is a **behavior** spec; all visual/
> art decisions are owned by [`docs/design-guideline.md`](docs/design-guideline.md) (the SSOT) —
> not here. This seeds the `/spec-audit` baseline for the frontend.

Living spec for the web client. Stack & conventions: [`CLAUDE.md`](CLAUDE.md). Backend it talks
to: `api-gateway` (REST) and `game-service` (WebSocket). Project refactor context:
[`/docs/refactor_plan.md`](../docs/refactor_plan.md).

Legend: ✅ DONE (built & code-verified) · ⚠️ PARTIAL · ⏳ PLANNED / NOT STARTED

## Assumptions (verify first)

- The client is a **Next.js 15 (App Router) + React 19 + Phaser 3.80** app; platform/account UI
  is React, the actual escape-run is Phaser. State is **Zustand**; networking is **native
  WebSocket + a REST `apiClient`**.
- It implements the **current escape-run + platform** surface only. The MMO-refactor HUB world
  and hub↔instance handoff are **not** present (⏳, see refactor plan).
- `socket.io-client` is a dependency but **unused** — real transport is native WebSocket. No
  socket.io-vs-gorilla mismatch exists.

## Purpose

The player-facing client: account/auth, profile & avatar, subscription (Stripe), leaderboard,
and the **Phaser escape-run** (queue → play → resolve). Server-authoritative; the client renders
server state and sends intents. ✅

## App surface (routes) ✅

All pages are `'use client'`; root layout wraps every page in `AuthGuard` → `Header`.

| Route | Purpose | Gating |
|---|---|---|
| `/` | Marketing landing; CTA depends on `isAuthenticated` | public |
| `/login` | `POST /api/member/signin` → store auth → `/game` (or `?redirect=`) | public |
| `/register` | `POST /api/member/signup`, then **poll** `GET /api/member/check-email` (1s ×15) → `/login` | public |
| `/portal` | Presentational splash → `/login` | public |
| `/game` | Auth-gated in-component; dynamically imports `PhaserGame` (`ssr:false`) | client-gated |
| `/profile` | Show member; 3-step avatar upload | client-gated |
| `/leaderboard` | Paginated (`getLeaderboard`, page 20) | public |
| `/subscription` | Stripe Elements checkout; hardcoded plan `prod_TxVD6tpLpq1NFf` ($10/mo) | client-gated |

> REVIEW: `middleware.ts` is a **no-op** (`NextResponse.next()`; comment says auth is
> localStorage-only so it can't gate server-side). ALL gating is client-side (`AuthGuard` is only
> a hydration gate; per-page `isAuthenticated`; Phaser `BootScene` token check). No route is
> server-protected.

## Key flows ✅

- **Register → Login:** signup → poll check-email until `exists` → `/login` → signin →
  `setAuth` → `/game`. (Matches the backend's async signup: gateway publishes signup over AMQP,
  auth-service creates the member, so the client polls until it exists.)
- **Queue → play:** `/game` mounts Phaser (Boot→Preload→MainMenu). BootScene opens the WS.
  MainMenu "Delve" sends `find_game`, shows a queue popup on `queue_status`, and on `game_found`
  starts `BarrowspireScene`.
- **In-game:** BarrowspireScene renders full-state broadcasts and sends `move`/`attack`/
  `interact`/`equip`/`unequip`.
- **Resolve:** server `end_game` → in-scene end overlay (`current_player === null` in state ⇒ escaped).
- **Loadout (pre-game):** LoadoutScene, REST only (`getItemInstances`, `getLoadout`,
  `PUT /api/items/loadout`).
- **Profile/avatar:** request presigned URL → `PUT` to S3 → confirm.
- **Subscription:** `subscribe` → Stripe `confirmCardPayment` → poll `subscription/permission` (5s ×12).

## Phaser integration ✅

- **Bridge:** `PhaserGame.tsx` creates `Phaser.Game` (1080×720, pixelArt, arcade zero-gravity).
  Registered scenes: **Boot, Preload, MainMenu, Loadout, Barrowspire**. Phaser reads auth from
  `localStorage`/Zustand directly (no React→Phaser event bus).
- **BootScene** — token gate (redirect `/login` if absent); opens the shared `SocketManager` WS
  with `?token=&name=`.
- **BarrowspireScene** (~4.4k lines) — the gameplay: renders players/walls/doors/containers/
  switches/escape-doors, movement, combat, chests, equipment, end overlay.

## State model (Zustand) ✅

- **`authStore`** — `{accessToken, refreshToken, memberInfo, isAuthenticated}`; **persisted** to
  `localStorage["auth-storage"]`. `memberInfo = {id,name,email,status,average_rating,avatar_url?,…}`.
- **`gameStore`** — `{sessionId}`, in-memory; set by SocketManager on `game_found`.
> REVIEW: `refreshToken` is stored but **never used** — no refresh flow; 401/`4001` force re-login.

## External API — REST (client-side contract) ✅

- **Base:** `NEXT_PUBLIC_API_URL` (default `http://localhost:7114` = **api-gateway**). Auth:
  `Authorization: Bearer <accessToken>` from localStorage; `401` → logout + `/login`.
- Endpoints called: `POST /api/member/{signin,signup}`, `GET /api/member`,
  `GET /api/member/check-email`, `POST /api/member/avatar/{upload-request,confirm}`,
  `POST /api/payment/subscribe`, `GET /api/payment/subscription/permission`,
  `GET /api/stats/leaderboard`, `GET /api/notification/` + `PATCH /:id/read` + `/read-all`,
  `GET /api/items/{loadout,instances}` + `PUT /api/items/loadout`.
> REVIEW: item JSON casing is split — `/api/items/instances` returns **snake_case** (proto),
> `/api/items/loadout` returns **camelCase** ids; the code comments the hazard.
> REVIEW: notification `created_at` is sometimes a string, sometimes `{seconds,nanos}` (proto).

## External API — WebSocket (client-side contract) ✅

- **Transport:** native `WebSocket`; URL **hardcoded** `ws://localhost:5668/game/ws`; auth via
  query `?token=<jwt>&name=<name>`; server close `4001` → clear auth + `/login`.
- **Envelope (send):** `{action, payload, seq}`; SocketManager auto-injects `session_id`
  (gameStore) and `player_id` (authStore) into every payload.
- **SENDS:** `find_game`, `move {vx,vy}`, `attack {enemy_entity_id}`, `interact {entity_id}`
  (doors/switches/escape/chests/item-pickup), `equip`/`unequip {item_entity_id}`. Declared but
  unused: `pickup`, `use`, `chat`.
- **RECEIVES:** `game_found`, `queue_status {current,total}`, `reconnected`, `end_game
  {player_id,position,result}`, `exit_door_unlocked {message}`, `interact {success,message}`, and
  the per-tick **`ClientGameState`** broadcast (`{session_id, current_player, other_players[],
  items[], doors[], walls[], containers[], escape_doors[], switches[], escaped_count}`).
> REVIEW: WS URL has **no env var** and port `5668` ≠ REST `7114` — won't work in any non-local deploy.

## Backend contract alignment (cross-check vs the service specs)

- **REST base `:7114` = api-gateway**, and every endpoint the client calls **matches an
  api-gateway route** in that service's spec. ✅
- **WS actions sent** (`find_game/move/attack/interact/equip/unequip`) **match the actions
  game-service handles**; the unused `pickup`/`use`/`chat` are **also** unhandled server-side —
  consistent on both ends. ✅
- **Movement `{vx,vy}` continuous** corroborates the game-service finding that movement is
  **continuous, not grid** — both sides agree; the old "grid/WASD" label is wrong on both.
- **`leave_queue` is broken end-to-end:** the client's Cancel button has a `// TODO: send leave
  queue message to backend` and never sends it, and game-service's dequeue is commented out.
  Neither side works.
> REVIEW: client expects `exit_door_unlocked` and an `interact {success,message}` reply; the
> game-service spec didn't surface those outbound messages — verify the server actually emits them.

## ⏳ Planned / Not Started (per refactor plan)

- **HUB world client** — shared social/staging space UI; none exists (only the escape-run world).
- **Hub ↔ instance handoff** — background the hub WS, connect to the instance WS, return on
  resolve; not present (single world type today).
- **Token refresh** — `refreshToken` is captured but no refresh flow is implemented.
- **Deploy-ready config** — externalize the WS URL and remove hardcoded localhost/ports.

## Known divergences, dead code & REVIEW

- **Dead code (not wired):** `GameScene.ts` + `GameOverScene.ts` (not in the scene list;
  GameScene has its own inline WS), the entire `src/game/` **MockBackend/GameClient/index**
  (no importers — not a dev flag), `src/utils/gameSession.ts` (parallel unused session manager),
  `src/assets/types/server.ts` (older protocol shape).
- **`find_game` sends a hardcoded `{playerId:"1"}`** — real id is injected separately; the literal
  is legacy/ignored.
- **Token-less in-scene reconnect** — `BarrowspireScene.connectToServer` reconnects without a
  token (relies on BootScene's socket still being live). [inference]
- **Equipment slot naming mismatch** — backend `chest/gloves/legs` vs frontend `body/hands/feet`,
  mapped in two places; fragile.
- **`ClientGameState.items: string[]`** is a `// TODO` unstructured contract.
- **Design-guideline drift (hand to theming, not spec):** package name still `void-raiders`;
  sci-fi copy leaks (`v0.1 // SECTOR 7-G`, "operators", "Transmitting…") and off-palette green
  `#4ecca3` violate [`docs/design-guideline.md`](docs/design-guideline.md). Cosmetic, not behavioral.

## Open questions

- Should server-side route protection exist, or is client-only gating acceptable?
- Does the server emit `exit_door_unlocked` / `interact` replies the client listens for?
- Is `find_game`'s hardcoded `playerId:"1"` safe to remove?
- Remove the dead GameScene/MockBackend/gameSession, or are they intended scaffolds?
