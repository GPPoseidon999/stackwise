import { execSync, spawnSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TEMP_DIR = join(tmpdir(), 'stackwise-standards');

/**
 * 检查 git 是否可用
 */
export function checkGit() {
  try {
    execSync('git --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Clone 或 pull standards-repo 到临时目录
 * @param {string} repoUrl - standards 仓库地址
 * @param {string} branch - 分支名
 * @returns {{ success: boolean, path: string, error?: string }}
 */
export function syncStandardsRepo(repoUrl, branch = 'main') {
  if (!checkGit()) {
    return { success: false, path: '', error: 'git is not installed or not in PATH' };
  }

  try {
    if (existsSync(join(TEMP_DIR, '.git'))) {
      // 已存在：先确认 origin 和 repoUrl 一致，否则删掉重新 clone
      // 避免用户切换 standards_repo（或 fork）时还拉旧仓库
      const originResult = spawnSync('git', ['remote', 'get-url', 'origin'], {
        cwd: TEMP_DIR,
        encoding: 'utf-8',
      });
      const currentOrigin =
        originResult.status === 0 ? originResult.stdout.trim() : null;

      if (currentOrigin !== repoUrl) {
        rmSync(TEMP_DIR, { recursive: true, force: true });
        return cloneRepo(repoUrl, branch);
      }

      // origin 匹配，执行 pull
      const result = spawnSync('git', ['pull', 'origin', branch], {
        cwd: TEMP_DIR,
        encoding: 'utf-8',
        timeout: 30000,
      });
      if (result.status !== 0) {
        // pull 失败，重新 clone
        rmSync(TEMP_DIR, { recursive: true, force: true });
        return cloneRepo(repoUrl, branch);
      }
      return { success: true, path: TEMP_DIR };
    } else {
      return cloneRepo(repoUrl, branch);
    }
  } catch (err) {
    return { success: false, path: '', error: err.message };
  }
}

function cloneRepo(repoUrl, branch) {
  // 清理旧目录
  if (existsSync(TEMP_DIR)) {
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }

  const result = spawnSync(
    'git',
    ['clone', '--depth=1', '--branch', branch, repoUrl, TEMP_DIR],
    { encoding: 'utf-8', timeout: 60000 }
  );

  if (result.status !== 0) {
    const errMsg = result.stderr || result.stdout || 'Unknown git error';
    return { success: false, path: '', error: errMsg.trim() };
  }

  return { success: true, path: TEMP_DIR };
}

/**
 * 获取当前 clone 的 commit hash（用于 active-rules.json 中的 version 字段）
 */
export function getRepoVersion(repoPath = TEMP_DIR) {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: repoPath,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

export { TEMP_DIR };
