import chalk from 'chalk';
import ora from 'ora';
import { detectStacks } from '../utils/detector.js';
import { readConfig } from '../utils/config.js';
import { getRepoVersion, syncStandardsRepo } from '../utils/git.js';
import {
  deriveSelectedStacks,
  readActiveRules,
  writeStandardsSnapshot,
} from '../utils/active-rules.js';

export async function runSync(cwd = process.cwd()) {
  console.log(chalk.bold('\n🔄 Syncing standards...\n'));

  const { stacks, error } = detectStacks(cwd);

  if (error) {
    console.log(chalk.red(`✗ ${error}`));
    console.log(chalk.gray('  Make sure you are in a project directory with package.json'));
    process.exit(1);
  }

  const config = readConfig(cwd);
  const previousRules = readActiveRules(cwd);
  const selectedStacks = deriveSelectedStacks(stacks, previousRules);

  if (!previousRules && selectedStacks.length === 0) {
    console.log(chalk.yellow('⚠ No detected stacks and no existing manifest found.'));
    console.log(chalk.gray('  Run `stackwise add <stack>` to bootstrap a manual stack selection.\n'));
    return;
  }

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

  printSyncSummary({
    actionLabel: 'Synced',
    version,
    selectedStacks,
    detectedStacks: stacks,
    copiedRules: result.copiedRules,
    missingStacks: result.missingStacks,
    missingConcerns: result.missingConcerns,
  });
}

function printSyncSummary({
  actionLabel,
  version,
  selectedStacks,
  detectedStacks,
  copiedRules,
  missingStacks,
  missingConcerns,
}) {
  if (detectedStacks.length > 0) {
    console.log(chalk.gray(`  Detected stacks: ${detectedStacks.join(', ')}`));
  }
  console.log(chalk.gray(`  Active stacks: ${selectedStacks.join(', ') || '(none)'}`));
  console.log(chalk.gray(`  Installed rules: ${copiedRules.length}`));

  if (missingStacks.length > 0) {
    console.log(chalk.yellow(`  Missing stack rules: ${missingStacks.join(', ')}`));
  }

  if (missingConcerns.length > 0) {
    console.log(chalk.yellow(`  Missing concern rules: ${missingConcerns.join(', ')}`));
  }

  console.log();
  console.log(chalk.green(`✓ ${actionLabel}!`) + chalk.gray(` version ${version}`));
  console.log(chalk.gray('  Run `stackwise list` to inspect the current manifest.\n'));
}
