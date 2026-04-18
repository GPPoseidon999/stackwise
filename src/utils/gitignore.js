import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';

const BLOCK_HEADER = '# stackwise — managed entries (do not commit below)';
// v2.7：整块 agents/ 不进 git
const STACKWISE_ENTRIES = ['agents/', '.standards/'];

/**
 * 向 .gitignore 注入 stackwise 管理的条目（幂等）。
 * 既已存在条目时不重复添加，并在首次注入前插入分隔注释方便排查。
 */
export function ensureStackwiseGitignore(cwd = process.cwd()) {
  const gitignorePath = join(cwd, '.gitignore');

  if (!existsSync(gitignorePath)) {
    writeFileSync(
      gitignorePath,
      `${BLOCK_HEADER}\n${STACKWISE_ENTRIES.join('\n')}\n`,
      'utf-8'
    );
    return { created: true, added: [...STACKWISE_ENTRIES] };
  }

  const content = readFileSync(gitignorePath, 'utf-8');
  const lines = new Set(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );

  const toAdd = STACKWISE_ENTRIES.filter((entry) => !lines.has(entry));
  if (toAdd.length === 0) {
    return { created: false, added: [] };
  }

  const needsHeader = !content.includes(BLOCK_HEADER);
  const suffix =
    (content.endsWith('\n') ? '' : '\n') +
    (needsHeader ? `\n${BLOCK_HEADER}\n` : '') +
    toAdd.join('\n') +
    '\n';

  appendFileSync(gitignorePath, suffix, 'utf-8');
  return { created: false, added: toAdd };
}

export { STACKWISE_ENTRIES };
