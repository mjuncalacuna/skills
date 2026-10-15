# Workers as Orca agents

When this session runs in an [Orca](https://github.com/stablyai/orca) terminal (the `ORCA_PANE_KEY` environment variable is set), launch the workers and the reviewer as Orca workers instead of subagents. Each one then gets its own row in Orca's sidebar, so the user can watch them run and open any of them. If the user asks for subagents, use subagents.

Everything else in the skill stays the same: self-contained briefs, one set of files per worker, up to 4 at a time, verify before you trust, two review rounds at most. Orca's own guide is the source of truth for its commands: run `orca skills get orchestration` once before the first launch and follow it where it differs from this page.

## Launch the wave

```bash
orca status --json
orca orchestration run-create --objective "<the task, one line>" --json
orca orchestration worker-start --worktree current --agent claude --model sonnet --effort medium \
  --spec "<brief for part 1>" --json
orca orchestration worker-start --worktree current --agent claude --model sonnet --effort medium \
  --spec "<brief for part 2>" --json
```

- Start every independent part before you wait. Dependent parts go in a later wave.
- Write each spec with the five things Orca asks for, which are the same as a worker brief: **Target** (files in scope), **Change** (the result), **Constraints** (what must not break, no commits or pushes), **Ownership** (the only files it may edit) and **Observable acceptance** (the test or output that proves it's done).
- If `worker-start` exits non-zero, don't relaunch: read `failedStage` in its receipt and follow Orca's recovery guide.

## Wait for the results

```bash
orca orchestration check --wait --types "worker_done,escalation,question" --timeout-ms 540000 --json
```

Keep `--timeout-ms` under your Bash tool's time limit and give the command that limit (10 minutes). Then, for each message it returns:

- **question**: answer it with `orca orchestration reply --id <message_id> --body "<answer>" --json`.
- **worker_done**: verify the result as in step 3 of the skill (`git status --short`, `git diff --stat`, the tests). If it holds, `orca orchestration worker-release --dispatch <dispatch_id> --json`. If it doesn't, send the worker a follow-up with what you found instead of releasing it.
- Acknowledge and keep waiting: `orca orchestration check --ack <delivery_id> --wait --types "worker_done,escalation,question" --timeout-ms 540000 --json`.

A timeout or an empty result is a checkpoint, not a failure. After three empty waits, run `orca orchestration worker-list --json` and follow each row's `projection.nextAction`. You're done when `orca orchestration worker-list --terminal-state reclaimable --json` returns no rows.

## Review

Launch the reviewer the same way, after the workers are released:

```bash
orca orchestration worker-start --worktree current --agent claude --model opus --effort medium \
  --spec "Read-only review: do not edit, create or delete files. <review brief>" --json
```

Its `worker_done` carries the findings. Check each one before acting, as in step 5.

## Differences from subagents

- Each Orca worker is a full Claude Code session: it loads the repo's `CLAUDE.md` and the user's settings, and it stays open until you release it.
- The `team:worker` and `team:reviewer` agent definitions don't apply here: model and effort come from the `worker-start` flags, and "read-only" for the reviewer is an instruction in its spec.
