import chalk from 'chalk';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { input } from '@inquirer/prompts';
import { spawnSync } from 'child_process';
import { ulid } from 'ulid';
import { readConfig, validateConfig } from '../utils/config.js';
import {
  AGENTS_DIR,
  countRuleFiles,
  readActiveRules,
} from '../utils/active-rules.js';
import {
  nextPendingStep,
  nextRunnableTask,
  readPlan,
  validatePlan,
  writePlan,
  VALID_PIPELINE_STEPS,
} from '../utils/plan.js';
import { StackwiseError, ensureOrExit } from '../utils/error.js';

/**
 * stackwise run new --prd <url|path>
 *
 * 流程：环境检查 → 生成 ulid → 提取 slug → 创建 git 分支 → 创建 spec 目录 →
 *       初始化 plan.json → 生成任务指令包 → 提示主 agent 启动命令
 */
export async function runNew(options = {}, cwd = process.cwd()) {
  console.log(chalk.bold('\n🏗  stackwise run new\n'));

  const { prd, name } = options;
  if (!prd) {
    throw new StackwiseError(
      'config',
      '`--prd <url|path>` is required for `run new`',
      'Pass a Feishu doc URL or local markdown path, e.g. `stackwise run new --prd ./prd.md`'
    );
  }

  // 环境 batch 校验
  ensureOrExit(() => {
    const errors = [];
    if (!existsSync(join(cwd, 'AGENTS.md'))) {
      errors.push(
        new StackwiseError(
          'config',
          'AGENTS.md not found in project root',
          'Run `stackwise init` to generate AGENTS.md first'
        )
      );
    }
    if (!existsSync(join(cwd, 'stackwise.config.json'))) {
      errors.push(
        new StackwiseError(
          'config',
          'stackwise.config.json not found',
          'Run `stackwise init` first'
        )
      );
    }
    if (!existsSync(join(cwd, AGENTS_DIR, 'rules'))) {
      errors.push(
        new StackwiseError(
          'config',
          'agents/rules/ missing — rules have not been synced',
          'Run `stackwise init` or `stackwise sync`'
        )
      );
    }
    return errors;
  });

  const config = readConfig(cwd);
  ensureOrExit(() => validateConfig(config));

  // 生成 ulid + slug
  const featureUlid = ulid();
  const slug = deriveSlugFromPrd(prd);

  // 交互式或 --name 获取功能英文名
  let englishName = name?.trim();
  if (!englishName) {
    englishName = await input({
      message: 'Feature English name (used for git branch, e.g. user-register):',
      default: slug,
      validate: (v) =>
        /^[a-z0-9][a-z0-9-]*$/.test(v.trim()) || 'Use lowercase letters, digits, and hyphens only',
    });
    englishName = englishName.trim();
  }

  const dateStamp = yyyymmdd(new Date());
  const branchName = `${englishName}-${dateStamp}`;
  const specDir = join(AGENTS_DIR, 'spec', `${featureUlid}-${slug}`);
  const specDirAbs = join(cwd, specDir);

  // 创建 git 分支（忽略失败给出提示，不自动修复）
  const branchResult = spawnSync('git', ['checkout', '-b', branchName], {
    cwd,
    encoding: 'utf-8',
  });
  if (branchResult.status !== 0) {
    const err = (branchResult.stderr || '').trim();
    // 分支已存在 → 切过去继续；其他错误抛出
    if (err.includes('already exists')) {
      console.log(chalk.yellow(`  ⚠ Branch ${branchName} exists, switching to it`));
      const checkout = spawnSync('git', ['checkout', branchName], { cwd, encoding: 'utf-8' });
      if (checkout.status !== 0) {
        throw new StackwiseError(
          'internal',
          `Failed to checkout existing branch ${branchName}`,
          'Switch branches manually, then re-run `stackwise run new`',
          checkout.stderr
        );
      }
    } else {
      throw new StackwiseError(
        'internal',
        `Failed to create git branch ${branchName}`,
        'Run `git status` to inspect, resolve conflicts, then re-run',
        err
      );
    }
  } else {
    console.log(chalk.green(`  ✓ Created branch ${branchName}`));
  }

  // 创建 spec 目录
  mkdirSync(specDirAbs, { recursive: true });
  console.log(chalk.green(`  ✓ Created ${specDir}/`));

  // 初始化 plan.json
  const plan = initialPlan({
    featureEnglish: englishName,
    branchName,
    specDir,
    prd,
  });
  const planPath = join(specDirAbs, 'plan.json');
  writePlan(planPath, plan);
  console.log(chalk.green(`  ✓ Wrote ${join(specDir, 'plan.json')}`));

  // 产出任务指令包
  const instructionPath = join(specDirAbs, 'instruction.md');
  const manifest = readActiveRules(cwd);
  writeFileSync(instructionPath, buildInstruction({
    phase: 'prd_reader',
    feature: plan.feature,
    specDir,
    prd,
    manifest,
    memoryIndex: readFileSafe(join(cwd, AGENTS_DIR, 'memory', 'index.md')),
  }), 'utf-8');
  console.log(chalk.green(`  ✓ Wrote ${join(specDir, 'instruction.md')}`));

  console.log();
  console.log(chalk.bold('Next:'));
  console.log(chalk.gray('  Hand instruction.md to the main agent (Cowork / Codex) to run the'));
  console.log(chalk.gray('  prd-reader skill. When that step completes, run `stackwise run` again'));
  console.log(chalk.gray('  to generate the next step\'s instruction package.\n'));
  console.log(chalk.green(`✓ Feature initialized: ${featureUlid}-${slug}`));
  console.log();
}

/**
 * stackwise run [feature-id]
 *
 * 读取 plan.json → 找首个非 done 的 pipeline_step → 校验 → 生成单步指令包
 */
export async function runContinue(featureIdArg, cwd = process.cwd()) {
  console.log(chalk.bold('\n▶  stackwise run\n'));

  const specRoot = join(cwd, AGENTS_DIR, 'spec');
  if (!existsSync(specRoot)) {
    throw new StackwiseError(
      'config',
      'No agents/spec/ directory — nothing to continue',
      'Start a feature with `stackwise run new --prd <url>`'
    );
  }

  const featureDir = resolveFeatureDir(specRoot, featureIdArg);
  const planPath = join(featureDir, 'plan.json');
  const plan = readPlan(planPath);

  const inTasksPhase = plan.pipeline_status === 'in_progress';
  const { errors, order } = validatePlan(plan, { runTopo: inTasksPhase, sourcePath: planPath });
  ensureOrExit(() => errors);

  const step = nextPendingStep(plan);
  if (!step) {
    console.log(chalk.green('✓ All pipeline steps are done. Feature appears complete.'));
    return;
  }
  console.log(chalk.gray(`  feature   : ${plan.feature}`));
  console.log(chalk.gray(`  spec_dir  : ${plan.spec_dir}`));
  console.log(chalk.gray(`  next step : ${step.step} (${step.status})`));

  const config = readConfig(cwd);
  const manifest = readActiveRules(cwd);

  // 若处于 task 执行阶段，顺便展示下一个可执行 task
  if (step.step === 'code_writer' && Array.isArray(plan.tasks)) {
    const nextTask = nextRunnableTask(plan);
    if (nextTask) {
      console.log(chalk.gray(`  next task : #${nextTask.id} ${nextTask.title}`));
      console.log(chalk.gray(`  topo      : ${order.join(' → ')}`));
    }
  }

  const instructionPath = join(featureDir, 'instruction.md');
  writeFileSync(
    instructionPath,
    buildInstruction({
      phase: step.step,
      feature: plan.feature,
      specDir: plan.spec_dir,
      prd: plan.prd_source ?? '',
      manifest,
      memoryIndex: readFileSafe(join(cwd, AGENTS_DIR, 'memory', 'index.md')),
      tasks: plan.tasks,
    }),
    'utf-8'
  );
  console.log(chalk.green(`\n✓ Wrote ${join(plan.spec_dir, 'instruction.md')}`));
  console.log(chalk.gray('  Hand this to the main agent to execute the current step.\n'));
}

// ── helpers ─────────────────────────────────────────────────────────────

function deriveSlugFromPrd(prd) {
  let base = prd;
  try {
    const url = new URL(prd);
    const segments = url.pathname.split('/').filter(Boolean);
    base = segments.at(-1) || url.hostname;
  } catch {
    base = basename(prd).replace(/\.[^.]+$/, '');
  }
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'feature';
}

function yyyymmdd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function initialPlan({ featureEnglish, branchName, specDir, prd }) {
  return {
    feature: featureEnglish,
    branch: branchName,
    spec_dir: specDir,
    prd_source: prd,
    pipeline_status: 'not_started',
    completed_at: null,
    pipeline_steps: VALID_PIPELINE_STEPS.map((step) => ({ step, status: 'not_started' })),
    tasks: [],
  };
}

function resolveFeatureDir(specRoot, featureIdArg) {
  const entries = readdirSync(specRoot).filter((name) =>
    existsSync(join(specRoot, name, 'plan.json'))
  );
  if (entries.length === 0) {
    throw new StackwiseError(
      'config',
      'No features found under agents/spec/',
      'Start a feature with `stackwise run new --prd <url>`'
    );
  }
  if (!featureIdArg) {
    // 默认取最新 in_progress / not_started 的
    const candidates = entries
      .map((name) => ({ name, planPath: join(specRoot, name, 'plan.json') }))
      .map(({ name, planPath }) => ({ name, plan: safeReadPlan(planPath) }))
      .filter(({ plan }) => plan && plan.pipeline_status !== 'completed' && plan.pipeline_status !== 'abandoned');
    if (candidates.length === 0) {
      throw new StackwiseError(
        'config',
        'No active feature to continue — all features are completed or abandoned',
        'Start a new feature with `stackwise run new --prd <url>`'
      );
    }
    if (candidates.length > 1) {
      throw new StackwiseError(
        'config',
        `Multiple active features (${candidates.length}). Specify one explicitly.`,
        `Try: stackwise run ${candidates[0].name}`
      );
    }
    return join(specRoot, candidates[0].name);
  }
  // 支持前缀匹配 ulid 或完整目录名
  const match = entries.find((name) => name === featureIdArg || name.startsWith(featureIdArg));
  if (!match) {
    throw new StackwiseError(
      'config',
      `Feature not found: ${featureIdArg}`,
      `Available: ${entries.join(', ')}`
    );
  }
  return join(specRoot, match);
}

function safeReadPlan(path) {
  try {
    return readPlan(path);
  } catch {
    return null;
  }
}

function readFileSafe(path) {
  try {
    return existsSync(path) ? readFileSync(path, 'utf-8') : '';
  } catch {
    return '';
  }
}

function buildInstruction({ phase, feature, specDir, prd, manifest, memoryIndex, tasks = [] }) {
  const lines = [];
  lines.push(`# Main agent instruction: ${phase}`);
  lines.push('');
  lines.push(`- feature: ${feature}`);
  lines.push(`- spec_dir: ${specDir}`);
  if (prd) lines.push(`- prd_source: ${prd}`);
  lines.push('');
  lines.push('## Skill to invoke');
  lines.push(`- \`${skillForPhase(phase)}\``);
  lines.push('');
  lines.push('## Inputs');
  lines.push(`- ${specDir}/plan.json`);
  if (phase === 'spec_writer' || phase === 'code_writer' || phase === 'code_reviewer' || phase === 'test_writer') {
    lines.push(`- ${specDir}/prd.md`);
  }
  if (phase === 'code_writer' || phase === 'code_reviewer' || phase === 'test_writer') {
    lines.push(`- ${specDir}/spec.md`);
    lines.push(`- ${specDir}/acceptance.yaml`);
  }
  lines.push('- agents/memory/index.md');
  lines.push('- agents/memory/codebase-index.md');
  lines.push('');
  lines.push('## Active rules');
  if (manifest?.rules?.length) {
    for (const rule of manifest.rules.slice(0, 30)) {
      lines.push(`- ${rule.id} (${rule.priority}) · ${rule.file}`);
    }
    if (manifest.rules.length > 30) {
      lines.push(`- … ${manifest.rules.length - 30} more (see agents/active-rules.json)`);
    }
  } else {
    lines.push('- (no manifest yet — run `stackwise init`)');
  }
  lines.push('');
  if (memoryIndex) {
    lines.push('## Memory index excerpt');
    lines.push('```');
    lines.push(memoryIndex.slice(0, 2000));
    lines.push('```');
    lines.push('');
  }
  if (phase === 'code_writer' && tasks.length) {
    lines.push('## Tasks (topo order)');
    for (const t of tasks) {
      lines.push(`- [${t.status === 'done' ? 'x' : ' '}] #${t.id} ${t.title} · ${t.skill} · ${t.model}`);
    }
    lines.push('');
  }
  lines.push('## Reminders');
  lines.push('- Execute only this single step. Report back and wait for approval.');
  lines.push('- Do not modify lint/formatter configs.');
  lines.push('- Do not touch agents/rules/ (except biz/).');
  lines.push('- Never use --no-verify.');
  return lines.join('\n') + '\n';
}

function skillForPhase(phase) {
  return {
    prd_reader: 'prd-reader',
    prd_approval: '(human approval — no skill)',
    spec_writer: 'spec-writer',
    spec_approval: '(human approval — no skill)',
    code_writer: 'code-writer',
    code_reviewer: 'code-reviewer',
    test_writer: 'test-writer',
  }[phase] || phase;
}
