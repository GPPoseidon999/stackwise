import chalk from 'chalk';
import { detectStacks } from '../utils/detector.js';

export async function runDetect(cwd = process.cwd()) {
  console.log(chalk.bold('\n🔍 Detecting tech stacks...\n'));

  const { stacks, raw, error } = detectStacks(cwd);

  if (error) {
    console.log(chalk.red(`✗ ${error}`));
    console.log(chalk.gray('  Make sure you are running this command in a project with package.json'));
    process.exit(1);
  }

  if (stacks.length === 0) {
    console.log(chalk.yellow('⚠ No recognized stacks found in package.json'));
    console.log(chalk.gray('  All dependencies:'), Object.keys({
      ...raw.dependencies,
      ...raw.devDependencies,
    }).join(', ') || '(none)');
    return { stacks: [] };
  }

  console.log(chalk.green(`✓ Found ${stacks.length} stack(s) in ${chalk.bold(raw.name || 'this project')}:\n`));

  stacks.forEach((stack, i) => {
    console.log(`  ${chalk.cyan(`${i + 1}.`)} ${chalk.bold(stack)}`);
  });

  console.log();
  console.log(chalk.gray('  Run `stackwise init` to pull matching standards into .standards/'));
  console.log();

  return { stacks };
}
