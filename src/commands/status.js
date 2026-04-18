import chalk from 'chalk';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { AGENTS_DIR } from '../utils/active-rules.js';
import { readPlan, nextPendingStep } from '../utils/plan.js';

/**
 * stackwise status
 * 展示 agents/spec/ 下所有 feature 的 pipeline_status 总览。
 */
export async function runStatus(cwd = process.cwd()) {
  console.log(chalk.bold('\n📊 stackwise status\n'));

  const specRoot = join(cwd, AGENTS_DIR, 'spec');
  if (!existsSync(specRoot)) {
    console.log(chalk.yellow('⚠ No agents/spec/ directory yet.'));
    console.log(chalk.gray('  Start a feature with `stackwise run new --prd <url>`.\n'));
    return;
  }

  const entries = readdirSync(specRoot).filter((name) =>
    existsSync(join(specRoot, name, 'plan.json'))
  );
  if (entries.length === 0) {
    console.log(chalk.gray('  (no features found)\n'));
    return;
  }

  const rows = entries.map((name) => {
    try {
      const plan = readPlan(join(specRoot, name, 'plan.json'));
      const step = nextPendingStep(plan);
      return {
        name,
        feature: plan.feature,
        branch: plan.branch,
        status: plan.pipeline_status,
        nextStep: step ? `${step.step} (${step.status})` : '—',
        completedAt: plan.completed_at,
      };
    } catch (err) {
      return { name, feature: '(unreadable)', error: err.message };
    }
  });

  const counts = rows.reduce((acc, r) => {
    acc[r.status || 'error'] = (acc[r.status || 'error'] || 0) + 1;
    return acc;
  }, {});

  console.log(
    chalk.gray(
      '  ' +
        Object.entries(counts)
          .map(([k, v]) => `${statusColor(k)(k)}: ${v}`)
          .join('  ')
    )
  );
  console.log();

  for (const row of rows) {
    if (row.error) {
      console.log(`  ${chalk.red('✗')} ${row.name}  ${chalk.red(row.error)}`);
      continue;
    }
    const color = statusColor(row.status);
    console.log(`  ${color('●')} ${chalk.bold(row.feature)} ${chalk.gray(`[${row.name}]`)}`);
    console.log(`      status : ${color(row.status)}`);
    console.log(`      branch : ${row.branch}`);
    console.log(`      next   : ${row.nextStep}`);
    if (row.completedAt) {
      console.log(`      done   : ${row.completedAt}`);
    }
  }
  console.log();
}

function statusColor(status) {
  if (status === 'completed') return chalk.green;
  if (status === 'abandoned') return chalk.gray;
  if (status === 'in_progress') return chalk.cyan;
  if (status === 'not_started') return chalk.yellow;
  if (status && status.endsWith('_pending')) return chalk.magenta;
  return chalk.red;
}
