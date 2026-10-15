import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "verify.mjs");

function run(mode, input) {
  const r = spawnSync(process.execPath, [script, mode], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  return r.stdout;
}

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "verify-hook-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
  g("init", "-q");
  writeFileSync(join(dir, "base.txt"), "base\n");
  g("add", ".");
  g("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
  return dir;
}

const agentInput = (cwd, type = "team:worker", status = "completed") => ({
  hook_event_name: "PostToolUse",
  cwd,
  tool_name: "Agent",
  tool_input: { subagent_type: type },
  tool_response: { status },
});

const ctx = (out) => JSON.parse(out).hookSpecificOutput.additionalContext;

test("agent: completed worker with changes lists files", () => {
  const dir = repo();
  writeFileSync(join(dir, "new-file.txt"), "x");
  writeFileSync(join(dir, "base.txt"), "changed\n");
  const out = run("agent", agentInput(dir));
  assert.equal(JSON.parse(out).hookSpecificOutput.hookEventName, "PostToolUse");
  const c = ctx(out);
  assert.match(c, /new-file\.txt/);
  assert.match(c, /base\.txt/);
});

test("agent: no changes gives the no-changes message", () => {
  assert.match(ctx(run("agent", agentInput(repo()))), /no uncommitted changes/);
});

test("agent: reviewer is ignored", () => {
  assert.equal(run("agent", agentInput(repo(), "team:reviewer")), "");
});

test("agent: async_launched is ignored", () => {
  assert.equal(run("agent", agentInput(repo(), "team:worker", "async_launched")), "");
});

test("report: hand-back marker gives context", () => {
  const dir = repo();
  writeFileSync(join(dir, "a.txt"), "x");
  const out = run("report", { hook_event_name: "UserPromptSubmit", cwd: dir, prompt: "[Subagent hand-back] done" });
  assert.equal(JSON.parse(out).hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(ctx(out), /a\.txt/);
});

test("report: task-notification completed gives context", () => {
  const out = run("report", { cwd: repo(), prompt: "<task-notification><status>completed</status></task-notification>" });
  assert.match(ctx(out), /\[team\]/);
});

test("report: normal prompt is ignored", () => {
  assert.equal(run("report", { cwd: repo(), prompt: "fix the login bug" }), "");
});

test("non-git cwd is ignored", () => {
  const dir = mkdtempSync(join(tmpdir(), "verify-nogit-"));
  assert.equal(run("agent", agentInput(dir)), "");
});

test("invalid JSON exits 0 silently", () => {
  assert.equal(run("agent", "not json{"), "");
  assert.equal(run("report", ""), "");
});

test("more than 25 files is capped", () => {
  const dir = repo();
  for (let i = 0; i < 30; i++) writeFileSync(join(dir, `f${i}.txt`), "x");
  const c = ctx(run("agent", agentInput(dir)));
  assert.match(c, /… and 5 more/);
});

test("repo with no commits still lists status", () => {
  const dir = mkdtempSync(join(tmpdir(), "verify-nohead-"));
  execFileSync("git", ["init", "-q"], { cwd: dir, stdio: "ignore" });
  writeFileSync(join(dir, "fresh.txt"), "x");
  assert.match(ctx(run("agent", agentInput(dir))), /fresh\.txt/);
});

test("report: failed notification mentioning 'completed' is ignored", () => {
  const prompt = "<task-notification><status>failed</status><summary>completed 3 of 5</summary></task-notification>";
  assert.equal(run("report", { cwd: repo(), prompt }), "");
});
