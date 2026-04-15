import chalk from 'chalk';
import ora from 'ora';
import { detectStacks } from '../utils/detector.js';
import { readConfig } from '../utils/config.js';
import { getRepoVersion, syncStandardsRepo } from '../utils/git.js';
import {
  deriveSelectedStacks,
  readActiveRules,
  sortStacks,
  writeStandardsSnapshot,
} from '../utils/active-rules.js';
import {
  getKnownStacksPreview,
  getStackSuggestions,
  isKnownStack,
  normalizeStackName,
} from '../utils/stacks.js';

export async function runRemove(stack, cwd = process.cwd()) {
  const normalizedStack = normalizeStackName(stack);

  console.log(chalk.bold(`\n➖ Removing stack standard: ${normalizedStack}\n`));

  if (!isKnownStack(normalizedStack)) {
    const suggestions = getStackSuggestions(normalizedStack);

    console.log(chalk.red(`✗ Unknown stack: ${normalizedStack}`));
    if (suggestions.length > 0) {
      console.log(chalk.gray(`  Did you mean: ${suggestions.join(', ')}?`));
    } else {
      console.log(chalk.gray(`  Known stacks include: ${getKnownStacksPreview()}`));
      console.log(chalk.gray('  Check the README for the full supported stack list.'));
    }
    console.log();
    process.exit(1);
  }

  const { stacks, error } = detectStacks(cwd);

  if (error) {
    console.log(chalk.red(`✗ ${error}`));
    console.log(chalk.gray('  Make sure you are in a project directory with package.json'));
    process.exit(1);
  }

  const config = readConfig(cwd);
  const previousRules = readActiveRules(cwd);

  if (!previousRules) {
    console.log(chalk.yellow('⚠ No active manifest found.'));
    console.log(chalk.gray('  Run `stackwise init` or `stackwise sync` before removing stacks.\n'));
    return;
  }

  const currentSelectedStacks = deriveSelectedStacks(stacks, previousRules);

  if (!currentSelectedStacks.includes(normalizedStack)) {
    console.log(chalk.yellow(`⚠ ${normalizedStack} is not currently active.`));
    console.log(chalk.gray('  Run `stackwise list` to inspect current rules.\n'));
    return;
  }

  const selectedStacks = sortStacks(currentSelectedStacks.filter((item) => item !== normalizedStack));

  const spinner = ora('Syncing standards repository...').start();
  const { success, path: repoPath, error: gitError } = syncStandardsRepo(
    config.standards_repo,
    config.branch || 'main'
  );

  if (!success) {
    spinner.fail(chalk.red('Failed to sync standards repo'));
    console.log(chalk.red(`\n  Error: ${gitError}`));
    process.exit(1);
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

  spinner.succeed('Standards synced');

  console.log(chalk.gray(`  Active stacks: ${selectedStacks.join(', ') || '(none)'}`));
  console.log(chalk.gray(`  Installed rules: ${result.copiedRules.length}`));

  if (result.missingConcerns.length > 0) {
    console.log(chalk.yellow(`  Missing concern rules: ${result.missingConcerns.join(', ')}`));
  }

  console.log();
  console.log(chalk.green(`✓ Removed ${normalizedStack}`) + chalk.gray(` · version ${version}`));
  console.log(chalk.gray('  Run `stackwise list` to inspect the current manifest.\n'));
}
