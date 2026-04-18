import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { AGENTS_DIR } from '../utils/active-rules.js';
import { lintRuleFile, walkMarkdownFiles } from '../utils/rules.js';
import { StackwiseError } from '../utils/error.js';

/**
 * stackwise lint-rules
 * 校验 agents/rules/ 下所有规则文件的 frontmatter。biz/ 规则额外要求 owner + last_reviewed。
 * 任何 error 级别问题会使命令以非零状态退出。
 */
export async function runLintRules(cwd = process.cwd()) {
  console.log(chalk.bold('\n🔎 stackwise lint-rules\n'));

  const rulesDir = join(cwd, AGENTS_DIR, 'rules');
  if (!existsSync(rulesDir)) {
    throw new StackwiseError(
      'config',
      'agents/rules/ missing',
      'Run `stackwise init` or `stackwise sync` first'
    );
  }

  // walkMarkdownFiles 自动过滤 _template.md / CHANGELOG.md
  const files = walkMarkdownFiles(rulesDir);
  if (files.length === 0) {
    console.log(chalk.yellow('  (no rule files to lint)\n'));
    return;
  }

  let errorCount = 0;
  let warnCount = 0;
  for (const file of files) {
    const issues = lintRuleFile(file);
    if (issues.length === 0) continue;
    const rel = file.replace(`${cwd}/`, '');
    console.log(chalk.bold(`  ${rel}`));
    for (const issue of issues) {
      if (issue.severity === 'error') {
        errorCount += 1;
        console.log(`    ${chalk.red('✗')} ${issue.message}`);
      } else {
        warnCount += 1;
        console.log(`    ${chalk.yellow('⚠')} ${issue.message}`);
      }
    }
  }

  console.log();
  console.log(
    chalk.gray(`  Checked ${files.length} file(s) · ${errorCount} error · ${warnCount} warning`)
  );
  if (errorCount > 0) {
    console.log();
    process.exit(1);
  }
  console.log(chalk.green('\n✓ All rule files pass frontmatter checks.\n'));
}
