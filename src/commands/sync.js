import chalk from 'chalk';
import ora from 'ora';
import { detectStacks } from '../utils/detector.js';
import { readConfig, validateConfig } from '../utils/config.js';
import { getRepoVersion, syncStandardsRepo, checkGit } from '../utils/git.js';
import {
  deriveSelectedStacks,
  diffManifests,
  readActiveRules,
  writeStandardsSnapshot,
} from '../utils/active-rules.js';
import { StackwiseError, ensureOrExit } from '../utils/error.js';

export async function runSync(cwd = process.cwd()) {
  console.log(chalk.bold('\n🔄 stackwise sync\n'));

  // 预检查
  const config = readConfig(cwd);
  ensureOrExit(() => {
    const errors = [...validateConfig(config)];
    if (!checkGit()) {
      errors.push(
        new StackwiseError(
          'config',
          'git is not installed',
          'Install git from https://git-scm.com before running sync'
        )
      );
    }
    return errors;
  });

  const { stacks, error } = detectStacks(cwd);
  if (error) {
    throw new StackwiseError('config', error, 'Ensure package.json is valid');
  }

  const previous = readActiveRules(cwd);
  const selectedStacks = deriveSelectedStacks(stacks, previous);

  if (!previous && selectedStacks.length === 0) {
    console.log(chalk.yellow('⚠ No detected stacks and no existing manifest found.'));
    console.log(chalk.gray('  Run `stackwise init` first, or `stackwise add <stack>` to bootstrap.\n'));
    return;
  }

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
      'Check internet and repo URL',
      gitError
    );
  }

  const version = getRepoVersion(repoPath);
  const result = writeStandardsSnapshot({
    cwd,
    config,
    repoPath,
    repoVersion: version,
    detectedStacks: stacks,
    selectedStacks,
  });
  spinner.succeed(`Standards synced (standards@${version})`);

  const diff = diffManifests(previous, result.activeRules);
  console.log();
  console.log(chalk.gray(`  Detected stacks : ${stacks.join(', ') || '(none)'}`));
  console.log(chalk.gray(`  Active stacks   : ${selectedStacks.join(', ') || '(none)'}`));
  console.log(chalk.gray(`  Rule files      : ${result.copiedRules.length}`));

  if (diff.added.length) {
    console.log(chalk.green(`\n  + ${diff.added.length} new rule(s):`));
    diff.added.forEach((r) => console.log(chalk.green(`    + ${r.id}`)));
  }
  if (diff.removed.length) {
    console.log(chalk.red(`\n  - ${diff.removed.length} removed rule(s):`));
    diff.removed.forEach((r) => console.log(chalk.red(`    - ${r.id}`)));
  }
  if (!diff.added.length && !diff.removed.length && previous) {
    console.log(chalk.gray('\n  No rule changes.'));
  }

  if (result.missingStacks.length) {
    console.log(chalk.yellow(`\n  ⚠ Missing stack rules: ${result.missingStacks.join(', ')}`));
  }
  if (result.missingConcerns.length) {
    console.log(chalk.yellow(`  ⚠ Missing concern rules: ${result.missingConcerns.join(', ')}`));
  }

  console.log();
  console.log(chalk.green('✓ Synced') + chalk.gray(` · biz/ preserved · CHANGELOG updated\n`));
}
