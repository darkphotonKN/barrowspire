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
# Rule (FS-8TCN2 slice 2): so may a non-neutral rgb()/rgba() literal. The hex
# check alone let about 150 palette triples survive outside :root, where a
# palette change never reached them. Neutral black and white (0,0,0 and
# 255,255,255) may stay literal: they are shadow and highlight, not palette.
# Neutrals are stripped from a copy of each line first, so a line carrying a
# neutral and a palette triple together is still caught.
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

hex=$(printf '%s\n' "${body}" | grep -E '#[0-9a-fA-F]{3}' || true)

# POSIX ERE only (no \b, no {n,m}, no lookahead): BSD awk must run it.
rgb=$(printf '%s\n' "${body}" | awk '
  {
    line = $0
    gsub(/rgba?\([[:space:]]*(0[[:space:],]+0[[:space:],]+0|255[[:space:],]+255[[:space:],]+255)[[:space:],)\/]/, "", line)
    if (line ~ /rgba?\([[:space:]]*[0-9]/) print $0
  }
')

violations=$(printf '%s\n%s\n' "${hex}" "${rgb}" | grep -v '^$' | sort -t: -k1,1n -u || true)

if [[ -n "${violations}" ]]; then
	printf '  %s\n' "${target}"
	printf '%s\n' "${violations}" | sed 's/^/    /'
	exit 1
fi
exit 0
