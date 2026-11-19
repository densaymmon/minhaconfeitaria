---
name: systematic-debugging
description: Structured 4-phase debugging methodology. Use when encountering any bug, test failure, unexpected behavior, or pipeline error — before proposing fixes. Enforces root cause investigation first.
version: 1.0.0
allowed-tools: Read, Grep, Glob, Bash
---

# Systematic Debugging

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** ALWAYS find root cause before attempting fixes.

## When to Use

Use for ANY technical issue: test failures, unexpected behavior, pipeline errors, build failures, Galaxy workflow errors, notebook exceptions, environment issues.

**Use ESPECIALLY when:**
- "Just one quick fix" seems obvious
- You've already tried multiple fixes
- Previous fix didn't work
- You don't fully understand the issue

## Supporting Files

- **[root-cause-tracing.md](root-cause-tracing.md)** - Trace bugs backward through call chain to find the original trigger. Instrumentation techniques, stack trace analysis.
- **[defense-in-depth.md](defense-in-depth.md)** - Add validation at multiple layers after finding root cause. Entry point, business logic, environment guards, debug logging.

## The Four Phases

Complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read error messages carefully**
   - Don't skip past errors or warnings — they often contain the solution
   - Read stack traces completely
   - Note line numbers, file paths, error codes

2. **Reproduce consistently**
   - Can you trigger it reliably? What are the exact steps?
   - If not reproducible, gather more data — don't guess

3. **Check recent changes**
   - Git diff, recent commits, new dependencies
   - Config changes, environmental differences

4. **Gather evidence in multi-component systems**
   - For pipelines (Galaxy workflow → tool → data), log what enters and exits each component
   - Run once with diagnostics to see WHERE it breaks
   - Then investigate that specific component

5. **Trace data flow**
   - Where does the bad value originate? (See [root-cause-tracing.md](root-cause-tracing.md))
   - Keep tracing up the call chain until you find the source
   - Fix at source, not at symptom

### Phase 2: Pattern Analysis

1. **Find working examples** — similar working code in same codebase
2. **Compare against references** — read reference implementation completely, don't skim
3. **Identify differences** — list every difference, however small
4. **Understand dependencies** — settings, config, environment, assumptions

### Phase 3: Hypothesis and Testing

1. **Form single hypothesis** — "I think X is the root cause because Y"
2. **Test minimally** — smallest possible change, one variable at a time
3. **Verify** — did it work? If not, form NEW hypothesis. Don't pile fixes on top.
4. **When you don't know** — say so. Don't pretend. Research more.

### Phase 4: Implementation

1. **Create failing test/reproduction** — simplest possible, automated if possible
2. **Implement single fix** — address root cause, ONE change, no "while I'm here" improvements
3. **Verify fix** — test passes? No other tests broken? Issue resolved?
4. **If fix doesn't work:**
   - Count fixes attempted
   - If < 3: return to Phase 1, re-analyze with new information
   - **If >= 3: STOP — question the architecture** (see below)

### When 3+ Fixes Fail

Pattern indicating architectural problem:
- Each fix reveals new issues in different places
- Fixes require "massive refactoring"
- Each fix creates new symptoms elsewhere

**STOP and discuss with the user before attempting more fixes.** This is not a failed hypothesis — it's a wrong approach.

## Red Flags — STOP and Return to Phase 1

If you catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- Proposing solutions before tracing data flow
- "One more fix attempt" when already tried 2+

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Issue is simple, don't need process" | Simple issues have root causes too |
| "Emergency, no time for process" | Systematic is FASTER than guess-and-check |
| "Just try this first, then investigate" | First fix sets the pattern. Do it right. |
| "Multiple fixes at once saves time" | Can't isolate what worked. Causes new bugs. |
| "I see the problem, let me fix it" | Seeing symptoms != understanding root cause |


## Check recorded metadata before building a statistical test

Before designing tests to **infer** whether a process was applied, look for a field that
**records its outcome**. Inference from derived measurements is slower, weaker and more
confoundable than reading a state column.

Worked case. The question was whether 63 haplotypes carrying pre/post values had really been
curated. Three signatures were designed (change magnitude, direction, scaffold-count), one
confound was found and stratified away, and the result was ambiguous. Then one metadata column
-- `Secondary haplotype level` -- answered it with **perfect separation**: 0 of 63 at
chromosome level against 193 of 193 for the known-curated controls. No statistics needed.

**The tell** that you are in this situation: you are reasoning about whether a *process* ran,
rather than about the size of an effect. Processes usually leave a recorded state somewhere --
an assembly level, a stage flag, a file in a pipeline directory, a tool version.

Ask, in this order:
1. Is there a column, flag or path that records the outcome directly?
2. Does a controlled subset exist where the answer is known, so the signature can be calibrated?
3. Only then: design the inferential test.

## Quick Reference

| Phase | Key Activities | Done when |
|-------|---------------|-----------|
| 1. Root Cause | Read errors, reproduce, check changes, trace data | Understand WHAT and WHY |
| 2. Pattern | Find working examples, compare | Differences identified |
| 3. Hypothesis | Form theory, test minimally | Confirmed or new hypothesis |
| 4. Implementation | Create test, fix, verify | Bug resolved, tests pass |

## Attribution

Adapted from [obra/superpowers](https://github.com/obra/superpowers/) systematic-debugging skill.

## A filter that silently matches nothing

When a boolean filter built with `groupby(...).agg(lambda ...)` removes far more rows than
expected, suspect the lambda before the data.

```python
# WRONG -- returned False for every group and dropped the whole arm (388 rows, not 20)
paired = df[mask].groupby("id").col.agg(lambda v: {"a", "b"} <= set(v))
drop = mask & ~df.id.map(paired).fillna(False)

# RIGHT -- explicit, and obviously correct on inspection
have_a = set(df.loc[mask & (df.col == "a"), "id"])
have_b = set(df.loc[mask & (df.col == "b"), "id"])
drop = mask & ~df.id.isin(have_a & have_b)
```

The failure was silent at the filter and surfaced far downstream as
`IndexError: index -1 is out of bounds for axis 0 with size 0` inside a percentile call on the
now-empty group. **The traceback pointed at plotting code; the bug was in data selection
several hundred lines earlier.**

Two habits that catch this class in one step:

- **Print what every filter removes, with the expected number beside it.** `print(f"dropped
  {drop.sum()} rows")` next to a filter you believe should drop 20 turns a silent corruption
  into a visible one. The message read "dropped 388" and the bug was obvious before the
  traceback appeared.
- **Prefer set operations over `agg` returning a scalar** when the predicate is about which
  values a group contains. `agg` has to guess whether your callable is a reduction, and a
  callable returning a plain `bool` is exactly the ambiguous case.
