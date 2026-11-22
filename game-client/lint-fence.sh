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

echo "→ the token fence must REJECT a numeric 0xRRGGBB in the canvas render layer (ADR-0013, FS-SRA9J)"
out=$(npx next lint --file lint-fixtures/raw-hex-num.ts 2>&1)
if printf '%s' "${out}" | grep -q 'no-restricted-syntax'; then
	echo "  ok: fixture rejected"
else
	echo "❌ the fence did NOT reject lint-fixtures/raw-hex-num.ts: render-layer 0x literals pass unchecked"
	printf '%s\n' "${out}" | sed 's/^/    /'
	exit 1
fi

echo "→ the token fence must REJECT a non-neutral rgba() in TS/TSX (ADR-0013, FS-8TCN2)"
out=$(npx next lint --file lint-fixtures/raw-rgba.tsx 2>&1)
if printf '%s' "${out}" | grep -q 'no-restricted-syntax'; then
	echo "  ok: fixture rejected"
else
	echo "❌ the fence did NOT reject lint-fixtures/raw-rgba.tsx: palette triples pass unchecked"
	printf '%s\n' "${out}" | sed 's/^/    /'
	exit 1
fi

# The structural fences that replaced source-scanning tests: each fixture must be rejected with its
# rule's own words, so a fixture that trips some other rule does not pass for this one.
must_reject() { # fixture, expected message fragment, what it proves
	local out
	out=$(npx next lint --file "lint-fixtures/$1" 2>&1)
	if printf '%s' "${out}" | grep -qF -- "$2"; then
		echo "  ok: $1 rejected"
	else
		echo "❌ the fence did NOT reject lint-fixtures/$1: $3"
		printf '%s\n' "${out}" | sed 's/^/    /'
		exit 1
	fi
}

echo "→ the motion fence must REJECT Back/Elastic easing in an effect, a camera shake and an explode (FS-KYPQ9 §B.3, §B.5, §B.6)"
must_reject banned-easing.ts "No Bounce, Elastic or Back easing" "silly easing passes unchecked"
must_reject camera-shake.ts "No camera shake" "a camera shake passes unchecked"
must_reject camera-shake.ts "No radial explode" "an explode passes unchecked"

echo "→ the cursor fence must REJECT an object's own cursor and a canvas cursor write (FS-KYPQ9 P7, P10)"
must_reject own-cursor.ts "a cursor of its own" "an object's own cursor passes unchecked"
must_reject own-cursor.ts "'setDefaultCursor' is restricted" "a second canvas cursor writer passes unchecked"

echo "→ the fire fence must REJECT fire's ramp outside the theme and the fire effects (ADR-0025)"
must_reject fire-token.ts "Fire's tokens" "fire's ramp leaks unchecked"

echo "→ the sound generators must stay seeded and Phaser-free (FS-AND39 R9)"
must_reject unseeded-sfx.ts "'Math.random' is restricted" "an unseeded draw passes unchecked"
must_reject unseeded-sfx.ts "'phaser' import is restricted" "a Phaser import passes unchecked"

echo "→ a world scene must REJECT building the UI scene's pieces (FS-TQZ5J)"
must_reject world-builds-ui.ts "The chat window is the UI scene's" "a world builds the UI scene's chat unchecked"
must_reject world-builds-ui.ts "'UiSounds' import from '@/audio/uiSounds' is restricted" "a world makes its own interface player unchecked"

echo "→ the interactable, nature and interior bake models must draw every colour from BARROW (ADR-0013)"
# the models are browser code the bake page serves, outside next lint's reach: grepped instead. The
# others mix colours through rgb("token") and are not in the fence.
FENCED_MODELS="tools/bake/page/models/interactables.js tools/bake/page/models/nature.js tools/bake/page/models/interior.js"
models=$(grep -lE '#[0-9a-fA-F]{3,8}([^0-9a-zA-Z_]|$)|0x[0-9a-fA-F]{6}([^0-9a-zA-Z_]|$)|rgba?\(' ${FENCED_MODELS} 2>/dev/null || true)
if printf 'const c = "#1c1613";\n' | grep -qE '#[0-9a-fA-F]{3,8}([^0-9a-zA-Z_]|$)'; then :; else
	echo "❌ the bake model pattern matches nothing: it enforces nothing"
	exit 1
fi
if [ -n "${models}" ]; then
	echo "❌ a bake model carries a colour literal:"
	printf '%s\n' "${models}" | sed 's/^/    /'
	exit 1
fi
echo "  ok: no colour literal in the fenced bake models"

echo "→ the token fence must REJECT a raw hex in CSS outside :root (ADR-0013)"
if ./scripts-check-css-tokens.sh lint-fixtures/raw-hex-css.css >/dev/null 2>&1; then
	echo "❌ the CSS fence did NOT reject lint-fixtures/raw-hex-css.css — it enforces nothing"
	echo "    (BSD awk supports neither \\b nor {n,m}; a pattern using them matches nothing"
	echo "     and this check reports green over every violation.)"
	exit 1
fi
echo "  ok — fixture rejected"

echo "→ the token fence must REJECT a non-neutral rgba() in CSS outside :root (ADR-0013, FS-8TCN2)"
if ./scripts-check-css-tokens.sh lint-fixtures/raw-rgba-css.css >/dev/null 2>&1; then
	echo "❌ the CSS fence did NOT reject lint-fixtures/raw-rgba-css.css: palette triples pass unchecked"
	exit 1
fi
echo "  ok: fixture rejected"

echo "→ the CSS token fence must ACCEPT globals.css"
if ! out=$(./scripts-check-css-tokens.sh src/app/globals.css 2>&1); then
	echo "❌ globals.css carries a raw hex or non-neutral rgba outside :root:"
	printf '%s\n' "${out}" | sed 's/^/    /'
	exit 1
fi
echo "  ok — globals.css passes"

echo "→ the fence must ACCEPT the real tree"
out=$(npx next lint 2>&1)
if printf '%s' "${out}" | grep -qE 'no-restricted-(syntax|properties|imports)'; then
	echo "❌ the tree breaks a fence:"
	printf '%s\n' "${out}" | grep -B2 -E 'no-restricted-(syntax|properties|imports)' | sed 's/^/    /'
	exit 1
fi
echo "  ok — tree passes"

echo
echo "→ scope of the token fence (ADR-0013)"
# The perimeter must be stated, not assumed. FS-SWMNW cleaned the DOM surface;
# the Phaser canvas layer is FS-W6BP1 and is NOT yet inside the fence. Printing
# the gap is the difference between "scoped" and "quietly exempted" — a green
# check here means the DOM surface is clean, not that the tree is.
uncovered=$(grep -rlE "0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}" \
	src/scenes src/ui src/game src/utils/spriteGenerator.ts \
	src/utils/gameStateLogger.ts src/utils/class/SocketManager.ts 2>/dev/null | sort -u)
n=$(printf '%s\n' "${uncovered}" | grep -c . || true)
echo "  covered:   src/app, src/components, and every other .ts/.tsx — 0 violations"
echo "  covered:   numeric 0xRRGGBB in src/render (tests aside), besides the string hex above"
echo "  NOT yet covered: ${n} files in the Phaser canvas layer (FS-W6BP1 widens the fence)"
printf '%s\n' "${uncovered}" | sed 's/^/    · /'

echo
echo "✅ lint fences verified — each observed rejecting AND accepting"
