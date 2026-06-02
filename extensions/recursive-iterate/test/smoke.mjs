import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, readdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createJiti } from 'jiti';

const execFileP = promisify(execFile);
const jiti = createJiti(import.meta.url);
const extension = jiti('../index.ts').default;

async function git(args, cwd) {
  return execFileP('git', args, { cwd });
}

const tmp = await mkdtemp(path.join(tmpdir(), 'ri-smoke-'));
await git(['init', '-q'], tmp);
await git(['config', 'user.email', 'smoke@example.com'], tmp);
await git(['config', 'user.name', 'Smoke Test'], tmp);
await writeFile(path.join(tmp, 'README.md'), 'smoke\n');
await git(['add', 'README.md'], tmp);
await git(['commit', '-q', '-m', 'init'], tmp);

const commands = new Map();
const pi = {
  registerCommand(name, def) { commands.set(name, def); },
  async exec(cmd, args, options = {}) {
    try {
      const { stdout, stderr } = await execFileP(cmd, args, { cwd: options.cwd });
      return { stdout, stderr, code: 0, killed: false };
    } catch (error) {
      return { stdout: error.stdout ?? '', stderr: error.stderr ?? error.message, code: error.code ?? 1, killed: false };
    }
  },
};
const ctx = { cwd: tmp, ui: { notify(message, level) { console.log(`[${level}] ${message}`); } } };

extension(pi);
await commands.get('ri').handler('--dry-run --branching 2 --depth 2 --prune-every 1 --keep 1 make two text variants', ctx);

const runsDir = path.join(tmp, '.pi', 'recursive-iterate', 'runs');
const runs = await readdir(runsDir);
if (runs.length !== 1) throw new Error(`Expected 1 run, found ${runs.length}`);
const runDir = path.join(runsDir, runs[0]);
await access(path.join(runDir, 'state.json'));
await access(path.join(runDir, 'REPORT.md'));
const report = await readFile(path.join(runDir, 'REPORT.md'), 'utf8');
if (!report.includes('Recursive Iterate Report')) throw new Error('REPORT.md missing title');
const state = JSON.parse(await readFile(path.join(runDir, 'state.json'), 'utf8'));
if (state.status !== 'completed') throw new Error(`Expected completed state, got ${state.status}`);
if (state.nodes.length !== 4) throw new Error(`Expected 4 generated nodes for 2x2 dry-run, got ${state.nodes.length}`);
console.log(`SMOKE_OK ${tmp} ${runs[0]}`);
