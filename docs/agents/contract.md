# Contract config (read by develop's contract check + code-review's spec axis; written once)
# One contract config per repo. Skills READ this file; they never write it.
#
# WHY THIS FILE EXISTS: the skills are generic and must not hardcode a toolchain.
# `develop`'s pre-flight says "regenerate the contract document and the client" without
# naming a command; this file is where a repo answers that. Same role tracker.md plays for
# issue backends: backend-neutral skill + per-repo binding.
#
# Schema authority: docs/agents/README.md. Decision: docs/adr/0001-contract-layer.md.
#
# NOTE ON PATHS: gate configs live at game-server/, not the repo root, because that is where
# go.work defines the Go workspace. Makefile paths are relative to game-server/api-gateway/.

# --- Plane 1: game-client <-> api-gateway (HTTP) ---
plane1_spec: game-server/api-gateway/openapi.yaml
plane1_regen: make -C game-server/api-gateway openapi
plane1_client_regen: make -C game-server/api-gateway client
plane1_client_dir: game-client/src/api/generated
plane1_lint: game-server/.spectral.yaml
plane1_breaking: oasdiff
plane1_breaking_version: 1.28.0        # pinned prebuilt binary; @latest in a gate is not reproducible
plane1_breaking_allowlist: game-server/.oasdiff-ignore
plane1_gates: make -C game-server/api-gateway gates
plane1_fixtures: game-server/contract-fixtures/

# --- Plane 2: service <-> service (gRPC) ---
plane2_proto: game-server/common/api/proto
plane2_lint: buf lint
plane2_breaking: buf breaking
# NOT YET WIRED — plane 2 governance is declared by ADR-0001 §12 but not implemented.
# Listed so the shape is visible and the gap is explicit rather than silently absent.

# --- Validation policy (ADR-0001 §6-§8) — read this before adding an operation ---
# Two layers, two statuses, no overlap:
#   SHAPE  -> the boundary (huma, from the Go type)          -> 422 VALIDATION_FAILED
#   DOMAIN -> the OWNING downstream service, never the edge  -> 400 + specific code
# The gateway never restates a downstream rule.
plane1_request_strictness: strict     # additionalProperties:false; unknown member -> 422
plane2_request_strictness: tolerant   # protobuf ignores unknown fields by design;
                                      # buf breaking is plane 2's equivalent guard
#
# Strictness follows the DEPLOYMENT MODEL: reject unknown input when the consumer ships
# with you, tolerate it when it does not. REVISIT the moment a consumer appears that
# deploys independently of the server.

# Request-type rules (ADR-0001 §5):
#   - read-only fields (id, createdAt, updatedAt) NEVER appear in a request type
#   - identity comes from the verified JWT / metadata, NEVER from the body
#   - optional fields MUST carry `omitempty` — huma marks a field required without it,
#     which would reject an empty `{}` body
#   - responses may stay closed (additionalProperties:false); a server never validates
#     its own response, so it only documents the exact published shape

# --- Error vocabulary ---
errcode_pkg: game-server/common/errcode
# The six generic codes are seeded. Domain codes are added as real failures need
# distinguishing — never speculatively. `code` is contract: removing or repurposing one is
# breaking, adding one is not.

# --- PRECONDITION, NOT YET MET ---
# ADR-0001 §6 requires HTTP error status to be decided in exactly ONE seam. That seam does
# not exist yet: the gateway has 90 direct c.JSON(http.Status4xx/5xx) writes across 8 files and
# four different body shapes, and no error package.
#
# Built by: FS-0001 (docs/specs/0001-uniform-error-contract.md).
# Until it ships, the gates below are copied-but-inert and NO endpoint should be serialized —
# a generated contract cannot honestly describe failures the code decides in 90 places.
error_seam: NOT_YET_BUILT             # -> game-server/api-gateway (see FS-0001)

# --- Transitional state ---
# There is no legacy documentation surface to retire: this repo had no API spec of any kind
# before ADR-0001. Every endpoint is unserialized until its first serialize-on-touch slice.
legacy_spec: none
legacy_lint: none
