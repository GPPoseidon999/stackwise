import chalk from 'chalk';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { AGENTS_DIR, countRuleFiles } from '../utils/active-rules.js';
import { readConfig, validateConfig } from '../utils/config.js';
import { checkGit } from '../utils/git.js';
import { StackwiseError, renderError } from '../utils/error.js';

/**
 * stackwise doctor
 * 一次性诊断常见配置问题，每一项给明确的 fix 建议。
 */
export async function runDoctor(cwd = process.cwd()) {
  console.log(chalk.bold('\n🩺 stackwise doctor\n'));

  const issues = [];
  const ok = [];

  // 1) git
  if (checkGit()) ok.push('git installed');
  else {
    issues.push(
      new StackwiseError('config', 'git not installed or not in PATH', 'Install git from https://git-scm.com')
    );
  }

  // 2) package.json
  if (existsSync(join(cwd, 'package.json'))) ok.push('package.json found');
  else
    issues.push(
      new StackwiseError(
        'config',
        'package.json not found',
        'Run `stackwise doctor` from your project root'
      )
    );

  // 3) stackwise.config.json
  if (existsSync(join(cwd, 'stackwise.config.json'))) {
    ok.push('stackwise.config.json found');
    try {
      const config = readConfig(cwd);
      const cfgErrors = validateConfig(config);
      issues.push(...cfgErrors);
      if (cfgErrors.length === 0) ok.push('config validates');
    } catch (err) {
      issues.push(err);
    }
  } else {
    issues.push(
      new StackwiseError(
        'config',
        'stackwise.config.json missing',
        'Run `stackwise init` to bootstrap the project'
      )
    );
  }

  // 4) AGENTS.md
  if (existsSync(join(cwd, 'AGENTS.md'))) ok.push('AGENTS.md found');
  else
    issues.push(
      new StackwiseError(
        'config',
        'AGENTS.md missing',
        'Run `stackwise init` to regenerate the main agent entry point'
      )
    );

  // 5) agents/ tree
  const expectedSubdirs = ['rules', 'skills', 'memory', 'spec', 'config'];
  for (const sub of expectedSubdirs) {
    const path = join(cwd, AGENTS_DIR, sub);
    if (existsSync(path)) ok.push(`agents/${sub}/ exists`);
    else
      issues.push(
        new StackwiseError(
          'config',
          `agents/${sub}/ is missing`,
          'Run `stackwise init` to create the agents tree'
        )
      );
  }

  const ruleCount = countRuleFiles(cwd);
  if (ruleCount > 0) ok.push(`${ruleCount} rule file(s) in agents/rules/`);
  else
    issues.push(
      new StackwiseError(
        'config',
        'agents/rules/ contains no rule files',
        'Run `stackwise sync` to fetch rules from the standards repo'
      )
    );

  // 6) .gitignore 含 agents/
  const gitignorePath = join(cwd, '.gitignore');
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    if (content.split(/\r?\n/).some((l) => l.trim() === 'agents/')) {
      ok.push('.gitignore includes agents/');
    } else {
      issues.push(
        new StackwiseError(
          'config',
          '.gitignore does not include `agents/`',
          'Add `agents/` on its own line, or re-run `stackwise init` to inject it'
        )
      );
    }
  } else {
    issues.push(
      new StackwiseError(
        'config',
        '.gitignore missing',
        'Run `stackwise init` to generate it'
      )
    );
  }

  // 7) notify.json 不应被 git 追踪
  try {
    const tracked = execSync('git ls-files -- agents/config/notify.json', {
      cwd,
      encoding: 'utf-8',
    }).trim();
    if (tracked) {
      issues.push(
        new StackwiseError(
          'config',
          'agents/config/notify.json is tracked by git (leaks credentials)',
          'Run `git rm --cached agents/config/notify.json` and rotate any exposed secrets'
        )
      );
    } else {
      ok.push('notify.json not tracked by git');
    }
  } catch {
    /* not a git repo, ignore */
  }

  // 输出
  for (const line of ok) console.log(`  ${chalk.green('✓')} ${line}`);
  if (issues.length) {
    console.log();
    for (const err of issues) renderError(err);
    console.log();
    console.log(chalk.yellow(`⚠ ${issues.length} issue(s) detected\n`));
    process.exit(1);
  }
  console.log();
  console.log(chalk.green('✓ All checks passed.\n'));
}
