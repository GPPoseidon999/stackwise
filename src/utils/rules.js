import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, join, relative } from 'path';
import matter from 'gray-matter';

const DEFAULT_CONCERNS = ['testing', 'performance', 'build', 'security'];

/**
 * 递归扫描 markdown 文件。`_` 开头的文件被视为模板/示例，不进入 active-rules。
 */
export function walkMarkdownFiles(dir) {
  if (!existsSync(dir)) return [];
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('_')) continue; // _template.md / _example-*.md 不计入
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      results.push(...walkMarkdownFiles(full));
    } else if (full.endsWith('.md') && entry.toLowerCase() !== 'changelog.md') {
      results.push(full);
    }
  }
  return results;
}

export function readDefaultConcerns(repoPath) {
  const metaPath = join(repoPath, 'meta', 'default-concerns.json');
  if (!existsSync(metaPath)) return [...DEFAULT_CONCERNS];
  try {
    const parsed = JSON.parse(readFileSync(metaPath, 'utf-8'));
    if (Array.isArray(parsed.default_concerns) && parsed.default_concerns.length > 0) {
      return parsed.default_concerns;
    }
  } catch {
    return [...DEFAULT_CONCERNS];
  }
  return [...DEFAULT_CONCERNS];
}

/**
 * 把 dir 下的所有 markdown 规则收集成 manifest entry 数组。
 *
 * @param {string} dir          规则文件所在目录
 * @param {string} rulesRoot    agents/rules 的绝对路径
 * @param {'stack'|'concern'} fallbackType
 * @param {'standards'|'local'} source  standards 来自中央仓库；local 是业务项目在 biz/ 本地维护
 */
export function collectRuleEntries(dir, rulesRoot, fallbackType = 'stack', source = 'standards') {
  return walkMarkdownFiles(dir).map((filePath) => {
    const content = readFileSync(filePath, 'utf-8');
    const { data: meta } = matter(content);
    const relPath = 'agents/rules/' + relative(rulesRoot, filePath).replace(/\\/g, '/');

    const entry = {
      id: meta.id || deriveIdFromPath(relPath),
      title: meta.title || deriveTitleFromPath(relPath),
      type: meta.type || fallbackType,
      source,
      priority: meta.priority || 'medium',
      always_apply: meta.always_apply ?? false,
      applies_to: Array.isArray(meta.applies_to) ? meta.applies_to : [],
      signals: Array.isArray(meta.signals) ? meta.signals : [],
      related_rules: Array.isArray(meta.related_rules) ? meta.related_rules : [],
      file: relPath,
    };
    // 只在存在时写出，保持 manifest 与 schema 一致（omit 比 null 更安全）
    if (meta.stack != null) entry.stack = meta.stack;
    if (meta.concern != null) entry.concern = meta.concern;
    if (meta.owner != null) entry.owner = meta.owner;
    if (meta.last_reviewed != null) entry.last_reviewed = String(meta.last_reviewed);
    return entry;
  });
}

/**
 * 用于 lint-rules 命令：返回 frontmatter 校验问题列表。
 */
export function lintRuleFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const issues = [];
  let parsed;
  try {
    parsed = matter(content);
  } catch (err) {
    return [{ severity: 'error', message: `frontmatter parse error: ${err.message}` }];
  }
  const meta = parsed.data ?? {};

  if (!meta.id) issues.push({ severity: 'error', message: 'missing `id`' });
  if (!meta.title) issues.push({ severity: 'error', message: 'missing `title`' });
  if (!meta.type) issues.push({ severity: 'warn', message: 'missing `type`' });
  if (!meta.priority) issues.push({ severity: 'warn', message: 'missing `priority`' });

  // biz/ 规则必须显式声明 owner 与 last_reviewed
  if (filePath.replace(/\\/g, '/').includes('/agents/rules/biz/')) {
    if (!meta.owner) issues.push({ severity: 'error', message: 'biz/ rule missing `owner`' });
    if (!meta.last_reviewed)
      issues.push({ severity: 'error', message: 'biz/ rule missing `last_reviewed`' });
  }

  return issues;
}

function deriveIdFromPath(filePath) {
  return filePath
    .replace('agents/rules/', '')
    .replace(/\.md$/, '');
}

function deriveTitleFromPath(filePath) {
  return basename(filePath, '.md').replace(/-/g, ' ');
}
