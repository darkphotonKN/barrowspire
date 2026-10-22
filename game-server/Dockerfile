# syntax=docker/dockerfile:1
# One Dockerfile for every service. Run from game-server/:
#   docker build --build-arg SERVICE=auth-service -t auth:dev .
#
# Architecture: on the M3 this builds arm64, which KinD on the Mac runs fine.
# GKE nodes are amd64, so images for GKE must be built with:
#   docker buildx build --platform linux/amd64 --build-arg SERVICE=auth-service -t <registry>/auth:<tag> .

# ---- build stage: has the Go toolchain, thrown away afterwards ----
FROM golang:1.25 AS build
ARG SERVICE
WORKDIR /src

# Static binary (no C libraries), built from the service's own go.mod
# (replace => ../common) instead of go.work, which expects all 12 modules.
ENV CGO_ENABLED=0 GOWORK=off

# Only what this service is made of: common plus itself.
# Editing another service never invalidates this one's cache.
# All of common is copied, but go build only compiles the packages the service imports.
COPY common/ common/
COPY ${SERVICE}/ ${SERVICE}/

# Cache mounts keep downloaded modules and compiled packages between builds,
# so a code change rebuilds in seconds.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    cd ${SERVICE} && go build -trimpath -ldflags="-s -w" -o /out/app ./cmd/server

# DEFERRED (migrations discussion): services migrate on boot from
# file://migrations, relative to the working dir, so ship them next to the binary.
# Services without migrations still build. Goes away if we switch to go:embed.
RUN mkdir -p /out/migrations && cp -r ${SERVICE}/migrations/. /out/migrations/ 2>/dev/null || true

# ---- runtime stage: what actually ships ----
# No shell, no package manager, CA certs and tzdata included, runs as uid 65532.
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/ /app/
ENTRYPOINT ["/app/app"]
