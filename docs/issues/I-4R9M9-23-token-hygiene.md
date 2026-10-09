---
id: I-4R9M9-23
status: open
implements: FS-4R9M9
blocked_by: [I-4R9M9-20]
labels: [ready-for-agent]
title: "The player's token never reaches logs; token seam and record copy hardened"
---
Implements I-4R9M9-20's acceptance criterion "the token never appears in logs" — code-review MED + LOWs on I-4R9M9-20.

**Domain:** game-service (config/routes.go, auth/middleware.go, internal/gameserver/handler.go + server.go) and one comment in common/auth/interceptor.go. · **Lane:** agent.

## What to fix
1. **MED — token in access logs.** `game-service/config/routes.go:29` uses `gin.Default()`, whose access logger appends `RawQuery`; the client connects with `/game/ws?token=<jwt>&name=…`, so every WebSocket connect writes the bearer token to stdout. Replace the default logger with one that never prints the query for `/game/ws` (or redacts `token=`), keeping Recovery. Test it.
2. **LOW — comment.** `common/auth/interceptor.go:~40` says the catalogue reads are "internal gRPC only (the gateway does not expose them)"; `ListItemRarities` IS exposed as authenticated `GET /api/items/rarities` (api-gateway item/typed.go:~500). Correct the comment (nothing is newly exposed: the gateway route stays secured).
3. **LOW — token seam.** The token passes middleware → handler under the plain gin key `"token"` (`auth/middleware.go:~90`, `gameserver/handler.go:~57`). Use a shared exported key constant and add one middleware→handler test so a rename can't silently empty the token.
4. **LOW — record copy outside the lock.** `gameserver/handler.go:~60,80` reads `player.*` and `MapConnToPlayer(conn, *player)` copies the record (now incl. Token) without `s.mu`, racing `connectPlayer`/`JoinHub`/`setCurrentWorld`/`ApplyRunProgress`. Have `connectPlayer` return a value snapshot taken under the lock and use that.

## Acceptance Criteria
- [ ] A test proves a `/game/ws?token=secret` request logs no `secret`.
- [ ] Key constant shared; middleware→handler token test.
- [ ] -race on the handler/connect tests clean.
- [ ] game-service + common tests green (known pre-existing excluded).
