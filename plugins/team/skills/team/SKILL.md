---
name: team
description: Default way to run any non-trivial coding or analysis task as a small team. You (the main session) plan, Sonnet workers execute in parallel, and a fresh-context Opus reviewer checks the result before you deliver. Use it without being asked when the task means implementing a feature, refactoring, touching several files, reviewing or auditing something that spans several pages or modules, proposing improvements to part of an app, or debugging a failure with several possible causes. Also when the user types /team or talks about a planner, workers or a reviewer. Do not use it for questions, explanations, configuration help or one-file fixes.
---

# Team: planner, workers, reviewer

You are the planner. You decide and coordinate; workers do the work and a reviewer with fresh eyes checks it. Your context stays clean enough to see the whole picture, the heavy lifting goes to a cheaper model, and the review comes from someone who didn't fall in love with their own solution.

The user doesn't have to ask for the team or explain how it works: decide from the request whether it's needed and of which kind.

| Role | Who | Model |
|---|---|---|
| Planner | You (main session) | Whatever the session runs (Opus recommended) |
| Worker | `worker` agent | `sonnet`, effort `medium` |
| Reviewer | `reviewer` agent, read-only | `opus`, effort `medium` |

Topology: 1 planner → up to 4 workers in parallel, one set of files each → you verify each result → 1 reviewer → fixes go back to a worker. Two review rounds at most.

Use the agents that ship with this plugin (`team:worker` and `team:reviewer`, or `worker` and `reviewer` if they were copied into `~/.claude/agents/`). Their definitions already fix model, effort and tools. If they're missing, spawn general-purpose subagents and pass `model` on each call (and `effort`, if your Claude Code supports it per call).

## 0. Decide whether you need a team

- **Small** (one file, a few lines, a question): no team. Do it yourself and don't mention this skill. Splitting small work costs more than doing it.
- **Implementation**: the user wants code changes (add, fix, refactor, migrate…).
- **Analysis**: the user wants to understand or decide before anything changes (review, audit, investigate, propose improvements…). Nobody edits files; the deliverable is a report. If they ask for proposals, don't implement any until they choose.

If it's unclear what they want and the difference matters, ask in one line before starting.

## 1. Plan

- Read just enough code and `CLAUDE.md`/`AGENTS.md` to understand the task and the repo's rules (in an analysis, those rules are usually the review criteria).
- Split the work into parts with a clear deliverable:
  - Implementation: small tasks (a function, a component, a test), each with its own set of files. Two workers editing the same file overwrite each other.
  - Analysis: one part per area (a page or two, a module, a hypothesis), with the criteria it must apply.
- Mark dependencies: whatever depends on another part goes after it.
- Show the plan in a few lines and carry on, unless a decision belongs to the user.

## 2. Hand out the work

Workers start without seeing this conversation, so each brief has to stand on its own:

- Goal and why.
- Which files it may touch (implementation) or what it must look at (analysis), and that it stays there.
- Context: decisions already taken, repo rules that apply, an example in the code to imitate.
- When it's done and what it returns:
  - Implementation: pass the repo checks (lint, types, tests) and return a short summary of what changed and what it couldn't do.
  - Analysis: findings with evidence (file and line) and one concrete proposal each. No edits.

**Images**: workers can't see images from the conversation. If the user gave file paths, pass them on. If they pasted images, describe what matters for that part.

Launch independent parts in parallel, in a single message; dependent parts in order. At most 4 workers at a time: if there are more independent parts, run them in batches. More parallel workers use up the plan's limits faster, make it likelier that two of them touch the same file and leave you more results to verify. Don't do the work yourself meanwhile: if you coordinate and execute at once, you lose the overall view.

## 3. Verify before you trust

A worker's summary is a claim, not proof. Before moving on, check the artifact: `git status --short` and `git diff --stat` (new files only show in the first), a grep for the change, or the tests. Workers sometimes report fixes they never applied, and a few tool calls in a few seconds for a multi-file change is a warning sign.

If the result doesn't match the report, send it back once with what you found. If it fails again, do it yourself only when it's small, and say so.

## 4. Review

When the workers are done, launch the reviewer with the plan, what each part had to achieve, and the result:

- Implementation: how to see the change (for example `git diff <base>...HEAD`, plus uncommitted changes and `git status --short` for new files). Ask for real bugs with a concrete failing case, violations of the repo's rules and gaps against the plan; no style preferences.
- Analysis: every worker's proposals. Ask it to drop the weak ones, the ones that contradict the repo's rules or each other, and to flag what matters that nobody saw.

Answer format: a list of findings with where, what and why; or "no findings".

For risky changes you can add a second opinion from another provider in parallel: see [providers.md](providers.md).

## 5. Fix

- Check every finding before acting: the reviewer can be wrong too.
- Implementation: real findings go to a worker with a self-contained brief (resume the same worker when you can, it keeps its context). A one-line fix you can do yourself. If the fixes were substantial, review again. Stop after two rounds: if the same things keep coming back, the problem is the plan. Rework it or tell the user.
- Analysis: keep what the reviewer confirms and drop what it rejects.

## 6. Deliver

- Implementation: run the repo's quick checks yourself and sum up in a few lines what was done, what the review found and what is pending or needs the user.
- Analysis: a prioritised list, from general to specific. For each point: where, what changes, why, impact and effort. End by asking what to implement.

## Without subagents

If you can't launch subagents in this environment, run the phases yourself in the same order (plan, work in parts, a critical review as if it were someone else's, fixes) and tell the user there was no real team.
