import chalk from 'chalk';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { AGENTS_DIR } from '../utils/active-rules.js';

/**
 * stackwise stats
 * 聚合 agents/metrics.jsonl + 每个 feature 的 plan.json.tasks[].runs 统计。
 * 支持 --skill / --model 过滤。
 */
export async function runStats(options = {}, cwd = process.cwd()) {
  const { skill: skillFilter, model: modelFilter } = options;
  console.log(chalk.bold('\n📈 stackwise stats\n'));

  const entries = [];

  const metricsPath = join(cwd, AGENTS_DIR, 'metrics.jsonl');
  if (existsSync(metricsPath)) {
    for (const line of readFileSync(metricsPath, 'utf-8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        /* ignore malformed line */
      }
    }
  }

  const specRoot = join(cwd, AGENTS_DIR, 'spec');
  if (existsSync(specRoot)) {
    for (const name of readdirSync(specRoot)) {
      const planPath = join(specRoot, name, 'plan.json');
      if (!existsSync(planPath)) continue;
      let plan;
      try {
        plan = JSON.parse(readFileSync(planPath, 'utf-8'));
      } catch {
        continue;
      }
      for (const task of plan.tasks ?? []) {
        for (const run of task.runs ?? []) {
          entries.push({
            feature: plan.feature,
            task_id: task.id,
            skill: task.skill,
            model: task.model,
            ...run,
          });
        }
      }
    }
  }

  const filtered = entries.filter(
    (e) => (!skillFilter || e.skill === skillFilter) && (!modelFilter || e.model === modelFilter)
  );

  if (filtered.length === 0) {
    console.log(chalk.gray('  (no run records yet)'));
    console.log();
    return;
  }

  const bySkill = groupBy(filtered, 'skill');
  const byModel = groupBy(filtered, 'model');

  console.log(chalk.gray(`  Total runs: ${filtered.length}`));
  if (skillFilter) console.log(chalk.gray(`  Filter     : --skill ${skillFilter}`));
  if (modelFilter) console.log(chalk.gray(`  Filter     : --model ${modelFilter}`));
  console.log();

  renderBreakdown('By skill', bySkill);
  renderBreakdown('By model', byModel);
}

function groupBy(arr, key) {
  const out = {};
  for (const item of arr) {
    const k = item[key] ?? '(unknown)';
    if (!out[k]) out[k] = [];
    out[k].push(item);
  }
  return out;
}

function renderBreakdown(title, groups) {
  console.log(chalk.bold(`  ${title}`));
  for (const [name, items] of Object.entries(groups)) {
    const success = items.filter((i) => i.result === 'success').length;
    const tokens = items.reduce((s, i) => s + (i.token_budget_used || 0), 0);
    const avgMs = items
      .map((i) => deltaMs(i.started_at, i.finished_at))
      .filter((n) => Number.isFinite(n));
    const avg = avgMs.length ? Math.round(avgMs.reduce((a, b) => a + b, 0) / avgMs.length) : 0;
    console.log(
      `    ${chalk.cyan('·')} ${chalk.bold(name.padEnd(14))} runs=${items.length}  success=${success}  avg=${avg}ms  tokens=${tokens}`
    );
  }
  console.log();
}

function deltaMs(start, end) {
  if (!start || !end) return NaN;
  return new Date(end).getTime() - new Date(start).getTime();
}
