#!/usr/bin/env bash
#
# verify-error-contract.sh — exercise each error class against a RUNNING gateway.
#
# FS-0001 changes the error body on all 33 routes, and there is no openapi.yaml in
# this repo yet, so oasdiff has nothing to diff against: the break is structurally
# invisible to the breaking-change gate (I-0008, ADR-0001 "known blind spot").
# Manual before/after verification is the only verification available.
#
# Usage:
#   scripts/verify-error-contract.sh [BASE_URL]      # default http://localhost:7114
#
# Run it once on main BEFORE merging this branch and once after, and keep both
# outputs. What must change: the body gains `code` and the content type becomes
# application/problem+json. What must NOT change: the status column.
set -uo pipefail

BASE="${1:-http://localhost:7114}"

if ! curl -sS -o /dev/null --max-time 3 "${BASE}/" 2>/dev/null; then
	echo "❌ nothing answering at ${BASE} — bring the stack up first (docker compose up)"
	exit 1
fi

printf '%-26s %-7s %-34s %s\n' "CASE" "STATUS" "CONTENT-TYPE" "CODE"
printf '%.0s─' {1..92}; echo

probe() {
	local label=$1
	shift
	local body headers status ctype code
	body=$(curl -sS -D /tmp/vec-h.txt --max-time 10 "$@" 2>/dev/null)
	status=$(awk 'NR==1{print $2}' /tmp/vec-h.txt)
	ctype=$(awk -F': ' 'tolower($1)=="content-type"{gsub(/\r/,"",$2); print $2}' /tmp/vec-h.txt | head -1)
	code=$(printf '%s' "${body}" | sed -n 's/.*"code"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)

	printf '%-26s %-7s %-34s %s\n' "${label}" "${status:-—}" "${ctype:-—}" "${code:-<none>}"
}

# ── the classes FS-0001 §API surface pins ──────────────────────────────────────

# 401 · UNAUTHENTICATED — no Authorization header
probe "no token" "${BASE}/api/member"

# 401 · UNAUTHENTICATED — a token that is not a JWT at all
probe "garbage token" -H "Authorization: Bearer not-a-jwt" "${BASE}/api/member"

# 400 · VALIDATION_FAILED — body is not JSON
probe "malformed JSON" -X POST -H 'Content-Type: application/json' \
	--data '{"email":' "${BASE}/api/member/signin"

# 400 · VALIDATION_FAILED — well-formed JSON, required fields missing
probe "missing fields" -X POST -H 'Content-Type: application/json' \
	--data '{}' "${BASE}/api/member/signin"

# 400/401 — well-formed but wrong credentials
probe "bad credentials" -X POST -H 'Content-Type: application/json' \
	--data '{"email":"nobody@example.invalid","password":"wrong-password"}' \
	"${BASE}/api/member/signin"

# 404 · NOT_FOUND — route that does not exist
probe "unknown route" "${BASE}/api/definitely-not-a-route"

# 401 first, then whatever the item surface says — needs a token to reach 404
probe "item, no token" "${BASE}/api/items/loadout"

echo
cat <<'EOF'
Read the table this way:

  BEFORE (main, pre-merge)  every CODE column reads <none>, content-type is
                            application/json, and bodies disagree in shape.
  AFTER  (this branch)      every row carries a CODE, content-type is
                            application/problem+json, and STATUS is unchanged
                            from the before run.

A STATUS that moved is a regression and must be explained before merge.
A row still reading <none> is an error path that never reached the seam.

Not covered here, because neither can be forced from outside:
  503 · SERVICE_UNAVAILABLE  — stop a downstream service and re-run "item, no token"
                               with a valid token
  500 · INTERNAL_ERROR       — exercised by the seam's own unit tests instead
EOF
