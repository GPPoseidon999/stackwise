import chalk from 'chalk';
import ora from 'ora';
import { confirm, checkbox, select, input } from '@inquirer/prompts';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { detectStacks } from '../utils/detector.js';
import { readConfig, initConfig, writeConfig, DEFAULT_CONFIG } from '../utils/config.js';
import { syncStandardsRepo, getRepoVersion, checkGit } from '../utils/git.js';
import { STACK_PRIORITY } from '../constants/stack-map.js';
import {
  AGENTS_DIR,
  RULES_DIR,
  sortStacks,
  writeStandardsSnapshot,
} from '../utils/active-rules.js';
import { ensureStackwiseGitignore } from '../utils/gitignore.js';
import { StackwiseError, ensureOrExit } from '../utils/error.js';

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'templates'
);

const AGENTS_SUBDIRS = [
  'rules',
  'rules/biz',
  'skills',
  'schemas',
  'memory',
  'memory/decisions',
  'memory/archive',
  'spec',
  'config',
  'evals',
];

/**
 * stackwise init
 *
 * 三种状态分支：
 *  A) 全新项目 → 直接初始化
 *  B) 已有 stackwise.config.json → 询问「重新同步规则 / 完整重新初始化」
 *  C) 有 agents/ 但无 config → 询问是否在现有基础上补充
 *
 * --force：跳过 B/C 的提示，但要求输入项目名二次确认
 */
export async function runInit({ force = false } = {}, cwd = process.cwd()) {
  console.log(chalk.bold('\n🚀 stackwise init\n'));

  // ── 启动前 batch 校验 ────────────────────────────────────────────────
  ensureOrExit(() => {
    const errors = [];
    if (!checkGit()) {
      errors.push(
        new StackwiseError(
          'config',
          'git is not installed or not in PATH',
          'Install git from https://git-scm.com and re-run `stackwise init`'
        )
      );
    }
    if (!existsSync(join(cwd, 'package.json'))) {
      errors.push(
        new StackwiseError(
          'config',
          'package.json not found in current directory',
          `Run \`stackwise init\` from your project root (currently: ${cwd})`
        )
      );
    }
    return errors;
  });

  // ── Step 1: 探测既有状态 ────────────────────────────────────────────
  const hasConfig = existsSync(join(cwd, 'stackwise.config.json'));
  const hasAgents = existsSync(join(cwd, AGENTS_DIR));
  const state = !hasConfig && !hasAgents
    ? 'fresh'
    : hasConfig
      ? 'config-exists'
      : 'agents-exists';

  let mode = 'init'; // init | resync | reinit | augment
  if (state === 'fresh') {
    mode = 'init';
  } else if (force) {
    if (state === 'config-exists') {
      const projectName = readProjectName(cwd);
      const typed = await input({
        message: chalk.yellow(
          `⚠ --force will overwrite agents/. Type the project name "${projectName}" to confirm:`
        ),
      });
      if (typed.trim() !== projectName) {
        console.log(chalk.red('\n✗ Project name mismatch. Aborting.\n'));
        process.exit(1);
      }
    }
    mode = state === 'config-exists' ? 'reinit' : 'augment';
  } else if (state === 'config-exists') {
    mode = await select({
      message: 'Existing stackwise.config.json detected. What do you want to do?',
      choices: [
        { name: 'Resync rules only (recommended)', value: 'resync' },
        { name: 'Re-initialize everything (preserves biz/ memory/ spec/ config/)', value: 'reinit' },
        { name: 'Cancel', value: 'cancel' },
      ],
      default: 'resync',
    });
    if (mode === 'cancel') {
      console.log(chalk.gray('\nCancelled.\n'));
      return;
    }
  } else {
    // agents-exists 但无 config
    const proceed = await confirm({
      message: 'agents/ directory already exists but no stackwise.config.json. Augment in place?',
      default: true,
    });
    if (!proceed) {
      console.log(chalk.gray('\nCancelled.\n'));
      return;
    }
    mode = 'augment';
  }

  // ── Step 2: 写 .gitignore ──────────────────────────────────────────
  const giResult = ensureStackwiseGitignore(cwd);
  if (giResult.created) {
    console.log(chalk.green('  ✓ Created .gitignore with `agents/`'));
  } else if (giResult.added.length) {
    console.log(chalk.green(`  ✓ Updated .gitignore (+${giResult.added.join(', ')})`));
  }

  // ── Step 3: 检测技术栈 + 让用户调整 ────────────────────────────────
  const { stacks, error } = detectStacks(cwd);
  if (error) {
    throw new StackwiseError('config', error, 'Make sure package.json is valid JSON');
  }

  if (stacks.length === 0) {
    console.log(chalk.yellow('\n⚠ No recognized stacks detected automatically.\n'));
  } else {
    console.log(chalk.green(`\n✓ Detected ${stacks.length} stack(s): ${stacks.join(', ')}\n`));
  }

  const confirmedStacks = await checkbox({
    message: 'Review stacks (space to toggle, enter to confirm):',
    choices: STACK_PRIORITY.map((s) => ({
      name: s,
      value: s,
      checked: stacks.includes(s),
    })),
    pageSize: 20,
  });

  if (confirmedStacks.length === 0) {
    console.log(chalk.yellow('\n⚠ No stacks selected. Exiting.\n'));
    return;
  }
  const selectedStacks = sortStacks(confirmedStacks);

  // ── Step 4: 配置 ────────────────────────────────────────────────────
  let config;
  if (state === 'fresh' || mode === 'reinit') {
    initConfig({}, cwd);
    config = readConfig(cwd);
    console.log(chalk.green(`  ✓ ${mode === 'reinit' ? 'Reset' : 'Created'} stackwise.config.json\n`));
  } else {
    config = readConfig(cwd);
    if (config._isDefault) {
      initConfig({}, cwd);
      config = readConfig(cwd);
      console.log(chalk.green('  ✓ Created stackwise.config.json (was missing)\n'));
    } else {
      console.log(chalk.gray(`  Standards repo: ${chalk.white(config.standards_repo)}\n`));
    }
  }

  // ── Step 5: clone standards repo ───────────────────────────────────
  const spinner = ora('Syncing standards repository...').start();
  const { success, path: repoPath, error: gitError } = syncStandardsRepo(
    config.standards_repo,
    config.branch || 'main'
  );
  if (!success) {
    spinner.fail(chalk.red('Failed to sync standards repo'));
    throw new StackwiseError(
      'network',
      `Could not sync ${config.standards_repo}`,
      'Check internet connectivity and verify the repo URL in stackwise.config.json',
      gitError
    );
  }
  spinner.succeed('Standards repository synced');

  // ── Step 6: 复制规则 ────────────────────────────────────────────────
  const version = getRepoVersion(repoPath);
  const result = writeStandardsSnapshot({
    cwd,
    config,
    repoPath,
    repoVersion: version,
    detectedStacks: stacks,
    selectedStacks,
  });

  // ── Step 7: 创建 agents 子目录 + AGENTS.md ─────────────────────────
  ensureAgentsTree(cwd);
  ensureAgentsMdAndTemplates(cwd);

  // ── Step 8: 输出结果 ────────────────────────────────────────────────
  console.log();
  console.log(chalk.bold('📦 Standards installed:\n'));
  for (const rule of result.copiedRules) {
    console.log(`  ${chalk.gray('·')} ${rule.id} ${chalk.gray(rule.file)}`);
  }
  console.log();

  if (result.missingStacks.length) {
    console.log(chalk.yellow(`  ⚠ Missing stack rules: ${result.missingStacks.join(', ')}`));
    console.log(chalk.gray(`    Contribute them → ${config.standards_repo}\n`));
  }
  if (result.missingConcerns.length) {
    console.log(chalk.yellow(`  ⚠ Missing concern rules: ${result.missingConcerns.join(', ')}\n`));
  }

  console.log(
    chalk.green('✓ Done!') +
      chalk.gray(
        ` ${RULES_DIR}/ ready · ${result.copiedRules.length} rule file(s) · standards@${version}`
      )
  );
  console.log(chalk.gray('  Run `stackwise list` to inspect active rules.'));
  console.log(
    chalk.gray('  Run `stackwise run new --prd <url|path>` to start the first feature.\n')
  );
}

function ensureAgentsTree(cwd) {
  for (const sub of AGENTS_SUBDIRS) {
    mkdirSync(join(cwd, AGENTS_DIR, sub), { recursive: true });
  }
}

function ensureAgentsMdAndTemplates(cwd) {
  const agentsMdPath = join(cwd, 'AGENTS.md');
  if (!existsSync(agentsMdPath)) {
    copyFileSync(join(TEMPLATES_DIR, 'AGENTS.md'), agentsMdPath);
    console.log(chalk.green('  ✓ Created AGENTS.md'));
  } else {
    console.log(chalk.gray('  • AGENTS.md exists, skipped'));
  }

  const memoryIndex = join(cwd, AGENTS_DIR, 'memory', 'index.md');
  if (!existsSync(memoryIndex)) {
    copyFileSync(join(TEMPLATES_DIR, 'memory-index.md'), memoryIndex);
  }

  const codebaseIndex = join(cwd, AGENTS_DIR, 'memory', 'codebase-index.md');
  if (!existsSync(codebaseIndex)) {
    copyFileSync(join(TEMPLATES_DIR, 'codebase-index.md'), codebaseIndex);
  }

  const conventions = join(cwd, AGENTS_DIR, 'memory', 'conventions.md');
  if (!existsSync(conventions)) {
    copyFileSync(join(TEMPLATES_DIR, 'conventions.md'), conventions);
  }

  // warm 层示例（`_` 前缀表明是只读示例，不会被当作真实 feature 处理）
  const decisionsExample = join(cwd, AGENTS_DIR, 'memory', 'decisions', '_example.md');
  if (!existsSync(decisionsExample)) {
    copyFileSync(join(TEMPLATES_DIR, 'memory-decisions-example.md'), decisionsExample);
  }

  // cold 层示例
  const archiveExample = join(cwd, AGENTS_DIR, 'memory', 'archive', '_example.md');
  if (!existsSync(archiveExample)) {
    copyFileSync(join(TEMPLATES_DIR, 'memory-archive-example.md'), archiveExample);
  }

  const notify = join(cwd, AGENTS_DIR, 'config', 'notify.json');
  if (!existsSync(notify)) {
    copyFileSync(join(TEMPLATES_DIR, 'notify.json'), notify);
    console.log(chalk.green('  ✓ Created agents/config/notify.json (fill in real credentials)'));
  }

  const bizTemplate = join(cwd, AGENTS_DIR, 'rules', 'biz', '_template.md');
  if (!existsSync(bizTemplate)) {
    writeFileSync(
      bizTemplate,
      [
        '---',
        'id: biz/REPLACE-ME',
        'title: REPLACE ME',
        'type: concern',
        'concern: business',
        'priority: high',
        'always_apply: false',
        'applies_to:',
        '  - implementation',
        'signals: []',
        'owner: "@your-name"',
        'last_reviewed: ""',
        '---',
        '',
        '# Title',
        '',
        '## When to read',
        '',
        '## Core rules',
        '- ',
      ].join('\n') + '\n',
      'utf-8'
    );
  }
}

function readProjectName(cwd) {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'));
    return pkg.name || 'your-project';
  } catch {
    return 'your-project';
  }
}
