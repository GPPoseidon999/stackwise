import chalk from 'chalk';
import ora from 'ora';
import { confirm, checkbox } from '@inquirer/prompts';
import { detectStacks } from '../utils/detector.js';
import { readConfig, initConfig } from '../utils/config.js';
import { syncStandardsRepo, getRepoVersion } from '../utils/git.js';
import { STACK_PRIORITY } from '../constants/stack-map.js';
import { sortStacks, writeStandardsSnapshot } from '../utils/active-rules.js';

export async function runInit(cwd = process.cwd()) {
  console.log(chalk.bold('\n🚀 Initializing stackwise...\n'));

  // ── Step 1: 检测技术栈 ──────────────────────────────────────────────
  const { stacks, error } = detectStacks(cwd);

  if (error) {
    console.log(chalk.red(`✗ ${error}`));
    console.log(chalk.gray('  Make sure you are in a project directory with package.json'));
    process.exit(1);
  }

  if (stacks.length === 0) {
    console.log(chalk.yellow('⚠ No recognized stacks detected automatically.\n'));
  } else {
    console.log(chalk.green(`✓ Detected ${stacks.length} stack(s):\n`));
    stacks.forEach(s => console.log(`    ${chalk.cyan('·')} ${s}`));
    console.log();
  }

  // ── Step 2: 让用户确认 / 调整技术栈 ────────────────────────────────
  const confirmedStacks = await checkbox({
    message: 'Review detected stacks (space to toggle, enter to confirm):',
    choices: STACK_PRIORITY.map(s => ({
      name: s,
      value: s,
      checked: stacks.includes(s),
    })),
    pageSize: 20,
  });

  if (confirmedStacks.length === 0) {
    console.log(chalk.yellow('\n⚠ No stacks selected. Exiting.\n'));
    process.exit(0);
  }

  const selectedStacks = sortStacks(confirmedStacks);

  console.log();

  // ── Step 3: 读取/初始化配置 ─────────────────────────────────────────
  const config = readConfig(cwd);

  if (config._isDefault) {
    console.log(chalk.gray(`  Using default standards repo: ${chalk.white(config.standards_repo)}`));
    const createConfig = await confirm({
      message: 'Create stackwise.config.json in this directory?',
      default: true,
    });
    if (createConfig) {
      initConfig({}, cwd);
      console.log(chalk.green('  ✓ Created stackwise.config.json\n'));
    }
  } else {
    console.log(chalk.gray(`  Standards repo: ${chalk.white(config.standards_repo)}\n`));
  }

  // ── Step 4: Clone / pull standards-repo ────────────────────────────
  const spinner = ora('Syncing standards repository...').start();

  const { success, path: repoPath, error: gitError } = syncStandardsRepo(
    config.standards_repo,
    config.branch || 'main'
  );

  if (!success) {
    spinner.fail(chalk.red('Failed to sync standards repo'));
    console.log(chalk.red(`\n  Error: ${gitError}`));
    console.log(chalk.gray('  Check your internet connection and verify the repo URL in stackwise.config.json'));
    process.exit(1);
  }

  spinner.succeed('Standards repository synced');

  // ── Step 5: 复制规范文件到 .standards/ ──────────────────────────────
  const version = getRepoVersion(repoPath);
  const {
    copiedRules,
    missingStacks,
    missingConcerns,
  } = writeStandardsSnapshot({
    cwd,
    config,
    repoPath,
    repoVersion: version,
    detectedStacks: stacks,
    selectedStacks,
  });

  // ── 输出结果 ──────────────────────────────────────────────────────────
  console.log();

  if (copiedRules.length > 0) {
    console.log(chalk.bold('📦 Standards installed:\n'));

    const byGroup = {};
    for (const rule of copiedRules) {
      const groupLabel = rule.type === 'concern' ? rule.concern : rule.stack;
      if (!groupLabel) continue;
      if (!byGroup[groupLabel]) byGroup[groupLabel] = [];
      byGroup[groupLabel].push(rule.file);
    }

    for (const [group, files] of Object.entries(byGroup)) {
      console.log(`  ${chalk.cyan('▸')} ${chalk.bold(group)} (${files.length} file${files.length > 1 ? 's' : ''})`);
      for (const f of files) {
        console.log(`      ${chalk.gray(f)}`);
      }
    }
    console.log();
  }

  if (missingStacks.length > 0) {
    console.log(chalk.yellow(`  ⚠ No standards found in repo for: ${missingStacks.join(', ')}`));
    console.log(chalk.gray(`    Contribute them → ${config.standards_repo}\n`));
  }

  if (missingConcerns.length > 0) {
    console.log(chalk.yellow(`  ⚠ Default concerns missing in repo: ${missingConcerns.join(', ')}`));
    console.log(chalk.gray(`    Check meta/default-concerns.json in ${config.standards_repo}\n`));
  }

  console.log(
    chalk.green('✓ Done!') +
    chalk.gray(` .standards/ ready · ${copiedRules.length} rule file(s) · version ${version}`)
  );
  console.log(chalk.gray('  Run `stackwise list` to view active rules.\n'));
}
