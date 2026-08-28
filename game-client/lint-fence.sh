#!/usr/bin/env bash
#
# lint-fence.sh — proves the "no hand-written fetch" rule can still reject.
#
# A gate nobody has watched fail emits a green check either way, which is worse
# than no gate because it is trusted. This runs the rule against a fixture that
# violates it and asserts a REJECTION, then against the real tree and asserts a
# pass.
#
# Output is captured before grepping, deliberately: `next lint` exits non-zero
# when it finds errors, so piping it straight into grep under `set -o pipefail`
# reports failure even when the grep matched — which made this script claim the
# fence was broken while the fence was working.
set -uo pipefail

cd "$(dirname "$0")" || exit 1

echo "→ the fence must REJECT a hand-written fetch"
out=$(npx next lint --file lint-fixtures/hand-fetch.ts 2>&1)
if printf '%s' "${out}" | grep -q 'no-restricted-syntax'; then
	echo "  ok — fixture rejected"
else
	echo "❌ the fence did NOT reject lint-fixtures/hand-fetch.ts — it enforces nothing"
	printf '%s\n' "${out}" | sed 's/^/    /'
	exit 1
fi

echo "→ the token fence must REJECT a raw hex in TS/TSX (ADR-0013)"
out=$(npx next lint --file lint-fixtures/raw-hex.tsx 2>&1)
if printf '%s' "${out}" | grep -q 'no-restricted-syntax'; then
	echo "  ok — fixture rejected"
else
	echo "❌ the fence did NOT reject lint-fixtures/raw-hex.tsx — it enforces nothing"
	printf '%s\n' "${out}" | sed 's/^/    /'
	exit 1
fi

echo "→ the token fence must REJECT a raw hex in CSS outside :root (ADR-0013)"
if ./scripts-check-css-tokens.sh lint-fixtures/raw-hex-css.css >/dev/null 2>&1; then
	echo "❌ the CSS fence did NOT reject lint-fixtures/raw-hex-css.css — it enforces nothing"
	echo "    (BSD awk supports neither \\b nor {n,m}; a pattern using them matches nothing"
	echo "     and this check reports green over every violation.)"
	exit 1
fi
echo "  ok — fixture rejected"

echo "→ the CSS token fence must ACCEPT globals.css"
if ! out=$(./scripts-check-css-tokens.sh src/app/globals.css 2>&1); then
	echo "❌ globals.css carries a raw hex outside :root:"
	printf '%s\n' "${out}" | sed 's/^/    /'
	exit 1
fi
echo "  ok — globals.css passes"

echo "→ the fence must ACCEPT the real tree"
out=$(npx next lint 2>&1)
if printf '%s' "${out}" | grep -q 'no-restricted-syntax'; then
	echo "❌ the tree contains a banned fetch:"
	printf '%s\n' "${out}" | grep -B2 'no-restricted-syntax' | sed 's/^/    /'
	exit 1
fi
echo "  ok — tree passes"

echo
echo "→ scope of the token fence (ADR-0013)"
# The perimeter must be stated, not assumed. FS-0004 cleaned the DOM surface;
# the Phaser canvas layer is FS-0005 and is NOT yet inside the fence. Printing
# the gap is the difference between "scoped" and "quietly exempted" — a green
# check here means the DOM surface is clean, not that the tree is.
uncovered=$(grep -rlE "0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}" \
	src/scenes src/ui src/game src/utils/spriteGenerator.ts \
	src/utils/gameStateLogger.ts src/utils/class/SocketManager.ts 2>/dev/null | sort -u)
n=$(printf '%s\n' "${uncovered}" | grep -c . || true)
echo "  covered:   src/app, src/components, and every other .ts/.tsx — 0 violations"
echo "  NOT yet covered: ${n} files in the Phaser canvas layer (FS-0005 widens the fence)"
printf '%s\n' "${uncovered}" | sed 's/^/    · /'

echo
echo "✅ lint fences verified — each observed rejecting AND accepting"
