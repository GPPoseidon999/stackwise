import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkGit, getRepoVersion, syncStandardsRepo } from '../src/utils/git.js';

test('checkGit reports git availability', () => {
  // 在大多数开发环境里 git 都装了。允许两种结果，但禁止抛异常。
  const result = checkGit();
  assert.equal(typeof result, 'boolean');
});

test('syncStandardsRepo clones a local bare repo into the temp dir', (t) => {
  if (!checkGit()) {
    t.skip('git not installed; skipping');
    return;
  }

  // 准备一个本地裸仓库充当 standards 源
  const sourceDir = mkdtempSync(join(tmpdir(), 'standards-src-'));
  const bareDir = mkdtempSync(join(tmpdir(), 'standards-bare-'));

  try {
    execSync('git init -q', { cwd: sourceDir });
    execSync('git config user.email "test@stackwise.local"', { cwd: sourceDir });
    execSync('git config user.name "stackwise-test"', { cwd: sourceDir });
    execSync('git checkout -q -b main', { cwd: sourceDir });
    writeFileSync(join(sourceDir, 'README.md'), '# fixtures\n');
    execSync('git add .', { cwd: sourceDir });
    execSync('git commit -q -m "init"', { cwd: sourceDir });
    execSync(`git clone -q --bare "${sourceDir}" "${bareDir}"`);

    const result = syncStandardsRepo(bareDir, 'main');
    assert.equal(result.success, true, `expected success, got error: ${result.error}`);
    const version = getRepoVersion(result.path);
    assert.match(version, /^[0-9a-f]{4,}$/, 'version is a short hash');

    // 第二次调用走 pull 分支，仍然成功
    const second = syncStandardsRepo(bareDir, 'main');
    assert.equal(second.success, true);
  } finally {
    rmSync(sourceDir, { recursive: true, force: true });
    rmSync(bareDir, { recursive: true, force: true });
  }
});

test('syncStandardsRepo returns a network error for a bogus URL', (t) => {
  if (!checkGit()) {
    t.skip('git not installed; skipping');
    return;
  }
  const result = syncStandardsRepo('file:///definitely/not/a/repo/here', 'main');
  assert.equal(result.success, false);
  assert.ok(result.error, 'error string is present');
});
