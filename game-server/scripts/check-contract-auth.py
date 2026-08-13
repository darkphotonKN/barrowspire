#!/usr/bin/env python3
"""An operation that RUNS auth middleware must DECLARE that it needs auth.

If it does not, the contract says the operation is public and it then answers
401: the docs render no padlock, the try-it console offers nowhere to put a
token, and a generated client has no idea auth exists. The operation is listed
but not usable.

Checked against the Go source, not the generated document. An earlier version of
this script inferred "needs auth" from the presence of a 401 response and was
wrong on its first run: sign-in answers 401 for bad credentials while requiring
no token at all. Documenting a 401 and requiring authentication are different
claims, and only the source knows which is which — the middleware is the fact.
"""
import sys, re, pathlib, glob

roots = sys.argv[1:] or ["api-gateway/internal/gateway"]
files = [f for r in roots for f in glob.glob(f"{r}/*/typed.go")]
if not files:
    print(f"SKIPPED: no typed.go under {roots}")
    sys.exit(0)

bad, total, secured = [], 0, 0
for f in files:
    src = pathlib.Path(f).read_text()
    # Each huma.Operation{...} literal, matched to its closing brace at the
    # literal's own indentation.
    for m in re.finditer(r"huma\.Operation\{(.*?)\n\t\}", src, re.S):
        block = m.group(1)
        total += 1
        has_mw = "Middlewares:" in block
        has_sec = "Security:" in block
        if has_sec:
            secured += 1
        if has_mw and not has_sec:
            op = re.search(r'OperationID:\s*"([^"]+)"', block)
            bad.append((f, op.group(1) if op else "?"))

print(f"→ checking {total} operations declare auth where they enforce it")
if bad:
    print("❌ operations run auth middleware but declare no security scheme:")
    for f, op in bad:
        print(f"    {op}  ({f})")
    print("    Add Security next to Middlewares — otherwise the contract calls it public.")
    sys.exit(1)
print(f"  ok — {secured} secured, {total - secured} public, none inconsistent")
