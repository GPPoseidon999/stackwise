import chalk from 'chalk';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { AGENTS_DIR } from '../utils/active-rules.js';
import { readConfig } from '../utils/config.js';
import { StackwiseError } from '../utils/error.js';

/**
 * stackwise memory <subcommand>
 *   show         展示 agents/memory/index.md
 *   clean        把超过 retention_days 的 decisions/ 条目归档到 archive/YYYY-MM.md
 */
export async function runMemory(subcommand = 'show', cwd = process.cwd()) {
  if (subcommand === 'show') return memoryShow(cwd);
  if (subcommand === 'clean') return memoryClean(cwd);
  throw new StackwiseError(
    'config',
    `Unknown memory subcommand: ${subcommand}`,
    'Supported: `stackwise memory show`, `stackwise memory clean`'
  );
}

function memoryShow(cwd) {
  const indexPath = join(cwd, AGENTS_DIR, 'memory', 'index.md');
  if (!existsSync(indexPath)) {
    console.log(chalk.yellow('⚠ agents/memory/index.md not found.'));
    console.log(chalk.gray('  Run `stackwise init` to bootstrap the memory layer.\n'));
    return;
  }
  console.log(chalk.bold('\n🧠 memory/index.md\n'));
  console.log(readFileSync(indexPath, 'utf-8'));
  console.log();
}

function memoryClean(cwd) {
  console.log(chalk.bold('\n🧹 stackwise memory clean\n'));
  const config = readConfig(cwd);
  const retentionDays = config.memory?.retention_days ?? 30;
  const decisionsDir = join(cwd, AGENTS_DIR, 'memory', 'decisions');
  const archiveDir = join(cwd, AGENTS_DIR, 'memory', 'archive');
  if (!existsSync(decisionsDir)) {
    console.log(chalk.yellow('⚠ agents/memory/decisions/ does not exist.\n'));
    return;
  }
  mkdirSync(archiveDir, { recursive: true });

  const cutoff = Date.now() - retentionDays * 86400 * 1000;
  const movedByMonth = {};
  for (const entry of readdirSync(decisionsDir)) {
    if (!entry.endsWith('.md')) continue;
    const full = join(decisionsDir, entry);
    const s = statSync(full);
    if (s.mtimeMs > cutoff) continue;
    const d = s.mtime;
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const archivePath = join(archiveDir, `${monthKey}.md`);
    const body = readFileSync(full, 'utf-8');
    const sep = `\n\n## ${entry.replace(/\.md$/, '')}\n\n`;
    if (existsSync(archivePath)) {
      writeFileSync(archivePath, readFileSync(archivePath, 'utf-8') + sep + body, 'utf-8');
    } else {
      writeFileSync(archivePath, `# Archive ${monthKey}\n${sep}${body}`, 'utf-8');
    }
    renameSync(full, join(decisionsDir, `.archived-${entry}`));
    movedByMonth[monthKey] = (movedByMonth[monthKey] || 0) + 1;
  }

  const total = Object.values(movedByMonth).reduce((a, b) => a + b, 0);
  if (total === 0) {
    console.log(chalk.gray(`  Nothing older than ${retentionDays} days to archive.\n`));
    return;
  }
  for (const [month, count] of Object.entries(movedByMonth)) {
    console.log(chalk.green(`  ✓ Archived ${count} entry/entries → archive/${month}.md`));
  }
  console.log();
  console.log(chalk.gray('  Archived files left under decisions/ with `.archived-` prefix — delete manually when ready.\n'));
}
