#!/usr/bin/env node
// Token usage per role (planner / worker / reviewer) and model for one Claude Code session.
//
// What the transcripts look like (checked against real files, Claude Code 2.x):
//  - Transcripts are JSONL under ~/.claude/projects/<project-dir>/, where <project-dir> is the
//    session's cwd with every non-alphanumeric character replaced by "-"
//    (/a/b.c -> -a-b-c, so a worktree path gives a double dash).
//  - The main session is <session-id>.jsonl. Its subagents are in <session-id>/subagents/
//    agent-<agent-id>.jsonl (workflow runs nest deeper, under subagents/workflows/<wf>/), so the
//    script walks that folder recursively.
//  - Every subagent transcript has a sibling agent-<agent-id>.meta.json with
//    {"agentType": "team:worker", "toolUseId": "toolu_...", "description": ..., "model"?: "sonnet"}.
//    Built-in/general agents carry "general-purpose", "claude-code-guide", ... there; plugin agents
//    are namespaced ("team:worker"). Fallbacks, in order: the parent's Agent tool_use
//    (input.subagent_type) found through meta.toolUseId or the tool_result's toolUseResult.agentId,
//    then the "attributionAgent" field on the subagent's assistant lines, then "subagent".
//  - Assistant lines carry message.model, message.id and message.usage
//    (input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens).
//  - One API response is written as several lines with the same message.id while it streams, and
//    the early lines hold PARTIAL usage (e.g. output_tokens 16 instead of the final 405; input and
//    cache fields are the same). So each message.id is counted once, using the line with the
//    highest output_tokens (the last one on a tie).
//  - message.model "<synthetic>" lines (local errors, no API call) are ignored.
//
// Usage: node usage.mjs [session-id | path/to/session.jsonl] [--project <dir>] [--json]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIELDS = ["input", "cacheRead", "cacheWrite", "output"];

export function roleOf(agentType) {
  if (!agentType) return "subagent";
  if (/(^|:)worker$/.test(agentType)) return "worker";
  if (/(^|:)reviewer$/.test(agentType)) return "reviewer";
  return agentType;
}

export function encodeProjectDir(cwd) {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

function readJsonl(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      if (o && typeof o === "object") out.push(o);
    } catch {
      // malformed line: skip
    }
  }
  return out;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// One entry per API response: [{model, input, cacheRead, cacheWrite, output}]
export function responsesOf(lines) {
  const byId = new Map();
  const anon = [];
  for (const o of lines) {
    if (o.type !== "assistant" || !o.message || !o.message.usage) continue;
    const m = o.message;
    if (!m.model || m.model === "<synthetic>") continue;
    const u = m.usage;
    const r = {
      model: m.model,
      input: num(u.input_tokens),
      cacheRead: num(u.cache_read_input_tokens),
      cacheWrite: num(u.cache_creation_input_tokens),
      output: num(u.output_tokens),
    };
    if (!m.id) {
      anon.push(r);
      continue;
    }
    const prev = byId.get(m.id);
    if (!prev || r.output >= prev.output) byId.set(m.id, r);
  }
  return [...byId.values(), ...anon];
}

function findFiles(dir, pred, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findFiles(p, pred, acc);
    else if (pred(e.name)) acc.push(p);
  }
  return acc;
}

// Map toolUseId / agentId -> subagent_type from the parent's Agent tool_use blocks.
function parentAgentTypes(lines) {
  const byToolUse = new Map();
  const toolUseToAgentId = new Map();
  for (const o of lines) {
    const c = o.message && o.message.content;
    if (!Array.isArray(c)) continue;
    for (const b of c) {
      if (b && b.type === "tool_use" && (b.name === "Agent" || b.name === "Task") && b.input) {
        byToolUse.set(b.id, b.input.subagent_type || "general-purpose");
      }
      if (b && b.type === "tool_result" && o.toolUseResult && o.toolUseResult.agentId) {
        toolUseToAgentId.set(b.tool_use_id, o.toolUseResult.agentId);
      }
    }
  }
  const byAgentId = new Map();
  for (const [tu, aid] of toolUseToAgentId) if (byToolUse.has(tu)) byAgentId.set(aid, byToolUse.get(tu));
  return { byToolUse, byAgentId };
}

export function collect(mainFile) {
  const main = readJsonl(mainFile);
  const parent = parentAgentTypes(main);
  const items = []; // {role, agentType, agentId, responses}
  items.push({ role: "planner", agentType: null, agentId: null, responses: responsesOf(main) });

  const sessionDir = mainFile.replace(/\.jsonl$/, "");
  const files = findFiles(sessionDir, (n) => /^agent-.+\.jsonl$/.test(n));
  for (const f of files.sort()) {
    const agentId = path.basename(f).slice("agent-".length, -".jsonl".length);
    const meta = readJson(f.replace(/\.jsonl$/, ".meta.json")) || {};
    const lines = readJsonl(f);
    let type = meta.agentType || null;
    if (!type && meta.toolUseId) type = parent.byToolUse.get(meta.toolUseId) || null;
    if (!type) type = parent.byAgentId.get(agentId) || null;
    if (!type) {
      const l = lines.find((o) => o.type === "assistant" && o.attributionAgent);
      type = l ? l.attributionAgent : null;
    }
    items.push({ role: roleOf(type), agentType: type, agentId, responses: responsesOf(lines) });
  }
  return items;
}

export function summarize(items) {
  const rows = new Map();
  const models = new Map();
  const total = { responses: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  const add = (t, r) => {
    t.responses += 1;
    for (const k of FIELDS) t[k] += r[k];
  };
  for (const it of items) {
    for (const r of it.responses) {
      const key = it.role + "\u0000" + r.model;
      if (!rows.has(key)) rows.set(key, { role: it.role, model: r.model, responses: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 });
      add(rows.get(key), r);
      if (!models.has(r.model)) models.set(r.model, { model: r.model, responses: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 });
      add(models.get(r.model), r);
      add(total, r);
    }
  }
  const pct = (n) => (total.output ? Math.round((n / total.output) * 1000) / 10 : 0);
  const order = (a, b) => roleRank(a.role) - roleRank(b.role) || a.role.localeCompare(b.role) || a.model.localeCompare(b.model);
  return {
    rows: [...rows.values()].sort(order).map((r) => ({ ...r, outputShare: pct(r.output) })),
    models: [...models.values()].sort((a, b) => b.output - a.output).map((m) => ({ ...m, outputShare: pct(m.output) })),
    total,
  };
}

const roleRank = (r) => (r === "planner" ? 0 : r === "worker" ? 1 : r === "reviewer" ? 2 : 3);

export function formatTable(s) {
  const head = ["role", "model", "responses", "input", "cache read", "cache write", "output", "output %"];
  const n = (v) => v.toLocaleString("en-US");
  const body = s.rows.map((r) => [r.role, r.model, n(r.responses), n(r.input), n(r.cacheRead), n(r.cacheWrite), n(r.output), r.outputShare.toFixed(1) + "%"]);
  const t = s.total;
  body.push(["TOTAL", "", n(t.responses), n(t.input), n(t.cacheRead), n(t.cacheWrite), n(t.output), t.output ? "100.0%" : "0.0%"]);
  const all = [head, ...body];
  const w = head.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  const line = (r) => r.map((c, i) => (i < 2 ? c.padEnd(w[i]) : c.padStart(w[i]))).join("  ").trimEnd();
  const out = [line(head), w.map((x) => "-".repeat(x)).join("  ")];
  body.forEach((r, i) => {
    if (i === body.length - 1) out.push(w.map((x) => "-".repeat(x)).join("  "));
    out.push(line(r));
  });
  out.push("");
  for (const m of s.models) out.push(`${m.model}: ${m.outputShare.toFixed(1)}% of output tokens (${n(m.output)})`);
  return out.join("\n");
}

function projectsRoot() {
  return process.env.CLAUDE_PROJECTS_DIR || path.join(os.homedir(), ".claude", "projects");
}

function resolveProjectDir(arg) {
  const root = projectsRoot();
  if (arg) {
    if (fs.existsSync(arg) && fs.statSync(arg).isDirectory() && fs.readdirSync(arg).some((f) => f.endsWith(".jsonl"))) return arg;
    const direct = path.join(root, arg);
    if (fs.existsSync(direct)) return direct;
    return path.join(root, encodeProjectDir(path.resolve(arg)));
  }
  return path.join(root, encodeProjectDir(process.cwd()));
}

function latestSession(dir) {
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return null;
  }
  const withTime = files.map((f) => ({ f: path.join(dir, f), t: fs.statSync(path.join(dir, f)).mtimeMs }));
  withTime.sort((a, b) => b.t - a.t);
  return withTime.length ? withTime[0].f : null;
}

function locateSession(arg, projectArg) {
  const dir = resolveProjectDir(projectArg);
  if (!arg) return latestSession(dir);
  if (arg.endsWith(".jsonl") || (fs.existsSync(arg) && fs.statSync(arg).isFile())) return path.resolve(arg);
  const id = arg.replace(/\.jsonl$/, "");
  const here = path.join(dir, id + ".jsonl");
  if (fs.existsSync(here)) return here;
  if (!projectArg) {
    try {
      for (const d of fs.readdirSync(projectsRoot())) {
        const p = path.join(projectsRoot(), d, id + ".jsonl");
        if (fs.existsSync(p)) return p;
      }
    } catch {
      // no projects dir
    }
  }
  return null;
}

function main(argv) {
  let json = false;
  let project = null;
  let session = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") json = true;
    else if (a === "--project") project = argv[++i];
    else if (a.startsWith("--project=")) project = a.slice(10);
    else if (a === "-h" || a === "--help") {
      console.log("Usage: node usage.mjs [session-id | path/to/session.jsonl] [--project <dir>] [--json]");
      return 0;
    } else session = a;
  }
  const file = locateSession(session, project);
  if (!file) {
    console.error("No session transcript found" + (session ? ` for "${session}"` : " for this directory") + ".");
    return 1;
  }
  const s = summarize(collect(file));
  if (json) console.log(JSON.stringify({ session: path.basename(file, ".jsonl"), ...s }, null, 2));
  else console.log(`session ${path.basename(file, ".jsonl")}\n\n${formatTable(s)}`);
  return 0;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
