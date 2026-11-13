# game-service

The authoritative game worlds. Each is a session with its own isolated ECS world: the hub (one
per process, outlives every run), the fields (built at startup, never shut down) and the escape
runs (short-lived). A WebSocket message hub coordinates them.

- This is real-time coordination, not a domain model. Don't apply the DDD layering the other
  services use (model/repository/service/handler) to the game loop.
- Components are data only; systems hold the behaviour.
- No mutable state shared across worlds. Each world is keyed by its session id, so runs can
  later move from many-per-process to one process per run.
- Keep the message hub's routing generic, so the matchmaking ↔ run-allocation contract
  survives that move.
