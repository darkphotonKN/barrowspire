#!/usr/bin/env bash
#
# check-seam.sh — the three gates FS-0001 I-0007 asks for.
#
#   1. no direct 4xx/5xx status writes outside the seam package
#   2. no apperr.WithDetail carrying a downstream message to the client
#   3. no unrecorded change to the `go` directive
#
# Every one of these exists because the failure it prevents ALREADY HAPPENED once
# during FS-0001 and was found by reading a diff. Reading diffs is not a control.
#
# Usage:
#   check-seam.sh [SCAN_ROOT] [WORKSPACE_ROOT]
#
# Both arguments exist so the fixtures can point the same code at deliberately
# broken inputs (see `make seam-gate-selftest`). A gate that has never been
# observed rejecting something is unverified configuration.
set -uo pipefail

SCAN_ROOT="${1:-api-gateway}"
WORKSPACE_ROOT="${2:-.}"
SEAM_PKG="internal/httperr"
LOCK_FILE="${WORKSPACE_ROOT}/.go-directive-lock"

failures=0

fail() {
	echo "❌ $1"
	failures=$((failures + 1))
}

# ---------------------------------------------------------------------------
# 1. Direct error-status writes (FS-0001 §Requirements 13)
#
# 90 of these existed before FS-0001, so git history is full of examples to copy
# from and review depends on a reviewer noticing a one-line c.JSON.
# ---------------------------------------------------------------------------
echo "→ checking for direct 4xx/5xx writes outside ${SEAM_PKG}"

# The seam is the one legitimate writer. Excluded by PACKAGE, not by file path,
# so moving the seam does not silently disable the gate — if the package moves,
# this stops matching and the gate starts failing rather than passing blindly.
direct_writes=$(grep -rn 'c\.JSON(http\.Status\|c\.AbortWithStatusJSON(' \
	--include='*.go' "${SCAN_ROOT}" 2>/dev/null |
	grep -v "/${SEAM_PKG}/" |
	grep -v '_test\.go:' |
	grep -Ev 'StatusOK|StatusCreated|StatusAccepted|StatusNoContent' || true)

if [ -n "${direct_writes}" ]; then
	fail "direct error-status writes found — every error must go through ${SEAM_PKG}:"
	echo "${direct_writes}" | sed 's/^/    /'
else
	echo "  ok — no direct error-status writes"
fi

# ---------------------------------------------------------------------------
# 2. Downstream prose reaching the client (FS-0001 §Requirements 9)
#
# apperr.WithDetail publishes its string. Passing err.Error() or st.Message()
# reopens the exact leak this feature closed — an internal address, a table
# name, a Stripe customer id.
#
# LIMITATION, stated rather than hidden: this matches the known-bad SHAPES
# (.Error() / .Message() inside a WithDetail call) rather than proving the
# argument is a literal. Proving that needs a Go AST pass; if this gate ever
# misses a real leak, that is the upgrade, not a wider grep.
# ---------------------------------------------------------------------------
echo "→ checking WithDetail calls carry authored text only"

leaky_detail=$(grep -rn -A2 'WithDetail(' --include='*.go' "${SCAN_ROOT}" 2>/dev/null |
	grep -E '\.Error\(\)|\.Message\(\)' |
	grep -v '_test\.go' || true)

if [ -n "${leaky_detail}" ]; then
	fail "WithDetail is carrying a downstream message to the client:"
	echo "${leaky_detail}" | sed 's/^/    /'
else
	echo "  ok — WithDetail carries authored text only"
fi

# ---------------------------------------------------------------------------
# 3. Unrecorded toolchain movement
#
# A bare `go get` raises the module's language version to whatever the fetched
# dependency wants. During I-0005 that silently took the workspace from 1.24.2
# to 1.25.0 inside a commit about error handling, raising the floor for all
# eleven modules. Nothing failed; the suite was green.
# ---------------------------------------------------------------------------
echo "→ checking the go directive against ${LOCK_FILE}"

if [ ! -f "${LOCK_FILE}" ]; then
	fail "no ${LOCK_FILE} — the expected go directive must be recorded, not inferred"
else
	expected=$(tr -d '[:space:]' <"${LOCK_FILE}")
	drifted=""

	for f in "${WORKSPACE_ROOT}"/go.work "${WORKSPACE_ROOT}"/*/go.mod; do
		[ -f "${f}" ] || continue
		actual=$(awk '/^go /{print $2; exit}' "${f}")
		[ -z "${actual}" ] && continue
		if [ "${actual}" != "${expected}" ]; then
			drifted="${drifted}\n    ${f}: ${actual} (expected ${expected})"
		fi
	done

	if [ -n "${drifted}" ]; then
		fail "go directive moved without updating ${LOCK_FILE}:"
		printf "%b\n" "${drifted}"
		echo "    If the bump is intended, change the lock file in the same commit."
	else
		echo "  ok — go directive is ${expected} everywhere"
	fi
fi

# ---------------------------------------------------------------------------
echo
if [ "${failures}" -ne 0 ]; then
	echo "seam gate FAILED (${failures} check(s))"
	exit 1
fi
echo "✅ seam gate passed"
