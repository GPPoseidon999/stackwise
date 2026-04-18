import { existsSync, readFileSync, writeFileSync } from 'fs';
import { StackwiseError } from './error.js';

/**
 * plan.json 校验与拓扑工具。
 * plan.json 是流水线唯一执行真源，spec.md 的 tasks section 锁定后只是人可读规划。
 */

export const REQUIRED_FIELDS = [
  'feature',
  'branch',
  'spec_dir',
  'pipeline_status',
  'pipeline_steps',
  'tasks',
];

export const VALID_PIPELINE_STATUSES = [
  'not_started',
  'prd_review_pending',
  'spec_review_pending',
  'in_progress',
  'review_pending',
  'completed',
  'abandoned',
];

export const VALID_STEP_STATUSES = ['not_started', 'pending', 'in_progress', 'done'];

export const VALID_TASK_STATUSES = ['not_started', 'pending', 'in_progress', 'done', 'failed'];

export const TASK_REQUIRED_FIELDS = ['id', 'title', 'status', 'skill', 'model', 'depends_on'];

export const VALID_SKILLS = [
  'prd-reader',
  'spec-writer',
  'code-writer',
  'code-reviewer',
  'test-writer',
];

export const VALID_MODELS = ['claude-opus-4-6', 'claude-sonnet-4-6'];

export const VALID_PIPELINE_STEPS = [
  'prd_reader',
  'prd_approval',
  'spec_writer',
  'spec_approval',
  'code_writer',
  'code_reviewer',
  'test_writer',
];

/**
 * 读 plan.json，解析失败抛 config 错误。
 */
export function readPlan(planPath) {
  if (!existsSync(planPath)) {
    throw new StackwiseError(
      'config',
      `plan.json not found: ${planPath}`,
      'Run `stackwise run new --prd <url>` to create a new feature plan'
    );
  }
  try {
    return JSON.parse(readFileSync(planPath, 'utf-8'));
  } catch (err) {
    throw new StackwiseError(
      'config',
      `plan.json is not valid JSON: ${planPath}`,
      'Restore from git, or fix the JSON syntax manually',
      err.message
    );
  }
}

export function writePlan(planPath, plan) {
  writeFileSync(planPath, JSON.stringify(plan, null, 2) + '\n', 'utf-8');
}

/**
 * 格式校验：返回 StackwiseError[]。空数组表示通过。
 */
export function validatePlanFormat(plan, sourcePath = 'plan.json') {
  const errors = [];

  if (!plan || typeof plan !== 'object') {
    return [
      new StackwiseError(
        'config',
        `${sourcePath} root is not an object`,
        'plan.json must be a JSON object'
      ),
    ];
  }

  for (const field of REQUIRED_FIELDS) {
    if (plan[field] === undefined || plan[field] === null) {
      errors.push(
        new StackwiseError(
          'config',
          `${sourcePath} missing required field: \`${field}\``,
          `Add \`${field}\` per the v2.7 plan.json schema`
        )
      );
    }
  }

  if (plan.pipeline_status && !VALID_PIPELINE_STATUSES.includes(plan.pipeline_status)) {
    errors.push(
      new StackwiseError(
        'config',
        `${sourcePath} pipeline_status \`${plan.pipeline_status}\` is invalid`,
        `Allowed values: ${VALID_PIPELINE_STATUSES.join(', ')}`
      )
    );
  }

  if (plan.pipeline_steps && !Array.isArray(plan.pipeline_steps)) {
    errors.push(
      new StackwiseError(
        'config',
        `${sourcePath} pipeline_steps must be an array`,
        'See architecture doc §6.1 for the canonical pipeline_steps shape'
      )
    );
  } else if (Array.isArray(plan.pipeline_steps)) {
    plan.pipeline_steps.forEach((step, idx) => {
      if (!step || typeof step !== 'object') {
        errors.push(
          new StackwiseError(
            'config',
            `${sourcePath} pipeline_steps[${idx}] must be an object`,
            'Each step needs at least `step` and `status` fields'
          )
        );
        return;
      }
      if (!step.step) {
        errors.push(
          new StackwiseError(
            'config',
            `${sourcePath} pipeline_steps[${idx}] missing \`step\``,
            `Use one of: ${VALID_PIPELINE_STEPS.join(', ')}`
          )
        );
      }
      if (step.status && !VALID_STEP_STATUSES.includes(step.status)) {
        errors.push(
          new StackwiseError(
            'config',
            `${sourcePath} pipeline_steps[${idx}].status \`${step.status}\` is invalid`,
            `Allowed: ${VALID_STEP_STATUSES.join(', ')}`
          )
        );
      }
    });
  }

  if (plan.tasks && !Array.isArray(plan.tasks)) {
    errors.push(
      new StackwiseError(
        'config',
        `${sourcePath} tasks must be an array`,
        'Provide an array of task objects, see architecture doc §6.1'
      )
    );
  } else if (Array.isArray(plan.tasks)) {
    plan.tasks.forEach((task, idx) => {
      const ctx = `${sourcePath} tasks[${idx}]`;
      if (!task || typeof task !== 'object') {
        errors.push(
          new StackwiseError('config', `${ctx} must be an object`, 'See task schema in architecture doc')
        );
        return;
      }
      for (const field of TASK_REQUIRED_FIELDS) {
        if (task[field] === undefined || task[field] === null) {
          errors.push(
            new StackwiseError(
              'config',
              `${ctx} missing required field: \`${field}\``,
              `Required task fields: ${TASK_REQUIRED_FIELDS.join(', ')}`
            )
          );
        }
      }
      if (task.status && !VALID_TASK_STATUSES.includes(task.status)) {
        errors.push(
          new StackwiseError(
            'config',
            `${ctx}.status \`${task.status}\` is invalid`,
            `Allowed: ${VALID_TASK_STATUSES.join(', ')}`
          )
        );
      }
      if (task.skill && !VALID_SKILLS.includes(task.skill)) {
        errors.push(
          new StackwiseError(
            'config',
            `${ctx}.skill \`${task.skill}\` is not in the supported skill list`,
            `Allowed skills: ${VALID_SKILLS.join(', ')}`
          )
        );
      }
      if (task.model && !VALID_MODELS.includes(task.model)) {
        errors.push(
          new StackwiseError(
            'config',
            `${ctx}.model \`${task.model}\` is not in the supported model list`,
            `Allowed models: ${VALID_MODELS.join(', ')}`
          )
        );
      }
      if (task.depends_on && !Array.isArray(task.depends_on)) {
        errors.push(
          new StackwiseError(
            'config',
            `${ctx}.depends_on must be an array of task ids`,
            'Use [] for tasks with no dependencies'
          )
        );
      }
    });
  }

  return errors;
}

/**
 * 拓扑校验：检测循环依赖与不存在的 task id，返回拓扑顺序。
 *
 * @returns {{ errors: StackwiseError[], order: Array<string|number> }}
 */
export function topoCheck(tasks, sourcePath = 'plan.json') {
  const errors = [];
  if (!Array.isArray(tasks)) {
    return { errors: [], order: [] };
  }

  const idMap = new Map(); // id → task
  for (const task of tasks) {
    if (task && task.id !== undefined && task.id !== null) {
      if (idMap.has(task.id)) {
        errors.push(
          new StackwiseError(
            'config',
            `${sourcePath} duplicate task id: ${task.id}`,
            'Each task id must be unique within a plan'
          )
        );
      }
      idMap.set(task.id, task);
    }
  }

  // 校验依赖引用合法性
  for (const task of tasks) {
    if (!Array.isArray(task?.depends_on)) continue;
    for (const dep of task.depends_on) {
      if (!idMap.has(dep)) {
        errors.push(
          new StackwiseError(
            'config',
            `${sourcePath} task \`${task.id}\` depends on unknown id \`${dep}\``,
            'Remove the missing dependency or add the referenced task'
          )
        );
      }
    }
  }

  // DFS 检测循环依赖
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map([...idMap.keys()].map((id) => [id, WHITE]));
  const order = [];
  const cycleSeeds = new Set();

  function visit(id, path) {
    const c = color.get(id);
    if (c === GRAY) {
      const cycleStart = path.indexOf(id);
      const cycle = [...path.slice(cycleStart), id].join(' → ');
      if (!cycleSeeds.has(cycle)) {
        cycleSeeds.add(cycle);
        errors.push(
          new StackwiseError(
            'config',
            `${sourcePath} dependency cycle detected: ${cycle}`,
            'Break the cycle by removing one of the depends_on edges'
          )
        );
      }
      return;
    }
    if (c === BLACK) return;
    color.set(id, GRAY);
    const deps = idMap.get(id)?.depends_on ?? [];
    for (const dep of deps) {
      if (idMap.has(dep)) {
        visit(dep, [...path, id]);
      }
    }
    color.set(id, BLACK);
    order.push(id);
  }

  for (const id of idMap.keys()) {
    if (color.get(id) === WHITE) visit(id, []);
  }

  return { errors, order };
}

/**
 * 完整校验：格式 + 拓扑（仅 in_progress 阶段做拓扑）。
 */
export function validatePlan(plan, { runTopo = true, sourcePath = 'plan.json' } = {}) {
  const formatErrors = validatePlanFormat(plan, sourcePath);
  if (!runTopo) return { errors: formatErrors, order: [] };

  const { errors: topoErrors, order } = topoCheck(plan?.tasks ?? [], sourcePath);
  return { errors: [...formatErrors, ...topoErrors], order };
}

/**
 * 找下一个待执行的 pipeline_step。返回 null 表示已全部 done。
 */
export function nextPendingStep(plan) {
  if (!Array.isArray(plan?.pipeline_steps)) return null;
  return plan.pipeline_steps.find((step) => step.status !== 'done') ?? null;
}

/**
 * 找下一个待执行的 task（依赖全部 done 才会返回）。
 */
export function nextRunnableTask(plan) {
  if (!Array.isArray(plan?.tasks)) return null;
  const doneIds = new Set(
    plan.tasks.filter((t) => t.status === 'done').map((t) => t.id)
  );
  return (
    plan.tasks.find(
      (task) =>
        task.status !== 'done' &&
        task.status !== 'failed' &&
        (task.depends_on ?? []).every((dep) => doneIds.has(dep))
    ) ?? null
  );
}
