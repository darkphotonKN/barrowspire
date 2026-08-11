---
id: I-0007
status: open
implements: FS-0001
blocked_by: [I-0002, I-0003, I-0004, I-0005, I-0006]
labels: [ready-for-agent]
title: "FS-0001 slice 7: CI gate rejecting direct 4xx/5xx writes, plus the fixture that proves it"
---
Implements FS-0001 §Requirements

## What to Build

A CI check that greps `game-server/api-gateway` for direct 4xx/5xx status writes outside the
seam package and **fails the build** on any hit (FS-0001 §Requirements 13).

The gate exists because 90 examples of the old pattern are in git history for anyone to copy
from, and review alone has never reliably caught a one-line `c.JSON(http.StatusBadRequest, …)`.

**Scope is `api-gateway` only.** `game-service`'s 8 error writes are deliberately out of scope
(FS-0001 §Out of Scope) — a wider pattern would be red the day it merges, and a gate that is red
on arrival gets disabled rather than obeyed.

**The gate must be proven, not assumed** (FS-0001 §Requirements 14). Add a fixture that
reintroduces one direct write and demonstrate the gate **exits non-zero** on it. This mirrors
the existing `contract-fixtures/` discipline the repo already uses for the Spectral and oasdiff
gates: a gate that has never been observed rejecting anything is unverified configuration, not
enforcement.

Wire it alongside the existing contract gates rather than as a separate workflow — the repo
already has `.github/workflows/contract.yml` and a `gates` target in
`game-server/api-gateway/Makefile`.

### Two more patterns the gate must reject

Both were found by code review during slices 1–2, and both are rules that
currently exist only as doc comments. An unenforced rule across 83 remaining
hand-migrations is a rule that gets broken.

**1. `httperr.Write` not followed by `return`.** `Write` aborts the middleware
chain but does NOT stop the current function — Go has no such thing. A missing
`return` means execution continues after the response is already on the wire, and
whatever runs next operates on the state that just failed. This is the realistic
trigger for the panic-after-response case fixed in `recovery.go`.

**2. `apperr.WithDetail` with a non-literal second argument.** `WithDetail`
publishes its string to the client. Its doc comment says "pass only strings you
wrote as literals", because `WithDetail(err, err.Error())` or
`WithDetail(err, st.Message())` reopens exactly the downstream-leak that
§Requirements 9 exists to close. Reject any call whose second argument is not a
string literal.

## Acceptance Criteria

- [ ] The check greps `game-server/api-gateway` for direct 4xx/5xx writes outside the seam package
- [ ] It returns **zero hits** against the current tree — all 90 writes are migrated by now
- [ ] It exits non-zero on any hit
- [ ] A fixture reintroducing one direct write makes the gate **go red — demonstrated in the PR, with the failing output pasted**, not asserted
- [ ] The fixture does not break the normal build or test run
- [ ] The seam package itself is exempt (it is the one legitimate writer) and the exemption is narrow enough that moving the seam does not silently disable the gate
- [ ] `game-service` is not matched by the pattern
- [ ] The check runs in CI, not only locally

## Blocked By

I-0002, I-0003, I-0004, I-0005, I-0006 — every migration slice. The gate is red until the last
direct write is gone, so it lands after them by construction.

## Spec Reference

FS-0001 §Requirements 13, 14, §Acceptance Criteria (zero grep hits; fixture goes red). Covers
user stories 8, 9.

## Merge Policy

Land on `feat/fs-0001-error-contract`, not main. See I-0008.

## TDD Approach

- RED: run the gate against a tree with one reintroduced direct write — must exit non-zero
- GREEN: run against the migrated tree — must exit zero
- Both runs recorded in the PR; this gate's own test IS the fixture
