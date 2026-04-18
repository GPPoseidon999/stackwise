import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  nextPendingStep,
  nextRunnableTask,
  topoCheck,
  validatePlanFormat,
  validatePlan,
} from '../src/utils/plan.js';

function basePlan(overrides = {}) {
  return {
    feature: 'demo',
    branch: 'demo-20260101',
    spec_dir: 'agents/spec/01ABC-demo',
    pipeline_status: 'in_progress',
    pipeline_steps: [
      { step: 'prd_reader', status: 'done' },
      { step: 'spec_writer', status: 'done' },
      { step: 'code_writer', status: 'in_progress' },
    ],
    tasks: [
      { id: 1, title: 'A', status: 'done', skill: 'code-writer', model: 'claude-opus-4-6', depends_on: [] },
      { id: 2, title: 'B', status: 'pending', skill: 'code-writer', model: 'claude-opus-4-6', depends_on: [1] },
    ],
    ...overrides,
  };
}

test('validatePlanFormat passes a well-formed plan', () => {
  assert.deepEqual(validatePlanFormat(basePlan()), []);
});

test('validatePlanFormat reports missing required fields', () => {
  const errors = validatePlanFormat({ feature: 'x' });
  const msgs = errors.map((e) => e.message);
  assert.ok(msgs.some((m) => m.includes('branch')));
  assert.ok(msgs.some((m) => m.includes('spec_dir')));
  assert.ok(msgs.some((m) => m.includes('pipeline_status')));
  assert.ok(msgs.some((m) => m.includes('pipeline_steps')));
  assert.ok(msgs.some((m) => m.includes('tasks')));
});

test('validatePlanFormat rejects unknown skills and models', () => {
  const plan = basePlan({
    tasks: [
      {
        id: 1,
        title: 'A',
        status: 'pending',
        skill: 'mystery-skill',
        model: 'gpt-9000',
        depends_on: [],
      },
    ],
  });
  const errors = validatePlanFormat(plan);
  const msgs = errors.map((e) => e.message);
  assert.ok(msgs.some((m) => m.includes('mystery-skill')));
  assert.ok(msgs.some((m) => m.includes('gpt-9000')));
});

test('validatePlanFormat rejects bad pipeline_status', () => {
  const errors = validatePlanFormat(basePlan({ pipeline_status: 'in_review' }));
  assert.ok(errors.some((e) => e.message.includes('in_review')));
});

test('topoCheck detects cycles', () => {
  const tasks = [
    { id: 1, title: 'A', status: 'pending', skill: 'code-writer', model: 'claude-opus-4-6', depends_on: [2] },
    { id: 2, title: 'B', status: 'pending', skill: 'code-writer', model: 'claude-opus-4-6', depends_on: [1] },
  ];
  const { errors } = topoCheck(tasks);
  assert.ok(errors.some((e) => e.message.toLowerCase().includes('cycle')));
});

test('topoCheck flags references to unknown ids', () => {
  const tasks = [
    { id: 1, title: 'A', status: 'pending', skill: 'code-writer', model: 'claude-opus-4-6', depends_on: [42] },
  ];
  const { errors } = topoCheck(tasks);
  assert.ok(errors.some((e) => e.message.includes('unknown id')));
});

test('topoCheck returns a valid topological order', () => {
  const tasks = [
    { id: 3, title: 'C', status: 'pending', skill: 'code-writer', model: 'claude-opus-4-6', depends_on: [1, 2] },
    { id: 1, title: 'A', status: 'done', skill: 'code-writer', model: 'claude-opus-4-6', depends_on: [] },
    { id: 2, title: 'B', status: 'done', skill: 'code-writer', model: 'claude-opus-4-6', depends_on: [1] },
  ];
  const { errors, order } = topoCheck(tasks);
  assert.deepEqual(errors, []);
  assert.equal(order[order.length - 1], 3, 'C must come last because both deps must precede it');
  assert.ok(order.indexOf(1) < order.indexOf(2));
});

test('nextPendingStep / nextRunnableTask honor dependencies', () => {
  const plan = basePlan();
  const step = nextPendingStep(plan);
  assert.equal(step.step, 'code_writer');
  const task = nextRunnableTask(plan);
  assert.equal(task.id, 2);
});

test('validatePlan combines format + topo when requested', () => {
  const plan = basePlan({
    tasks: [
      { id: 1, title: 'A', status: 'pending', skill: 'code-writer', model: 'claude-opus-4-6', depends_on: [2] },
      { id: 2, title: 'B', status: 'pending', skill: 'code-writer', model: 'claude-opus-4-6', depends_on: [1] },
    ],
  });
  const { errors } = validatePlan(plan);
  assert.ok(errors.some((e) => e.message.toLowerCase().includes('cycle')));
});
