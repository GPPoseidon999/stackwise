#!/usr/bin/env node

import { program } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { wrapAction } from '../src/utils/error.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

program
  .name('stackwise')
  .description('AI dev workflow context manager (v2.7) — drives PRD → spec → code → review → test pipelines')
  .version(pkg.version);

program
  .command('detect')
  .description('Detect tech stacks from package.json (read-only)')
  .action(
    wrapAction(async () => {
      const { runDetect } = await import('../src/commands/detect.js');
      await runDetect();
    })
  );

program
  .command('list')
  .description('List active rules from agents/active-rules.json')
  .action(
    wrapAction(async () => {
      const { runList } = await import('../src/commands/list.js');
      await runList();
    })
  );

program
  .command('init')
  .description('Initialize agents/ tree, AGENTS.md, and pull standards')
  .option('-f, --force', 'Force re-initialize (prompts for project name to confirm)')
  .action(
    wrapAction(async (opts) => {
      const { runInit } = await import('../src/commands/init.js');
      await runInit({ force: opts.force });
    })
  );

program
  .command('sync')
  .description('Pull standards repo updates, preserve biz/, refresh active-rules.json')
  .action(
    wrapAction(async () => {
      const { runSync } = await import('../src/commands/sync.js');
      await runSync();
    })
  );

program
  .command('add <stack>')
  .description('Manually add a stack to the active rules manifest')
  .action(
    wrapAction(async (stack) => {
      const { runAdd } = await import('../src/commands/add.js');
      await runAdd(stack);
    })
  );

program
  .command('remove <stack>')
  .description('Manually remove a stack from the active rules manifest')
  .action(
    wrapAction(async (stack) => {
      const { runRemove } = await import('../src/commands/remove.js');
      await runRemove(stack);
    })
  );

// run (has sub-commands)
const run = program.command('run [feature]').description('Continue or start a feature pipeline');

run
  .command('new', { isDefault: false })
  .description('Start a new feature: create branch, init plan.json, prepare instruction')
  .requiredOption('--prd <urlOrPath>', 'PRD source (Feishu URL or local markdown path)')
  .option('--name <englishName>', 'Feature english name (used in git branch)')
  .action(
    wrapAction(async (opts) => {
      const { runNew } = await import('../src/commands/run.js');
      await runNew({ prd: opts.prd, name: opts.name });
    })
  );

run.action(
  wrapAction(async (feature) => {
    const { runContinue } = await import('../src/commands/run.js');
    await runContinue(feature);
  })
);

program
  .command('status')
  .description('Overview of all features\' pipeline_status')
  .action(
    wrapAction(async () => {
      const { runStatus } = await import('../src/commands/status.js');
      await runStatus();
    })
  );

program
  .command('stats')
  .description('Aggregate run metrics')
  .option('--skill <name>', 'Filter by skill')
  .option('--model <name>', 'Filter by model')
  .action(
    wrapAction(async (opts) => {
      const { runStats } = await import('../src/commands/stats.js');
      await runStats({ skill: opts.skill, model: opts.model });
    })
  );

program
  .command('doctor')
  .description('Diagnose common config issues and suggest fixes')
  .action(
    wrapAction(async () => {
      const { runDoctor } = await import('../src/commands/doctor.js');
      await runDoctor();
    })
  );

program
  .command('memory [subcommand]')
  .description('Inspect or clean the three-layer memory (show|clean)')
  .action(
    wrapAction(async (sub) => {
      const { runMemory } = await import('../src/commands/memory.js');
      await runMemory(sub || 'show');
    })
  );

program
  .command('lint-rules')
  .description('Validate frontmatter of every rule file in agents/rules/')
  .action(
    wrapAction(async () => {
      const { runLintRules } = await import('../src/commands/lint-rules.js');
      await runLintRules();
    })
  );

program.parseAsync();
