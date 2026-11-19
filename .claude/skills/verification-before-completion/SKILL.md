---
name: verification-before-completion
description: Enforces evidence-based completion claims. Use before claiming work is done, tests pass, or bugs are fixed. Requires running verification commands and confirming output before any success claims.
version: 1.0.0
allowed-tools: Read, Grep, Glob, Bash
---

# Verification Before Completion

## Overview

**Core principle:** Evidence before claims, always.

## The Gate

```
BEFORE claiming any status:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the command (fresh, complete)
3. READ: Full output, check exit code
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim
```

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check |
| Build succeeds | Build command: exit 0 | "Looks good" |
| Bug fixed | Original symptom: gone | Code changed, assumed fixed |
| Pipeline complete | Output files exist and are valid | Tool reported success |
| Notebook runs | All cells executed without error | Some cells ran |

## Red Flags — STOP

If you catch yourself:
- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Done!")
- About to commit without running tests
- Relying on partial verification
- Trusting a tool's success report without checking output

## Before Asserting an Invariant

An invariant that looks physically necessary may be domain-legitimate. Confirm with the
data owner **before** writing a repair, not after.

```
CORRECT: [find rows violating X] → [ask: can X legitimately be violated?]
         → [confirmed impossible] → repair
WRONG:   [find rows violating X] → "physically impossible" → repair
```

### Real case

`total_contig_length > total_length` was declared impossible and 31 rows were "repaired"
against it. It is legitimate: contig statistics are computed **before** duplication
purging, so a purged assembly carries a contig total larger than its final scaffold total.
The repair destroyed 31 authoritative freeze values and had to be reverted.

The same episode produced a second, worse error: `gaps` was back-filled from an older
dataset generation, which assigned the gap counts of *pre-purge* assemblies to *post-purge*
ones. Plausible-looking numbers, wrong entity.

### Two rules

1. **Never back-fill a derived value from an older dataset generation.** Those values
   describe a different version of the entity. If a value is not computable from current
   inputs, it is **NA** — not a number borrowed from history.
2. **A repair that invents values is worse than a gap.** NA propagates honestly through
   every downstream statistic; a fabricated value does not.

If an invariant genuinely holds, encode it as an assertion in the pipeline so violations
surface at write time rather than during analysis months later.

### When the domain expert contradicts you, investigate — don't just concede

Twice in one session a correction from the data owner ("there shouldn't be a difference",
"Single curation means curated separately") pointed at a real defect that the surface
explanation had been hiding. Both times the available explanation was *plausible* and
*wrong*, and it came from an authoritative-looking source — a README, and my own earlier
analysis.

Conceding politely would have left both defects in place. The correct response is to re-open
the investigation with the expert's constraint as a fixed point, and follow it to a
mechanism. "You're right, I'll change it" is not the same as finding out why they were right.

## Rationalizations

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence != evidence |
| "Just this once" | No exceptions |
| "Tool said success" | Verify independently |
| "Partial check is enough" | Partial proves nothing |

## Key Patterns

**Tests:**
```
CORRECT: [Run test] → [See: 34/34 pass] → "All tests pass"
WRONG:   "Should pass now" / "Looks correct"
```

**Pipeline output:**
```
CORRECT: [Check output file exists] → [Verify size/format] → "Pipeline produced valid output"
WRONG:   "Galaxy shows green" (without checking actual data)
```

**Notebook:**
```
CORRECT: [Restart kernel] → [Run All] → [Check no errors] → "Notebook runs cleanly"
WRONG:   "I updated the cell" (without re-running)
```

**New extraction pipeline (before an expensive or irreversible run):**
```
CORRECT: [Pick a case whose answer already exists] → [Run the new pipeline on it]
         → [Compare field by field] → "11/12 match byte-exact; the 12th is a count
            off by one, N50 unaffected" → THEN launch the full sweep
WRONG:   "Validated" / "Spot-checked and it looks right"
```

Pilot against known values first. Report the comparison field by field, and state what
did *not* match rather than rounding it away — a single mismatched field is often the
one that reveals the semantics differ. A pipeline that costs hours and hundreds of GB
deserves a five-minute pilot.

## The Bottom Line

Run the command. Read the output. THEN claim the result.

## Attribution

Adapted from [obra/superpowers](https://github.com/obra/superpowers/) verification-before-completion skill.
