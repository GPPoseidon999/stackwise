import chalk from 'chalk';
import ora from 'ora';
import { existsSync } from 'fs';
import { join } from 'path';
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

export async function runAdd(stack, cwd = process.cwd()) {
  const normalized = normalizeStackName(stack);
  console.log(chalk.bold(`\n➕ Adding stack: ${normalized}\n`));

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
  const currentSelected = deriveSelectedStacks(stacks, previous);

  if (currentSelected.includes(normalized)) {
    console.log(chalk.yellow(`⚠ ${normalized} is already active.`));
    return;
  }

  const selectedStacks = sortStacks([...currentSelected, normalized]);

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

  if (!existsSync(join(repoPath, 'stacks', normalized))) {
    spinner.fail(chalk.red('Stack rules not found'));
    throw new StackwiseError(
      'config',
      `stacks/${normalized} is missing in the standards repo`,
      `Contribute the rules to ${config.standards_repo} first`
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

  console.log(chalk.gray(`  Active stacks : ${selectedStacks.join(', ')}`));
  console.log(chalk.gray(`  Rule files    : ${result.copiedRules.length}`));
  if (result.missingStacks.length) {
    console.log(chalk.yellow(`  Missing       : ${result.missingStacks.join(', ')}`));
  }
  console.log();
  console.log(chalk.green(`✓ Added ${normalized}`) + chalk.gray(` · standards@${version}\n`));
}
