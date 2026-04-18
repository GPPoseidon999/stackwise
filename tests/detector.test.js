import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectStacks } from '../src/utils/detector.js';

function withTempProject(pkg, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'stackwise-detector-'));
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('detectStacks maps known packages to stack names', () => {
  withTempProject(
    {
      name: 'demo',
      dependencies: { react: '^18', 'react-router-dom': '^6', tailwindcss: '^3' },
      devDependencies: { typescript: '^5', vitest: '^1' },
    },
    (dir) => {
      const { stacks, error } = detectStacks(dir);
      assert.equal(error, null);
      assert.ok(stacks.includes('react'), 'detects react');
      assert.ok(stacks.includes('typescript'), 'detects typescript');
      assert.ok(stacks.includes('react-router'), 'maps react-router-dom → react-router');
      assert.ok(stacks.includes('tailwind'), 'detects tailwind');
      assert.ok(stacks.includes('vitest'), 'detects vitest');
    }
  );
});

test('detectStacks safely skips unknown packages', () => {
  withTempProject(
    { name: 'demo', dependencies: { 'unknown-pkg-foobar': '^1' } },
    (dir) => {
      const { stacks, error } = detectStacks(dir);
      assert.equal(error, null);
      assert.deepEqual(stacks, [], 'unknown packages produce empty stack list');
    }
  );
});

test('detectStacks reports missing package.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stackwise-detector-'));
  try {
    const { stacks, error } = detectStacks(dir);
    assert.equal(error, 'package.json not found');
    assert.deepEqual(stacks, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('detectStacks dedupes packages mapping to the same stack', () => {
  withTempProject(
    {
      name: 'demo',
      dependencies: { 'react-router': '^6', 'react-router-dom': '^6' },
    },
    (dir) => {
      const { stacks } = detectStacks(dir);
      assert.deepEqual(
        stacks.filter((s) => s === 'react-router'),
        ['react-router']
      );
    }
  );
});
