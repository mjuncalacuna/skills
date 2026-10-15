# agent-team

A Claude Code plugin that runs non-trivial tasks as a small team.

| Role | Model | Job |
|---|---|---|
| Planner | Your main session (Opus recommended) | Splits the task, briefs the workers, verifies what they return |
| Workers | Sonnet, medium effort (up to 4 subagents in parallel) | One part each, with its own set of files |
| Reviewer | Opus, medium effort (subagent, read-only) | Reviews the result with a fresh context |

```
            ┌── worker 1 ──┐
planner ────┼── worker 2 ──┼── planner verifies ── reviewer ── fixes → worker
            └── worker 4 ──┘                                   (2 rounds max)
```

The expensive model only plans and judges, the volume goes to Sonnet, and the review comes from a context that didn't write the code. Small tasks skip the team: Claude does them directly.

## Install

In Claude Code:

```
/plugin marketplace add mjuncalacuna/agent-team
/plugin install team@agent-team
```

Then `/reload-plugins` or start a new session. Claude uses the skill on its own for non-trivial tasks (features, refactors, multi-file changes, audits, bugs with several possible causes). You can also call it with `/team:team`.

Without the plugin system: copy `plugins/team/skills/team/` to `~/.claude/skills/team/` and `plugins/team/agents/*.md` to `~/.claude/agents/`.

## What's inside

- `skills/team/SKILL.md`: the workflow. Decide whether a team is worth it, plan, hand out self-contained briefs, verify each result before trusting the report, review, fix (two rounds at most) and deliver. It also covers analysis tasks, where nobody edits and the output is a prioritised report.
- `agents/worker.md`: Sonnet, medium effort, stays inside the files it was given.
- `agents/reviewer.md`: Opus, medium effort, read-only by instruction (Read, Grep, Glob and Bash), real findings only.
- `skills/team/providers.md`: Codex (OpenAI) as a worker, and Codex or Grok as a second reviewer through their CLIs.
- `skills/team/orca.md`: in an [Orca](https://github.com/stablyai/orca) terminal, workers and reviewer run as Orca agents, each with its own row in the sidebar.

## Customise

Change `model` and `effort` in `plugins/team/agents/*.md`. The planner is whatever model your session runs.

## License

MIT. Made by [Manuel Juncal](https://www.linkedin.com/in/mjuncalacuna/).
