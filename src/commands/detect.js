import chalk from 'chalk';
import { detectStacks } from '../utils/detector.js';
import { StackwiseError } from '../utils/error.js';

export async function runDetect(cwd = process.cwd()) {
  console.log(chalk.bold('\n🔍 Detecting tech stacks...\n'));

  const { stacks, raw, error } = detectStacks(cwd);
  if (error) {
    throw new StackwiseError('config', error, 'Run this command from a directory containing package.json');
  }

  if (stacks.length === 0) {
    console.log(chalk.yellow('⚠ No recognized stacks found in package.json'));
    const all = Object.keys({ ...raw.dependencies, ...raw.devDependencies }).join(', ');
    console.log(chalk.gray('  All dependencies:'), all || '(none)');
    return { stacks: [] };
  }

  console.log(chalk.green(`✓ Found ${stacks.length} stack(s) in ${chalk.bold(raw.name || 'this project')}:\n`));
  stacks.forEach((stack, i) => {
    console.log(`  ${chalk.cyan(`${i + 1}.`)} ${chalk.bold(stack)}`);
  });
  console.log();
  console.log(chalk.gray('  Run `stackwise init` to generate agents/rules/ for your project.\n'));
  return { stacks };
}
