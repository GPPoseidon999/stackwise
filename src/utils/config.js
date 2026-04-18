import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { StackwiseError } from './error.js';

const CONFIG_FILE = 'stackwise.config.json';

/**
 * v2.7 默认配置。auto_sync 作为向下兼容字段保留。
 */
export const DEFAULT_CONFIG = {
  standards_repo: 'https://github.com/GPPoseidon999/stackwise-standards',
  standards_path: '',
  branch: 'main',
  auto_sync: true,
  memory: {
    index_max_tokens: 2000,
    retention_days: 30,
  },
  token_budget: {
    total: 1000000,
    reserved_for_output: 128000,
    instruction_budget: 872000,
    warn_threshold: 500000,
  },
  test: {
    coverage_threshold: 80,
    require_edge_cases: true,
  },
};

/**
 * 读取 stackwise.config.json。不存在时返回默认配置并打上 _isDefault 标记。
 * 解析失败时抛 StackwiseError('config')。
 */
export function readConfig(cwd = process.cwd()) {
  const configPath = join(cwd, CONFIG_FILE);
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG, _isDefault: true };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (err) {
    throw new StackwiseError(
      'config',
      `Failed to parse ${CONFIG_FILE}: invalid JSON`,
      `Check syntax of ${CONFIG_FILE}, or delete it and run \`stackwise init\` again`,
      err.message
    );
  }
  return mergeConfig(DEFAULT_CONFIG, raw, { _isDefault: false });
}

/**
 * 深合并两层配置（一级字段直接覆盖，嵌套对象做浅合并）。
 */
function mergeConfig(base, override, extras = {}) {
  const merged = { ...base, ...override, ...extras };
  for (const key of ['memory', 'token_budget', 'test']) {
    merged[key] = { ...base[key], ...(override?.[key] ?? {}) };
  }
  return merged;
}

/**
 * 写入 stackwise.config.json，去除 _isDefault 这类内部标记。
 */
export function writeConfig(config, cwd = process.cwd()) {
  const configPath = join(cwd, CONFIG_FILE);
  const { _isDefault, ...cleanConfig } = config;
  writeFileSync(configPath, JSON.stringify(cleanConfig, null, 2) + '\n', 'utf-8');
}

/**
 * 初始化 config 文件（已存在时不覆盖）。
 * @returns {boolean} 是否新创建
 */
export function initConfig(overrides = {}, cwd = process.cwd()) {
  const configPath = join(cwd, CONFIG_FILE);
  if (existsSync(configPath)) {
    return false;
  }
  writeConfig(mergeConfig(DEFAULT_CONFIG, overrides), cwd);
  return true;
}

/**
 * 批量校验 config，用于 ensureOrExit。
 */
export function validateConfig(config) {
  const errors = [];
  if (!config.standards_repo || typeof config.standards_repo !== 'string') {
    errors.push(
      new StackwiseError(
        'config',
        '`standards_repo` is missing from stackwise.config.json',
        'Run `stackwise init` to regenerate the config file, or fill in the repo URL manually'
      )
    );
  }
  const budget = config.token_budget ?? {};
  if (budget.warn_threshold && budget.total && budget.warn_threshold > budget.total) {
    errors.push(
      new StackwiseError(
        'config',
        '`token_budget.warn_threshold` is larger than `token_budget.total`',
        'Lower warn_threshold, or raise total — warn_threshold must be <= total'
      )
    );
  }
  const test = config.test ?? {};
  if (
    typeof test.coverage_threshold === 'number' &&
    (test.coverage_threshold < 0 || test.coverage_threshold > 100)
  ) {
    errors.push(
      new StackwiseError(
        'config',
        '`test.coverage_threshold` must be between 0 and 100',
        'Set a percentage like 80 or 90 in stackwise.config.json'
      )
    );
  }
  return errors;
}

export { CONFIG_FILE };
