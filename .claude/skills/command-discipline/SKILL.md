---
name: command-discipline
description: Run shell commands bare — no decorative echo headers ("=== X ==="), no echo-then-cmd chains, no trailing "echo done". Use the Bash tool's description field for any narration. Triggers any time you're about to issue a Bash command.
version: 0.1.0
---

# Command Discipline

When you run a shell command, run it directly. No decoration, no chained echos, no preamble.

## What to stop doing

```bash
# WRONG — decorative header before the real command
echo "=== running tests ===" && planemo test workflow.ga

# WRONG — narration-by-echo
echo "Checking workflow lint" && planemo workflow_lint --iwc .

# WRONG — trailing status echo
planemo test workflow.ga && echo "tests passed"

# WRONG — semicolon variant of the same
echo "=== before ===" ; ls test-data/
```

## What to do instead

```bash
# RIGHT — bare command, narration in the Bash tool's description field
planemo test workflow.ga
planemo workflow_lint --iwc .
ls test-data/
```

If you want the user to know what step you're running, put that text in the **Bash tool `description` parameter**. The user sees it in the tool-call panel. It does not need to be inside the shell command.

## Why

1. **The user already sees the command** — both in the tool-call panel and in the description field. The leading `echo "=== X ==="` is redundant noise that pushes the real command later in the line.
2. **It breaks permission-rule auto-approval.** Permission rules typically match commands by what the first segment starts with (`Bash(planemo workflow_lint *)`). When you prefix with `echo "..." && ...`, the first segment is the echo, which usually isn't covered by the same allow rule, so the user gets prompted unnecessarily.
3. **Trailing `&& echo done` adds nothing.** The Bash tool already reports exit code and the absence of an error message is itself the "done" signal.
4. **It looks like a tutorial blog post.** You're not writing shell tutorials; you're executing one command per tool call. Pretend the panel headings don't exist and just run the thing.

## Legitimate echo uses (do NOT avoid these)

These are real uses of `echo`, not decoration:

```bash
echo "$VAR"                       # printing a value
echo "$(date -u +%Y-%m-%d)"       # capturing a value
echo "line of data" >> log.txt    # generating content
echo "stdin payload" | python -   # piping data into a program
```

The rule blocks **echo-as-narration**, not echo-as-data-flow.

## Edge cases worth keeping

- `[ -f file ] && echo "exists"` — quick existence probe. Fine when the echo IS the result you wanted to see. Prefer `ls file 2>/dev/null; echo "rc=$?"` only if you actually need the rc.
- `cmd1 && cmd2` chains where neither cmd is echo — totally fine; the rule is specifically about echo decoration.

## When in doubt

Ask: "If I removed this echo, would the user lose any information they wouldn't already see?" If no, remove it.
