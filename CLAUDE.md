# The Age of Barrowspire

A multiplayer barrow-dungeon game being turned from an instanced extraction game into an
MMO-RPG: a persistent hub plus instanced escape runs. Go microservices under `game-server/`, a
Next.js + Phaser client in `game-client/`.

## Two lanes

- **game-server is the human lane.** Kranti hand-codes it to optimise the Go and keep a grip
  on advanced Go. When asked directly to build a backend feature, build it. Never take one on
  by inference: if client work seems to need a server change, say so and stop there. A
  server change with no spec is expected; `/spec-reconcile` catches the records up afterwards.
- **game-client is the agent lane, spec-first:** `/scope-it` → `/write-a-spec` →
  `/spec-to-issues` → `/develop` → `/code-review`.

## Commands

Each service has its own Makefile (`game-server/<service>/`); there is no root build.

```bash
make test            # in a service dir; also test-unit (game-service adds lint and check)
make test-db         # in game-server/common: opt-in DB tests (the rest: docs/db-tests-guide.md)
make gen             # in game-server/common: regenerate the Go from the .proto files
make openapi client  # in game-server/api-gateway: regenerate the contract + client
npm test             # in game-client (vitest); also npm run lint, npm run lint:fence, npx tsc --noEmit
```

## Things the code won't tell you

- Decisions in `docs/adr/` are constraints. Check them before an architectural change.
- Generated code is never hand-edited: `game-server/api-gateway/openapi.yaml`,
  `game-client/src/api/generated/`, and the Go under `common/api/proto`. Edit the handler or
  the `.proto`, regenerate, and commit them together. How the contract fits together:
  `docs/contract-guide.md`.
- Every service except game-service is DDD-lite, and the layering is a rule, not a habit: a
  handler parses, calls the service and formats; business logic lives in the service; SQL
  lives only in the repository. Ledger, wallet and marketplace split the service into
  `domain`, `usecase` and `query`, and their read-side queries hold SQL too. External services
  sit behind an interface the consumer owns.
- Log with `slog`. Most `main.go` and `config/db.go` files, and a few AMQP consumers, still use
  `log` as well; don't copy them.
- Specs: root `SPECIFICATION.md` is the service map only. Each service and the client has its
  own thin `SPECIFICATION.md` and `CONTEXT.md`; feature specs live in `docs/specs/`. The
  formats are defined in `docs/specs/README.md`. `game-server/common/` has no spec, and
  character-service has none yet.
- `.claude/skills/` is a symlink into the `ai-software-engineering` repo and shared by every
  project. Never edit it from here. A rule only barrowspire needs goes in this file.
- Commits: `type(scope): description`, with the issue id in brackets when there is one, e.g.
  `(I-50MTX-6)`.
