#!/usr/bin/env bash
#
# The CSS half of the ADR-0013 token fence.
#
# `next lint` is ESLint over TS/TSX. It reaches inline style objects, template
# literals and styled-jsx, but it cannot see a .css file at all — and the
# largest single pocket of off-palette colour in this repo lived in
# globals.css. A fence that only covered TS/TSX would report green over it.
#
# Rule: a raw hex may appear ONLY inside the :root block of globals.css.
# Everything else refers to a token.
#
# Uses grep -E rather than awk regex: BSD awk (the macOS default) supports
# neither \b nor {n,m} intervals, and silently matched nothing when this was
# written with them — the fixture passed. Hence the fence-must-reject test.
set -uo pipefail
cd "$(dirname "$0")" || exit 1

target="${1:-src/app/globals.css}"

body=$(awk '
  /^:root[[:space:]]*\{/ { inroot=1; print ""; next }
  inroot && /^\}/        { inroot=0; print ""; next }
  inroot                 { print ""; next }
                         { print FNR": "$0 }
' "${target}")

violations=$(printf '%s\n' "${body}" | grep -E '#[0-9a-fA-F]{3}' || true)

if [[ -n "${violations}" ]]; then
	printf '  %s\n' "${target}"
	printf '%s\n' "${violations}" | sed 's/^/    /'
	exit 1
fi
exit 0
