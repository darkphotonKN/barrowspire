# Contract gate fixtures

Known-bad inputs that the contract gates **must reject**. They are the gates' own
regression test.

A ruleset or an allowlist is unverified config until it has rejected something. A gate that
cannot distinguish *passed* from *did not run* emits a green check either way — which is
worse than having no gate, because it is trusted. These files are what make the green
checks mean something.

> **These fixtures are part of the contract layer, not scaffolding to delete.** They are
> copied into a repo alongside the gate config (`/.spectral.yaml`, `/.oasdiff-ignore`) —
> without them the config arrives unverified, and stays that way until someone happens to
> break something for real.

**Run them once, right after adoption.** Gate config copied into a fresh repo is unproven
by construction: the regenerate, breaking-change, and client-staleness gates cannot fire
until that repo has its first serialized endpoint. These fixtures are what make the gates
verifiable *before* then.

## What is here

| File | Purpose | Expected |
|---|---|---|
| `spectral-bad.yaml` | a spec violating three custom rules at once | Spectral **rc=1**, 3 errors |
| `oasdiff-base.yaml` + `oasdiff-rev.yaml` | a deliberate breaking change (required response property removed) | oasdiff **rc=1** |
| `oasdiff-allowlist.txt` | worked example of a *correct* allowlist entry | same diff, **rc=0** |

`oasdiff-allowlist.txt` does double duty: it is the fixture's expected-pass file **and** the
reference for the entry format, which is easy to get wrong (see below).

## Running them

From the repo root, with oasdiff installed by the edge service's Makefile
(`make -C api-gateway .tools/oasdiff`):

```bash
# 1. Spectral must REJECT the known-bad spec.
npx --yes @stoplight/spectral-cli@6 lint --ruleset .spectral.yaml \
  contract-fixtures/spectral-bad.yaml            # expect rc=1, 3 errors

# 2. oasdiff must REJECT an unallowlisted break.
api-gateway/.tools/oasdiff breaking \
  contract-fixtures/oasdiff-base.yaml contract-fixtures/oasdiff-rev.yaml \
  --fail-on ERR                                  # expect rc=1

# 3. The same break, allowlisted, must PASS.
api-gateway/.tools/oasdiff breaking \
  contract-fixtures/oasdiff-base.yaml contract-fixtures/oasdiff-rev.yaml \
  --err-ignore contract-fixtures/oasdiff-allowlist.txt --fail-on ERR   # expect rc=0
```

**Assert on the exit code, not the output.** Reading output is how the false greens in this
repo's own history got through.

## Why step 3 exists

The allowlist format is not what oasdiff's output suggests. Pasting the printed message —
which is what `.oasdiff-ignore` originally instructed — suppresses **nothing**, and the
gate stays red with no explanation. An ignore line must contain the **method, the path, and
the message**, lowercased, on one line. Step 3 is the standing proof that the documented
format still works; if oasdiff changes its matching, this is what tells you.

## Known gap (deliberate)

This is the **minimum viable** set: one Spectral fixture covering three rules, one oasdiff
pair. Optional hardening, deferred rather than forgotten:

- a per-rule fixture suite, so a single rule silently breaking is caught (today, one fixture
  covering three rules can still pass on two of them if the third fires)
- a `make gates-selftest` target running all of the above and asserting exit codes, wired
  into CI so the fixtures are exercised on every run rather than by hand

Until that target exists these are run manually — which means they verify the gates at
adoption time, not continuously.
