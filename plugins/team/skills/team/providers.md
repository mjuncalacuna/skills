# Other providers

The default team is all Claude. You can hand a role to another model through its CLI, run from Bash. The commands below are the ones tested so far; any CLI with a non-interactive mode fits the same way.

The rules don't change with the provider: the brief has to stand on its own, you verify the result before trusting it, and you check every finding before acting on it.

## Codex (OpenAI) as a worker

Useful when you want a different model writing the code and Claude judging it.

Write the brief to a file outside the repo (`/tmp/team-brief-1.md`) with the same contents as a worker brief, plus: no commits, no pushes, no new dependencies without saying so. Then, from the repo root:

```bash
codex exec -s workspace-write -C "$(git rev-parse --show-toplevel)" \
  -o /tmp/team-result-1.md "$(cat /tmp/team-brief-1.md)" \
  < /dev/null > /tmp/team-trace-1.log 2>&1
```

- `< /dev/null` matters: without it, in the background Codex hangs on "Reading additional input from stdin…".
- `-o` keeps only Codex's final message; the full trace goes to the log.
- The `workspace-write` sandbox only writes inside the repo and has no network, so install dependencies before handing the task over.
- It takes minutes: run it in the background or with a long timeout.
- Tasks with different files can run in parallel; tasks that share files, one after another.
- Read the result, `git status --short` and `git diff --stat` before moving on. If it failed, read the trace, rewrite the brief and relaunch once.

## A second reviewer from another provider

Run it alongside the Claude reviewer when the change is risky. Write the review brief (the plan, what to look for, the answer format) to `/tmp/team-review.md`, and paste the diff into it: don't count on the other CLI being able to run git.

Codex, read-only:

```bash
codex exec -s read-only -C "$(git rev-parse --show-toplevel)" \
  -o /tmp/team-review-codex.md - < /tmp/team-review.md > /tmp/team-review-codex.log 2>&1
cat /tmp/team-review-codex.md
```

If the result file is missing, read the log (not logged in, sandbox error…).

Grok, in plan mode so it can read the disk but not write:

```bash
grok --cwd "$(git rev-parse --show-toplevel)" --prompt-file /tmp/team-review.md \
  --output-format plain --permission-mode plan
```

If Grok answers "Not signed in", the user has to run `grok login` in an interactive terminal.

Treat their findings like the Claude reviewer's: check each one before acting. When two different models report the same issue, it's more likely to be real.
