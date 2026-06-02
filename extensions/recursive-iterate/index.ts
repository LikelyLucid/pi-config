import { spawn, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

type Status = "pending" | "running" | "completed" | "failed" | "pruned";
type Config = {
  branching: number;
  maxDepth: number;
  pruneEvery: number;
  keep: number;
  reviewers: number;
  model: string;
  timeoutMs: number;
  allowInstalls: boolean;
  dryRun: boolean;
  foreground: boolean;
  prompt: string;
};
type NodeRecord = {
  id: string;
  parentId?: string;
  depth: number;
  status: Status;
  branch: string;
  worktree: string;
  score?: number;
  error?: string;
};
type RunState = {
  id: string;
  cwd: string;
  root: string;
  runDir: string;
  config: Config;
  nodes: NodeRecord[];
  startedAt: string;
  updatedAt: string;
  status: "running" | "completed" | "failed";
};

const DEFAULTS = {
  branching: 3,
  maxDepth: 6,
  pruneEvery: 3,
  keep: 4,
  reviewers: 3,
  model: "deepseek/deepseek-v4-flash",
  timeoutMs: 30 * 60 * 1000,
};

function parseArgs(args: string): Config {
  const tokens = args.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((t) => t.replace(/^"|"$/g, "")) ?? [];
  const cfg: Config = { ...DEFAULTS, allowInstalls: false, dryRun: false, foreground: false, prompt: "" };
  const prompt: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = () => tokens[++i];
    if (t === "--branching" || t === "-b") cfg.branching = Number(next());
    else if (t === "--depth" || t === "--max-depth" || t === "-d") cfg.maxDepth = Number(next());
    else if (t === "--prune-every") cfg.pruneEvery = Number(next());
    else if (t === "--keep") cfg.keep = Number(next());
    else if (t === "--reviewers") cfg.reviewers = Number(next());
    else if (t === "--model") cfg.model = next();
    else if (t === "--timeout-ms") cfg.timeoutMs = Number(next());
    else if (t === "--allow-installs") cfg.allowInstalls = true;
    else if (t === "--dry-run" || t === "--mock") cfg.dryRun = true;
    else if (t === "--foreground") cfg.foreground = true;
    else prompt.push(t);
  }
  cfg.prompt = prompt.join(" ").trim();
  if (!cfg.prompt) throw new Error("Usage: /ri [flags] <goal prompt>");
  for (const [k, v] of Object.entries({ branching: cfg.branching, maxDepth: cfg.maxDepth, pruneEvery: cfg.pruneEvery, keep: cfg.keep, reviewers: cfg.reviewers })) {
    if (!Number.isFinite(v) || v < 1) throw new Error(`Invalid ${k}: ${v}`);
  }
  return cfg;
}

async function exec(pi: ExtensionAPI, cmd: string, args: string[], cwd?: string) {
  return pi.exec(cmd, args, { cwd });
}

async function gitRoot(pi: ExtensionAPI, cwd: string) {
  const r = await exec(pi, "git", ["rev-parse", "--show-toplevel"], cwd);
  if (r.code !== 0) throw new Error("recursive-iterate v1 requires a git repository.");
  return r.stdout.trim();
}

async function requireClean(pi: ExtensionAPI, root: string) {
  const r = await exec(pi, "git", ["status", "--porcelain"], root);
  if (r.code !== 0) throw new Error(r.stderr || "git status failed");
  if (r.stdout.trim()) throw new Error("Working tree must be clean before /ri starts.");
}

function safeId(s: string) {
  return s.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
function nowId() { return new Date().toISOString().replace(/[:.]/g, "-"); }
function save(state: RunState) {
  state.updatedAt = new Date().toISOString();
  fs.mkdirSync(state.runDir, { recursive: true });
  fs.writeFileSync(path.join(state.runDir, "state.json"), JSON.stringify(state, null, 2));
}
function writeReport(state: RunState) {
  const ranked = [...state.nodes].filter((n) => n.status !== "pruned").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const lines = [
    `# Recursive Iterate Report: ${state.id}`,
    "",
    `Prompt: ${state.config.prompt}`,
    `Status: ${state.status}`,
    "",
    "## Ranked Branches",
    "",
    ...ranked.map((n, i) => `${i + 1}. ${n.id} depth=${n.depth} score=${n.score ?? "n/a"} status=${n.status}\n   - branch: ${n.branch}\n   - worktree: ${n.worktree}`),
    "",
    "## Inspect",
    "",
    `State: ${path.join(state.runDir, "state.json")}`,
  ];
  fs.writeFileSync(path.join(state.runDir, "REPORT.md"), lines.join("\n"));
}

function childPrompt(state: RunState, node: NodeRecord) {
  return `You are one blind branch in a recursive tree-of-thought implementation run.\n\nGoal:\n${state.config.prompt}\n\nRules:\n- Implement a concrete variant in this worktree.\n- Choose your own divergent approach; do not ask about siblings.\n- Write/update IDEA.md, DESIGN_DECISIONS.md, and CHANGELOG.md.\n- Do not write next steps, TODOs, future work, or roadmaps.\n- ${state.config.allowInstalls ? "Dependency installs are allowed if justified." : "Do not install dependencies or change package manager lockfiles unless already necessary for local code edits."}\n- Keep changes focused and runnable.\n\nNode: ${node.id}\nDepth: ${node.depth}\nParent: ${node.parentId ?? "root"}`;
}

async function runPiChild(state: RunState, node: NodeRecord): Promise<void> {
  if (state.config.dryRun) {
    fs.writeFileSync(path.join(node.worktree, "IDEA.md"), `# Idea\n\nDry-run variant ${node.id}.\n`);
    fs.writeFileSync(path.join(node.worktree, "DESIGN_DECISIONS.md"), `# Design Decisions\n\n- Dry-run branch at depth ${node.depth}.\n`);
    fs.writeFileSync(path.join(node.worktree, "CHANGELOG.md"), `# Changelog\n\n- Created dry-run artifacts for ${node.id}.\n`);
    fs.writeFileSync(path.join(node.worktree, `variant-${node.id}.txt`), `dry-run ${node.id}\n`);
    return;
  }
  const args = ["--mode", "json", "-p", "--no-session", "--model", state.config.model, childPrompt(state, node)];
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("pi", args, { cwd: node.worktree, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => { proc.kill("SIGTERM"); reject(new Error("child timeout")); }, state.config.timeoutMs);
    proc.stderr.on("data", (d) => stderr += d.toString());
    proc.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(stderr || `pi exited ${code}`)); });
    proc.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

async function createNode(pi: ExtensionAPI, state: RunState, parent: NodeRecord | undefined, depth: number, index: number) {
  const id = parent ? `${parent.id}.${index}` : `d${depth}n${index}`;
  const branch = `ri/${state.id}/${safeId(id)}`;
  const wt = path.join(state.runDir, "worktrees", safeId(id));
  const base = parent?.branch ?? "HEAD";
  await exec(pi, "git", ["worktree", "add", "-B", branch, wt, base], state.root);
  const node: NodeRecord = { id, parentId: parent?.id, depth, status: "running", branch, worktree: wt };
  state.nodes.push(node); save(state);
  try {
    await runPiChild(state, node);
    await exec(pi, "git", ["add", "-A"], wt);
    await exec(pi, "git", ["commit", "-m", `ri ${state.id} ${id}`], wt);
    node.status = "completed";
  } catch (e: any) {
    node.status = "failed"; node.error = e?.message ?? String(e);
  }
  save(state);
  return node;
}

async function checkpoint(state: RunState, depth: number) {
  const active = state.nodes.filter((n) => n.depth === depth && n.status === "completed");
  for (const n of active) {
    const idea = fs.existsSync(path.join(n.worktree, "IDEA.md")) ? fs.readFileSync(path.join(n.worktree, "IDEA.md"), "utf8") : "";
    n.score = Math.min(100, 50 + idea.length % 50 + (n.status === "completed" ? 10 : 0));
  }
  active.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  for (const n of active.slice(state.config.keep)) n.status = "pruned";
  fs.writeFileSync(path.join(state.runDir, `checkpoint-depth-${depth}.md`), [`# Checkpoint depth ${depth}`, "", ...active.map((n, i) => `${i + 1}. ${n.id} score=${n.score} status=${n.status}`)].join("\n"));
}

async function orchestrate(pi: ExtensionAPI, state: RunState) {
  let parents: NodeRecord[] = [];
  for (let depth = 1; depth <= state.config.maxDepth; depth++) {
    const newNodes: NodeRecord[] = [];
    const sources = depth === 1 ? [undefined] : parents;
    for (const parent of sources) {
      for (let i = 1; i <= state.config.branching; i++) newNodes.push(await createNode(pi, state, parent, depth, i));
    }
    parents = newNodes.filter((n) => n.status === "completed");
    if (depth % state.config.pruneEvery === 0 || depth === state.config.maxDepth) {
      await checkpoint(state, depth);
      parents = parents.filter((n) => n.status === "completed").sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, state.config.keep);
      save(state);
    }
  }
  state.status = "completed"; save(state); writeReport(state);
}

async function start(args: string, pi: ExtensionAPI, ctx: ExtensionCommandContext) {
  const config = parseArgs(args);
  const root = await gitRoot(pi, ctx.cwd);
  await requireClean(pi, root);
  const id = safeId(nowId());
  const runDir = path.join(root, ".pi", "recursive-iterate", "runs", id);
  const state: RunState = { id, cwd: ctx.cwd, root, runDir, config, nodes: [], startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: "running" };
  save(state);
  ctx.ui.notify(`recursive-iterate run ${id} started`, "info");
  // v1 executes in-process; dry-run is intended for quick tests. Real child variant work still uses isolated pi processes.
  await orchestrate(pi, state);
  ctx.ui.notify(`recursive-iterate complete: ${path.join(runDir, "REPORT.md")}`, "info");
}

function findLatestRun(cwd: string) {
  let dir = path.join(cwd, ".pi", "recursive-iterate", "runs");
  try {
    const root = spawnSyncGitRoot(cwd); if (root) dir = path.join(root, ".pi", "recursive-iterate", "runs");
  } catch {
    // Not inside a git repo; fall back to cwd-local run directory.
  }
  if (!fs.existsSync(dir)) return null;
  const runs = fs.readdirSync(dir).sort();
  return runs.length ? path.join(dir, runs[runs.length - 1]) : null;
}
function spawnSyncGitRoot(cwd: string) { try { return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim(); } catch { return null; } }
function loadRun(cwd: string, id?: string) {
  const root = spawnSyncGitRoot(cwd) ?? cwd;
  const runsDir = path.join(root, ".pi", "recursive-iterate", "runs");
  const runDir = id ? path.join(runsDir, id) : findLatestRun(cwd);
  if (!runDir) throw new Error("No recursive-iterate runs found.");
  return JSON.parse(fs.readFileSync(path.join(runDir, "state.json"), "utf8")) as RunState;
}

export default function recursiveIterate(pi: ExtensionAPI) {
  pi.registerCommand("recursive-iterate", { description: "Run recursive tree-of-thought variant exploration", handler: (args: string, ctx: ExtensionCommandContext) => start(args, pi, ctx) });
  pi.registerCommand("ri", { description: "Alias for /recursive-iterate", handler: (args: string, ctx: ExtensionCommandContext) => start(args, pi, ctx) });
  pi.registerCommand("ri-status", { description: "Show latest or named recursive-iterate run status", handler: async (args: string, ctx: ExtensionCommandContext) => {
    const s = loadRun(ctx.cwd, args.trim() || undefined);
    const counts = s.nodes.reduce((m: Record<string, number>, n) => (m[n.status] = (m[n.status] ?? 0) + 1, m), {});
    ctx.ui.notify(`ri ${s.id}: ${s.status} ${JSON.stringify(counts)}\n${path.join(s.runDir, "REPORT.md")}`, "info");
  }});
  pi.registerCommand("ri-resume", { description: "Resume run (v1 reports saved state; rerun command for new run)", handler: async (_args: string, ctx: ExtensionCommandContext) => ctx.ui.notify("Resume metadata exists in state.json; automatic partial resume is not implemented in this v1 scaffold.", "warning") });
  pi.registerCommand("ri-cleanup", { description: "Remove worktrees for a run", handler: async (args: string, ctx: ExtensionCommandContext) => {
    const s = loadRun(ctx.cwd, args.trim() || undefined);
    for (const n of s.nodes) if (fs.existsSync(n.worktree)) await exec(pi, "git", ["worktree", "remove", "--force", n.worktree], s.root);
    ctx.ui.notify(`Removed worktrees for ${s.id}; branches are left for manual inspection/deletion.`, "info");
  }});
}
