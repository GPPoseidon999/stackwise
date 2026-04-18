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
import { StackwiseError } from '../utils/error.js';

export async function runRemove(stack, cwd = process.cwd()) {
  const normalized = normalizeStackName(stack);
  console.log(chalk.bold(`\n➖ Removing stack: ${normalized}\n`));

  if (!isKnownStack(normalized)) {
    const suggestions = getStackSuggestions(normalized);
    const hint = suggestions.length
      ? `Did you mean: ${suggestions.join(', ')}?`
      : `Known stacks include: ${getKnownStacksPreview()}`;
    throw new StackwiseError('config', `Unknown stack: ${normalized}`, hint);
  }

  const { stacks, error } = detectStacks(cwd);
  if (error) {
    throw new StackwiseError('config', error, 'Run from a project root with package.json');
  }

  const config = readConfig(cwd);
  const previous = readActiveRules(cwd);
  if (!previous) {
    console.log(chalk.yellow('⚠ No active manifest found. Run `stackwise init` first.\n'));
    return;
  }

  const currentSelected = deriveSelectedStacks(stacks, previous);
  if (!currentSelected.includes(normalized)) {
    console.log(chalk.yellow(`⚠ ${normalized} is not currently active.`));
    return;
  }

  const selectedStacks = sortStacks(currentSelected.filter((s) => s !== normalized));

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
  spinner.succeed('Standards synced');

  console.log(chalk.gray(`  Active stacks : ${selectedStacks.join(', ') || '(none)'}`));
  console.log(chalk.gray(`  Rule files    : ${result.copiedRules.length}`));
  console.log();
  console.log(chalk.green(`✓ Removed ${normalized}`) + chalk.gray(` · standards@${version}\n`));
}
