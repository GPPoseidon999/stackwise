import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { join, relative } from 'path';
import { STACK_PRIORITY } from '../constants/stack-map.js';
import { collectRuleEntries, readDefaultConcerns } from './rules.js';

/**
 * v2.7：所有 AI 流程产物收敛到 agents/。规则目录位于 agents/rules/。
 * active-rules.json 也写到 agents/active-rules.json（不再藏在 .standards/）。
 */
export const AGENTS_DIR = 'agents';
export const RULES_DIR = 'agents/rules';
export const ACTIVE_RULES_PATH = 'agents/active-rules.json';

/**
 * 永远不被 sync 覆盖的目录（biz 由团队本地维护，其他三个属于运行时数据）。
 */
const PRESERVED_RULE_DIRS = new Set(['biz']);

export function readActiveRules(cwd = process.cwd()) {
  const manifestPath = join(cwd, ACTIVE_RULES_PATH);
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function sortStacks(stacks) {
  const uniq = [...new Set(stacks)];
  return [
    ...STACK_PRIORITY.filter((s) => uniq.includes(s)),
    ...uniq.filter((s) => !STACK_PRIORITY.includes(s)).sort(),
  ];
}

export function deriveSelectedStacks(detected, previous) {
  if (!previous) return sortStacks(detected);
  const added = Array.isArray(previous.manual_overrides?.added)
    ? previous.manual_overrides.added
    : [];
  const removed = Array.isArray(previous.manual_overrides?.removed)
    ? previous.manual_overrides.removed
    : [];
  return sortStacks([
    ...detected.filter((s) => !removed.includes(s)),
    ...added,
  ]);
}

/**
 * 把 standards 仓库里的规则按选中的栈复制到 agents/rules/，
 * biz/ 永远保留不动，并把 standards 仓库的 CHANGELOG 同步过来。
 */
export function writeStandardsSnapshot({
  cwd = process.cwd(),
  config,
  repoPath,
  repoVersion,
  detectedStacks,
  selectedStacks,
}) {
  const standardsRoot = config.standards_path
    ? join(repoPath, config.standards_path)
    : repoPath;
  const defaultConcerns = readDefaultConcerns(standardsRoot);
  const rulesDir = join(cwd, RULES_DIR);

  mkdirSync(rulesDir, { recursive: true });
  // 仅清空非保留目录
  for (const entry of readdirSync(rulesDir)) {
    if (PRESERVED_RULE_DIRS.has(entry)) continue;
    if (entry === 'CHANGELOG.md') continue; // 单独处理
    rmSync(join(rulesDir, entry), { recursive: true, force: true });
  }

  const copiedRules = [];
  const missingStacks = [];
  const missingConcerns = [];

  for (const stack of selectedStacks) {
    const srcDir = join(standardsRoot, 'stacks', stack);
    const destDir = join(rulesDir, stack);
    if (!existsSync(srcDir)) {
      missingStacks.push(stack);
      continue;
    }
    mkdirSync(destDir, { recursive: true });
    cpSync(srcDir, destDir, { recursive: true });
    copiedRules.push(...collectRuleEntries(destDir, rulesDir, 'stack'));
  }

  for (const concern of defaultConcerns) {
    const srcDir = join(standardsRoot, 'concerns', concern);
    const destDir = join(rulesDir, concern);
    if (!existsSync(srcDir)) {
      missingConcerns.push(concern);
      continue;
    }
    mkdirSync(destDir, { recursive: true });
    cpSync(srcDir, destDir, { recursive: true });
    copiedRules.push(...collectRuleEntries(destDir, rulesDir, 'concern'));
  }

  // biz/ 自有的规则也加入 manifest（标 source: local）
  const bizDir = join(rulesDir, 'biz');
  if (existsSync(bizDir)) {
    copiedRules.push(...collectRuleEntries(bizDir, rulesDir, 'concern', 'local'));
  }

  // CHANGELOG 同步
  const changelogSrc = join(standardsRoot, 'CHANGELOG.md');
  const changelogDest = join(rulesDir, 'CHANGELOG.md');
  if (existsSync(changelogSrc)) {
    copyFileSync(changelogSrc, changelogDest);
  }

  // meta 复制（可选）
  if (existsSync(join(standardsRoot, 'meta'))) {
    cpSync(join(standardsRoot, 'meta'), join(rulesDir, '_meta'), { recursive: true });
  }

  const manualOverrides = {
    added: selectedStacks.filter((s) => !detectedStacks.includes(s)),
    removed: detectedStacks.filter((s) => !selectedStacks.includes(s)),
  };

  const manifest = {
    generated_at: new Date().toISOString(),
    standards_repo: config.standards_repo,
    standards_version: repoVersion,
    detected_stacks: detectedStacks,
    selected_stacks: selectedStacks,
    manual_overrides: manualOverrides,
    default_concerns: defaultConcerns,
    rules: copiedRules,
  };

  writeFileSync(
    join(cwd, ACTIVE_RULES_PATH),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf-8'
  );

  return {
    activeRules: manifest,
    copiedRules,
    missingStacks,
    missingConcerns,
    defaultConcerns,
  };
}

/**
 * 仅扫 biz/ 重建 manifest 中 source: local 部分（add/remove 等局部更新场景预留）。
 */
export function listBizRules(cwd = process.cwd()) {
  const rulesDir = join(cwd, RULES_DIR);
  const bizDir = join(rulesDir, 'biz');
  if (!existsSync(bizDir)) return [];
  return collectRuleEntries(bizDir, rulesDir, 'concern', 'local');
}

/**
 * 计算两份 manifest 的 diff，用于 sync 命令的变更摘要。
 */
export function diffManifests(oldManifest, newManifest) {
  const oldIds = new Map((oldManifest?.rules ?? []).map((r) => [r.id, r]));
  const newIds = new Map((newManifest?.rules ?? []).map((r) => [r.id, r]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [id, rule] of newIds) {
    if (!oldIds.has(id)) added.push(rule);
  }
  for (const [id, rule] of oldIds) {
    if (!newIds.has(id)) removed.push(rule);
  }
  for (const [id, rule] of newIds) {
    const old = oldIds.get(id);
    if (old && old.file === rule.file) {
      // 内容变更靠 mtime 对比开销大，这里仅按 standards_version 间接体现
    }
  }
  return { added, removed, changed };
}

// 为 init 命令提供「永远不覆盖」白名单
export const PROTECTED_PATHS = [
  'agents/rules/biz',
  'agents/memory',
  'agents/spec',
  'agents/config',
];

export function isProtectedPath(relPath) {
  return PROTECTED_PATHS.some(
    (p) => relPath === p || relPath.startsWith(`${p}/`)
  );
}

// 读出 RULES_DIR 下文件总数（doctor / status 用）
export function countRuleFiles(cwd = process.cwd()) {
  const rulesDir = join(cwd, RULES_DIR);
  if (!existsSync(rulesDir)) return 0;
  let count = 0;
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) walk(full);
      else if (full.endsWith('.md')) count += 1;
    }
  }
  walk(rulesDir);
  return count;
}
