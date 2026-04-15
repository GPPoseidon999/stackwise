import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ACTIVE_RULES_PATH = '.standards/active-rules.json';

export async function runList(cwd = process.cwd()) {
  const rulesPath = join(cwd, ACTIVE_RULES_PATH);

  console.log(chalk.bold('\n📋 Active standards\n'));

  if (!existsSync(rulesPath)) {
    console.log(chalk.yellow('⚠ No standards initialized yet.'));
    console.log(chalk.gray('  Run `stackwise init` to get started.\n'));
    process.exit(0);
  }

  let rules;
  try {
    rules = JSON.parse(readFileSync(rulesPath, 'utf-8'));
  } catch {
    console.log(chalk.red('✗ Failed to read .standards/active-rules.json'));
    console.log(chalk.gray('  Try running `stackwise init` again.\n'));
    process.exit(1);
  }

  // 基本信息
  console.log(`  ${chalk.gray('Repo:   ')} ${rules.standards_repo}`);
  console.log(`  ${chalk.gray('Version:')} ${rules.standards_version}`);
  console.log(`  ${chalk.gray('Synced: ')} ${new Date(rules.generated_at).toLocaleString()}`);
  if (Array.isArray(rules.selected_stacks) && rules.selected_stacks.length > 0) {
    console.log(`  ${chalk.gray('Stacks: ')} ${rules.selected_stacks.join(', ')}`);
  }
  if (Array.isArray(rules.default_concerns) && rules.default_concerns.length > 0) {
    console.log(`  ${chalk.gray('Concerns:')} ${rules.default_concerns.join(', ')}`);
  }

  const overrides = formatOverrides(rules.manual_overrides);
  if (overrides) {
    console.log(`  ${chalk.gray('Overrides:')} ${overrides}`);
  }

  console.log();

  // 按 stack / concern 分组展示规范文件
  const byType = {
    stack: {},
    concern: {},
  };

  for (const rule of rules.rules) {
    const type = rule.type === 'concern' ? 'concern' : 'stack';
    const group = type === 'concern' ? rule.concern : rule.stack;
    if (!group) continue;
    if (!byType[type][group]) byType[type][group] = [];
    byType[type][group].push(rule);
  }

  const stackGroups = Object.keys(byType.stack);
  const concernGroups = Object.keys(byType.concern);

  if (stackGroups.length === 0 && concernGroups.length === 0) {
    console.log(chalk.yellow('  No active rules found.\n'));
    return;
  }

  renderGroupSection('Stack rules', byType.stack, cwd);
  renderGroupSection('Concern rules', byType.concern, cwd);

  console.log();
  console.log(chalk.gray(
    `  Total: ${rules.rules.length} rule file(s) across ${stackGroups.length} stack group(s) and ${concernGroups.length} concern group(s)`
  ));
  console.log();
}

function renderGroupSection(title, groups, cwd) {
  const names = Object.keys(groups);

  if (names.length === 0) {
    return;
  }

  console.log(chalk.bold(`  ${title}`));

  for (const name of names) {
    console.log(`  ${chalk.cyan('▸')} ${chalk.bold(name)}`);

    for (const rule of groups[name]) {
      const fileExists = existsSync(join(cwd, rule.file));
      const icon = fileExists ? chalk.green('✓') : chalk.red('✗');
      const priority = rule.priority ? chalk.gray(`[${rule.priority}]`) : '';
      console.log(`      ${icon}  ${rule.id} ${priority}`.trimEnd());
      console.log(`          ${chalk.gray(rule.file)}`);
    }
  }
  console.log();
}

function formatOverrides(overrides) {
  if (!overrides) {
    return '';
  }

  if (Array.isArray(overrides)) {
    return overrides.join(', ');
  }

  const parts = [];

  if (Array.isArray(overrides.added) && overrides.added.length > 0) {
    parts.push(`+${overrides.added.join(', +')}`);
  }

  if (Array.isArray(overrides.removed) && overrides.removed.length > 0) {
    parts.push(`-${overrides.removed.join(', -')}`);
  }

  return parts.join(' ');
}
