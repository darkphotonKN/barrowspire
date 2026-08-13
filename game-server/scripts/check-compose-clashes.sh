#!/usr/bin/env bash
#
# check-compose-clashes.sh — the two host-port invariants across every compose
# file in game-server/.
#
#   1. no host port is bound by two DIFFERENT containers
#   2. a container defined in both the root aggregate and its own per-service
#      compose file must publish the SAME host port in both
#
# Both exist because the failure they prevent ALREADY HAPPENED:
#   - payment-service and marketplace-service both bound 5224 with different DBs
#   - api-gateway/stats-service/example-service had drifted away from the ports
#     the running root aggregate actually uses (5214 vs 5220, 5217 vs 5223,
#     5223 vs 5290), so `docker compose up` in a service dir collided with the
#     already-running stack
#
# NOT covered here (deliberately): cross-repo collisions with fireplace/ and
# cosmic-void/, which share directory names and therefore compose project names.
# CI cannot see sibling repos. The defence there is an explicit top-level
# `name:` in each compose file — see observability/docker-compose.yaml.
#
# Usage:
#   scripts/check-compose-clashes.sh [GAME_SERVER_ROOT]
set -uo pipefail

ROOT="${1:-.}"

command -v docker >/dev/null 2>&1 || {
	echo "❌ docker not on PATH — cannot resolve compose files"
	exit 1
}

cd "${ROOT}" || exit 1

python3 - <<'PY'
import glob, json, os, subprocess, sys
from collections import defaultdict

def resolve(directory, filename):
    """Ask docker to resolve the compose file; None if it will not parse."""
    out = subprocess.run(
        ["docker", "compose", "-f", filename, "config", "--format", "json"],
        cwd=directory, capture_output=True, text=True,
    )
    if out.returncode != 0:
        return None
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        return None

def ports(body):
    """Published host ports for one service, as (port, protocol) strings."""
    for p in body.get("ports") or []:
        if isinstance(p, dict) and p.get("published"):
            yield f"{p['published']}/{p.get('protocol', 'tcp')}"

files = ["docker-compose.yml"] + sorted(glob.glob("*/docker-compose.y*ml"))

owners = defaultdict(set)   # host port -> {container name}
where = defaultdict(list)   # host port -> [(file, container)]
bycontainer = defaultdict(dict)  # container -> {file: port}
unparsed = []

for f in files:
    d, base = (os.path.dirname(f) or "."), os.path.basename(f)
    if not os.path.exists(f):
        continue
    # A stub that declares no services (e.g. auth-service, whose DB moved to
    # the root aggregate) is intentional, not a breakage — skip it silently.
    with open(f) as fh:
        if not any(l.rstrip().startswith("services:") for l in fh):
            continue
    cfg = resolve(d, base)
    if cfg is None:
        unparsed.append(f)
        continue
    for svc, body in (cfg.get("services") or {}).items():
        if not isinstance(body, dict):
            continue
        name = body.get("container_name") or f"{d}:{svc}"
        for port in ports(body):
            owners[port].add(name)
            where[port].append((f, name))
            bycontainer[name][f] = port

failures = 0

# --- gate 1: one host port, two different containers -----------------------
for port, names in sorted(owners.items()):
    if len(names) > 1:
        failures += 1
        print(f"❌ host port {port} is claimed by {len(names)} different containers:")
        for f, n in where[port]:
            print(f"     {n}  ({f})")

# --- gate 2: same container, disagreeing ports across files ----------------
for name, byfile in sorted(bycontainer.items()):
    distinct = set(byfile.values())
    if len(distinct) > 1:
        failures += 1
        print(f"❌ {name} publishes different host ports depending on the file:")
        for f, p in sorted(byfile.items()):
            print(f"     {p:>10}  ({f})")
        print("     The root aggregate is authoritative — align the per-service file.")

if unparsed:
    print()
    print("⚠️  could not parse (not gated, but these cannot start either):")
    for f in unparsed:
        print(f"     {f}")

print()
if failures:
    print(f"compose clash gate FAILED ({failures} clash(es))")
    sys.exit(1)
print("✅ compose clash gate passed — no host port bound twice, no drift vs root")
PY
