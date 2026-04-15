import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { STACK_MAP, STACK_PRIORITY } from '../constants/stack-map.js';

/**
 * 从指定目录读取 package.json，返回检测到的技术栈列表
 * @param {string} cwd - 项目根目录，默认为 process.cwd()
 * @returns {{ stacks: string[], raw: object }} 去重后的技术栈列表 + 原始 package.json
 */
export function detectStacks(cwd = process.cwd()) {
  const pkgPath = join(cwd, 'package.json');

  if (!existsSync(pkgPath)) {
    return { stacks: [], raw: null, error: 'package.json not found' };
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch {
    return { stacks: [], raw: null, error: 'Failed to parse package.json' };
  }

  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
  };

  const detectedSet = new Set();

  for (const pkgName of Object.keys(allDeps)) {
    if (STACK_MAP[pkgName]) {
      detectedSet.add(STACK_MAP[pkgName]);
    }
  }

  // 按 STACK_PRIORITY 排序，未知的追加到末尾
  const stacks = [
    ...STACK_PRIORITY.filter(s => detectedSet.has(s)),
    ...[...detectedSet].filter(s => !STACK_PRIORITY.includes(s)),
  ];

  return { stacks, raw: pkg, error: null };
}
