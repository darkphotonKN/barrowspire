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

echo "→ the fence must ACCEPT the real tree"
out=$(npx next lint 2>&1)
if printf '%s' "${out}" | grep -q 'no-restricted-syntax'; then
	echo "❌ the tree contains a banned fetch:"
	printf '%s\n' "${out}" | grep -B2 'no-restricted-syntax' | sed 's/^/    /'
	exit 1
fi
echo "  ok — tree passes"

echo
echo "✅ lint fence verified — observed rejecting and accepting"
