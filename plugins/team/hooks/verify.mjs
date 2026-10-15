#!/usr/bin/env node
// Known limits: report mode can't tell which agent reported (UserPromptSubmit carries no agent type; SubagentStop can fire after the report is delivered, so it isn't used), and it reads the main session's cwd, so workers in a separate worktree aren't covered.
// Verification hook for the team plugin. After a worker reports back, show the
// planner the real state of the repo (git status + diff stat) so it doesn't
// have to trust the worker's summary. Never throws, always exits 0.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_LINES = 25;

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    timeout: 3000,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function cap(text) {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length <= MAX_LINES) return lines;
  return [...lines.slice(0, MAX_LINES), `… and ${lines.length - MAX_LINES} more`];
}

function shouldAct(mode, input) {
  if (mode === "agent") {
    const type = input?.tool_input?.subagent_type;
    return (
      input?.tool_response?.status === "completed" &&
      typeof type === "string" &&
      /(^|:)worker$/.test(type)
    );
  }
  if (mode === "report") {
    const p = input?.prompt;
    if (typeof p !== "string") return false;
    return (
      p.includes("[Subagent hand-back]") ||
      (p.includes("<task-notification>") && p.includes("<status>completed</status>"))
    );
  }
  return false;
}

function main() {
  const mode = process.argv[2];
  const input = JSON.parse(readFileSync(0, "utf8"));
  if (!shouldAct(mode, input)) return;
  const cwd = input.cwd || process.cwd();
  if (git(cwd, ["rev-parse", "--is-inside-work-tree"]).trim() !== "true") return;
  const tryGit = (args) => {
    try {
      return git(cwd, args);
    } catch {
      return null;
    }
  };
  const statusOut = tryGit(["status", "--short"]);
  if (statusOut === null) return;
  const status = cap(statusOut);
  const hasHead = tryGit(["rev-parse", "--verify", "-q", "HEAD"]) !== null;
  const stat = hasHead ? cap(tryGit(["diff", "HEAD", "--stat"]) ?? "") : [];
  let text;
  if (status.length === 0 && stat.length === 0) {
    text =
      "[team] A subagent reported back and the repo has no uncommitted changes. If it was a worker that claimed to edit files, those edits are not there.";
  } else {
    text =
      "[team] Repo state after a subagent report. If it was a worker, check this matches what it says before you trust it.\n" +
      `git status --short:\n${status.join("\n") || "(none)"}\n` +
      `git diff HEAD --stat:\n${stat.join("\n") || "(none)"}`;
  }
  const hookEventName = mode === "agent" ? "PostToolUse" : "UserPromptSubmit";
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: text } }),
  );
}

try {
  main();
} catch {
  // Silent by design.
}
process.exit(0);
