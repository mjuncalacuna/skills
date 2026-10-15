import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { collect, summarize, roleOf, encodeProjectDir, formatTable } from "../usage.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const session = path.join(here, "fixtures", "sess-1.jsonl");
const script = path.join(here, "..", "usage.mjs");

test("roleOf maps agent types", () => {
  assert.equal(roleOf("team:worker"), "worker");
  assert.equal(roleOf("worker"), "worker");
  assert.equal(roleOf("team:reviewer"), "reviewer");
  assert.equal(roleOf("reviewer"), "reviewer");
  assert.equal(roleOf("general-purpose"), "general-purpose");
  assert.equal(roleOf("myworker"), "myworker");
  assert.equal(roleOf(null), "subagent");
});

test("encodeProjectDir replaces non-alphanumerics", () => {
  assert.equal(encodeProjectDir("/a/b.c/d"), "-a-b-c-d");
});

test("counts each message.id once, skips bad lines, resolves types", () => {
  const s = summarize(collect(session));
  const row = (role, model) => s.rows.find((r) => r.role === role && r.model === model);
  // planner: p1 (100) + p2 (final line 300, not 16+300) + two Agent tool_use turns (5 each)
  const p = row("planner", "claude-opus-5-5");
  assert.equal(p.responses, 4);
  assert.equal(p.output, 410);
  assert.equal(p.input, 10 + 5 + 1 + 1);
  assert.equal(p.cacheRead, 150);
  // worker: w_a once (50) + w_b (150)
  const w = row("worker", "claude-sonnet-5-5");
  assert.equal(w.responses, 2);
  assert.equal(w.output, 200);
  assert.equal(w.cacheWrite, 40);
  // no meta file: type comes from the parent's Agent tool_use
  assert.equal(row("general-purpose", "claude-sonnet-5-5").output, 70);
  assert.equal(row("reviewer", "claude-opus-5-5").output, 40);
  assert.equal(s.total.output, 720);
  assert.equal(s.total.responses, 8);
  const opus = s.models.find((m) => m.model === "claude-opus-5-5");
  assert.equal(opus.output, 450);
  assert.equal(opus.outputShare, 62.5);
  assert.ok(!s.models.some((m) => m.model === "<synthetic>"));
});

test("CLI prints a table and JSON", () => {
  const txt = execFileSync("node", [script, session], { encoding: "utf8" });
  assert.match(txt, /planner\s+claude-opus-5-5/);
  assert.match(txt, /TOTAL/);
  assert.match(txt, /claude-sonnet-5-5: 37\.5% of output tokens/);
  const j = JSON.parse(execFileSync("node", [script, session, "--json"], { encoding: "utf8" }));
  assert.equal(j.total.output, 720);
  assert.equal(j.rows.length, 4);
});

test("formatTable handles an empty session", () => {
  assert.match(formatTable(summarize([])), /TOTAL/);
});
