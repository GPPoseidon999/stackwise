import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const CONFIG_FILE = 'stackwise.config.json';

const DEFAULT_CONFIG = {
  standards_repo: 'https://github.com/GPPoseidon999/stackwise-standards',
  standards_path: '',
  branch: 'main',
  auto_sync: true,
};

/**
 * 读取 stackwise.config.json，不存在则返回默认配置
 */
export function readConfig(cwd = process.cwd()) {
  const configPath = join(cwd, CONFIG_FILE);
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG, _isDefault: true };
  }
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    return { ...DEFAULT_CONFIG, ...raw, _isDefault: false };
  } catch {
    return { ...DEFAULT_CONFIG, _isDefault: true };
  }
}

/**
 * 写入 stackwise.config.json
 */
export function writeConfig(config, cwd = process.cwd()) {
  const configPath = join(cwd, CONFIG_FILE);
  const { _isDefault, ...cleanConfig } = config;
  writeFileSync(configPath, JSON.stringify(cleanConfig, null, 2) + '\n', 'utf-8');
}

/**
 * 初始化 stackwise.config.json（如果不存在）
 */
export function initConfig(overrides = {}, cwd = process.cwd()) {
  const configPath = join(cwd, CONFIG_FILE);
  if (!existsSync(configPath)) {
    writeConfig({ ...DEFAULT_CONFIG, ...overrides }, cwd);
    return true; // 新创建
  }
  return false; // 已存在
}
