# team

A Claude Code plugin that runs non-trivial tasks as a small team.

| Role | Model | Job |
|---|---|---|
| Planner | Your main session (Opus recommended) | Splits the task, briefs the workers, verifies what they return |
| Workers | Sonnet, medium effort (up to 4 in parallel) | One part each, with its own set of files |
| Reviewer | Opus, medium effort (read-only) | Reviews the result with a fresh context |

```
            ┌── worker 1 ──┐
planner ────┼── worker 2 ──┼── planner verifies ── reviewer ── fixes → worker
            └── worker 4 ──┘                                   (2 rounds max)
```

The expensive model only plans and judges, the volume goes to Sonnet, and the review comes from a context that didn't write the code. Small tasks skip the team: Claude does them directly.

## Install

In Claude Code:

```
/plugin marketplace add mjuncalacuna/skills
/plugin install team@skills
```

Then `/reload-plugins` or start a new session. Claude uses the skill on its own for non-trivial tasks (features, refactors, multi-file changes, audits, bugs with several possible causes). You can also call it with `/team:team`.

Without the plugin system: copy `skills/team/` to `~/.claude/skills/team/` and `agents/*.md` to `~/.claude/agents/`.

## What's inside

- `skills/team/SKILL.md`: the workflow. Decide whether a team is worth it, plan, hand out self-contained briefs, verify each result before trusting the report, review, fix (two rounds at most) and deliver. It also covers analysis tasks, where nobody edits and the output is a prioritised report.
- `agents/worker.md`: Sonnet, medium effort, stays inside the files it was given.
- `agents/reviewer.md`: Opus, medium effort, read-only by instruction (Read, Grep, Glob and Bash), real findings only.
- `skills/team/providers.md`: Codex (OpenAI) as a worker, and Codex or Grok as a second reviewer through their CLIs.
- `skills/team/orca.md`: in an [Orca](https://github.com/stablyai/orca) terminal, workers and reviewer run as Orca agents, each with its own row in the sidebar.
- `hooks/verify.mjs`: when a worker reports back, it hands the planner `git status --short` and `git diff HEAD --stat`, so checking the report doesn't depend on the model remembering to. If the repo has no changes, it says so.
- `scripts/usage.mjs`: how many tokens each role used in a session, by model, read from Claude Code's transcripts.

## Measure a session

From the project folder, after a run:

```
node ~/.claude/plugins/marketplaces/skills/plugins/team/scripts/usage.mjs
```

It takes the latest session of that folder (or a session id) and prints a table of planner, workers and reviewer by model: responses, input, cache read, cache write and output tokens. Cache reads are usually most of the volume, so don't judge a setup by output tokens alone.

Roles come from the agent type: `team:worker` and `worker` count as workers, `team:reviewer` and `reviewer` as reviewers, and anything else (for example general-purpose subagents) shows under its own type. If the project folder isn't found, pass it with `--project`.

## Customise

Change `model` and `effort` in `agents/*.md`. The planner is whatever model your session runs.

## License

MIT, see [LICENSE](../../LICENSE).
