import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { ACTIVE_RULES_PATH, readActiveRules } from '../utils/active-rules.js';

export async function runList(cwd = process.cwd()) {
  console.log(chalk.bold('\n📋 Active rules\n'));

  const rules = readActiveRules(cwd);
  if (!rules) {
    console.log(chalk.yellow(`⚠ No manifest found at ${ACTIVE_RULES_PATH}.`));
    console.log(chalk.gray('  Run `stackwise init` to bootstrap.\n'));
    return;
  }

  console.log(`  ${chalk.gray('Repo:     ')} ${rules.standards_repo}`);
  console.log(`  ${chalk.gray('Version:  ')} ${rules.standards_version}`);
  console.log(`  ${chalk.gray('Synced:   ')} ${new Date(rules.generated_at).toLocaleString()}`);
  if (rules.selected_stacks?.length) {
    console.log(`  ${chalk.gray('Stacks:   ')} ${rules.selected_stacks.join(', ')}`);
  }
  if (rules.default_concerns?.length) {
    console.log(`  ${chalk.gray('Concerns: ')} ${rules.default_concerns.join(', ')}`);
  }
  if (rules.manual_overrides) {
    const overrides = formatOverrides(rules.manual_overrides);
    if (overrides) console.log(`  ${chalk.gray('Override: ')} ${overrides}`);
  }
  console.log();

  // 按 source / type 分组
  const groups = {};
  for (const rule of rules.rules) {
    const bucket = rule.source === 'project' ? 'biz' : rule.type === 'concern' ? 'concern' : 'stack';
    const key = rule.source === 'project' ? 'biz' : rule.stack || rule.concern || 'other';
    const heading = `${bucket}:${key}`;
    if (!groups[heading]) groups[heading] = [];
    groups[heading].push(rule);
  }

  for (const [heading, items] of Object.entries(groups)) {
    const [kind, name] = heading.split(':');
    console.log(`  ${chalk.cyan('▸')} ${chalk.bold(`${kind}/${name}`)}`);
    for (const rule of items) {
      const exists = existsSync(join(cwd, rule.file));
      const icon = exists ? chalk.green('✓') : chalk.red('✗');
      const pri = rule.priority ? chalk.gray(`[${rule.priority}]`) : '';
      console.log(`      ${icon}  ${rule.id} ${pri}`.trimEnd());
      console.log(`          ${chalk.gray(rule.file)}`);
    }
  }
  console.log();
  console.log(chalk.gray(`  Total: ${rules.rules.length} rule file(s)\n`));
}

function formatOverrides(overrides) {
  const parts = [];
  if (Array.isArray(overrides.added) && overrides.added.length) {
    parts.push(`+${overrides.added.join(', +')}`);
  }
  if (Array.isArray(overrides.removed) && overrides.removed.length) {
    parts.push(`-${overrides.removed.join(', -')}`);
  }
  return parts.join(' ');
}
