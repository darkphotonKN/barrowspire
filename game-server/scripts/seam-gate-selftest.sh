#!/usr/bin/env bash
#
# seam-gate-selftest.sh — proves check-seam.sh can still fail.
#
# A gate that cannot distinguish "passed" from "did not run" emits a green check
# either way, which is worse than no gate because it is trusted. This runs the
# gate against fixtures that violate each rule and asserts it REJECTS them, then
# against the real tree and asserts it accepts.
#
# It runs in CI, not by hand, because a fixture nobody executes is documentation.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

failures=0

expect_rc() {
	local want=$1 label=$2
	shift 2
	local out
	out=$("$@" 2>&1)
	local got=$?
	if [ "${got}" -ne "${want}" ]; then
		echo "❌ ${label}: expected rc=${want}, got rc=${got}"
		echo "${out}" | sed 's/^/    /'
		failures=$((failures + 1))
	else
		echo "  ok — ${label} (rc=${got})"
	fi
}

echo "→ the gate must REJECT known-bad input"
expect_rc 1 "violating fixtures are rejected" \
	./scripts/check-seam.sh contract-fixtures/seam-violations contract-fixtures/toolchain-drift

echo "→ the gate must ACCEPT the real tree"
expect_rc 0 "current tree passes" ./scripts/check-seam.sh

echo
if [ "${failures}" -ne 0 ]; then
	echo "seam gate selftest FAILED — the gate is not trustworthy"
	exit 1
fi
echo "✅ seam gate selftest passed — the gate has been observed rejecting and accepting"
