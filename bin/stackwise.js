#!/usr/bin/env node

import { program } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

program
  .name('stackwise')
  .description('AI-driven dev automation — detect tech stacks and sync coding standards')
  .version(pkg.version);

// detect
program
  .command('detect')
  .description('Detect tech stacks from package.json (preview only, no file changes)')
  .action(async () => {
    const { runDetect } = await import('../src/commands/detect.js');
    await runDetect();
  });

// list
program
  .command('list')
  .description('List currently active standards files in .standards/')
  .action(async () => {
    const { runList } = await import('../src/commands/list.js');
    await runList();
  });

// init
program
  .command('init')
  .description('Detect tech stacks and pull matching standards from the central standards repository')
  .action(async () => {
    const { runInit } = await import('../src/commands/init.js');
    await runInit();
  });

// sync
program
  .command('sync')
  .description('Re-detect the current project and refresh .standards/ while preserving manual overrides')
  .action(async () => {
    const { runSync } = await import('../src/commands/sync.js');
    await runSync();
  });

// add
program
  .command('add <stack>')
  .description('Manually add one stack standard and rebuild .standards/')
  .action(async (stack) => {
    const { runAdd } = await import('../src/commands/add.js');
    await runAdd(stack);
  });

// remove
program
  .command('remove <stack>')
  .description('Manually remove one stack standard and rebuild .standards/')
  .action(async (stack) => {
    const { runRemove } = await import('../src/commands/remove.js');
    await runRemove(stack);
  });

program.parse();
