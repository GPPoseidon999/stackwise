import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { STACK_PRIORITY } from '../constants/stack-map.js';
import { collectRuleEntries, readDefaultConcerns } from './rules.js';

const ACTIVE_RULES_PATH = '.standards/active-rules.json';

export function readActiveRules(cwd = process.cwd()) {
  const manifestPath = join(cwd, ACTIVE_RULES_PATH);

  if (!existsSync(manifestPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function sortStacks(stacks) {
  const uniqueStacks = [...new Set(stacks)];

  return [
    ...STACK_PRIORITY.filter((stack) => uniqueStacks.includes(stack)),
    ...uniqueStacks.filter((stack) => !STACK_PRIORITY.includes(stack)).sort(),
  ];
}

export function deriveSelectedStacks(detectedStacks, activeRules) {
  if (!activeRules) {
    return sortStacks(detectedStacks);
  }

  const added = Array.isArray(activeRules.manual_overrides?.added)
    ? activeRules.manual_overrides.added
    : [];
  const removed = Array.isArray(activeRules.manual_overrides?.removed)
    ? activeRules.manual_overrides.removed
    : [];

  return sortStacks([
    ...detectedStacks.filter((stack) => !removed.includes(stack)),
    ...added,
  ]);
}

export function writeStandardsSnapshot({
  cwd = process.cwd(),
  config,
  repoPath,
  repoVersion,
  detectedStacks,
  selectedStacks,
}) {
  // standards_path 支持子目录（monorepo 模式）
  const standardsRoot = config.standards_path
    ? join(repoPath, config.standards_path)
    : repoPath;

  const defaultConcerns = readDefaultConcerns(standardsRoot);
  const standardsDir = join(cwd, '.standards');

  rmSync(standardsDir, { recursive: true, force: true });
  mkdirSync(join(standardsDir, 'stacks'), { recursive: true });
  mkdirSync(join(standardsDir, 'concerns'), { recursive: true });

  const copiedRules = [];
  const missingStacks = [];
  const missingConcerns = [];

  for (const stack of selectedStacks) {
    const srcDir = join(standardsRoot, 'stacks', stack);
    const destDir = join(standardsDir, 'stacks', stack);

    if (!existsSync(srcDir)) {
      missingStacks.push(stack);
      continue;
    }

    mkdirSync(destDir, { recursive: true });
    cpSync(srcDir, destDir, { recursive: true });
    copiedRules.push(...collectRuleEntries(destDir, standardsDir));
  }

  for (const concern of defaultConcerns) {
    const srcDir = join(standardsRoot, 'concerns', concern);
    const destDir = join(standardsDir, 'concerns', concern);

    if (!existsSync(srcDir)) {
      missingConcerns.push(concern);
      continue;
    }

    mkdirSync(destDir, { recursive: true });
    cpSync(srcDir, destDir, { recursive: true });
    copiedRules.push(...collectRuleEntries(destDir, standardsDir));
  }

  if (existsSync(join(standardsRoot, 'meta'))) {
    cpSync(join(standardsRoot, 'meta'), join(standardsDir, 'meta'), { recursive: true });
  }

  const manualOverrides = {
    added: selectedStacks.filter((stack) => !detectedStacks.includes(stack)),
    removed: detectedStacks.filter((stack) => !selectedStacks.includes(stack)),
  };

  const activeRules = {
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
    join(standardsDir, 'active-rules.json'),
    JSON.stringify(activeRules, null, 2) + '\n',
    'utf-8'
  );

  ensureGitignore(cwd);

  return {
    activeRules,
    copiedRules,
    missingStacks,
    missingConcerns,
    defaultConcerns,
  };
}

export function ensureGitignore(cwd = process.cwd()) {
  const gitignorePath = join(cwd, '.gitignore');
  const entry = '.standards/';

  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `${entry}\n`, 'utf-8');
    return;
  }

  const content = readFileSync(gitignorePath, 'utf-8');
  if (!content.includes(entry)) {
    appendFileSync(
      gitignorePath,
      `\n# stackwise — auto-generated standards (do not commit)\n${entry}\n`
    );
  }
}
