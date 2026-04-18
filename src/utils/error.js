import chalk from 'chalk';

/**
 * 统一错误类型。
 *
 * 设计原则：
 *  - 启动前一次性收集全部问题，禁止在流程中途抛出
 *  - 三种 type 决定渲染样式：
 *      'config'   → 用户配置 / 环境问题 (退出码 1)
 *      'network'  → 远程仓库 / 接口问题 (退出码 2)
 *      'internal' → CLI 自身 bug，需要展示 detail (退出码 3)
 */
export class StackwiseError extends Error {
  constructor(type, message, fix = '', detail = '') {
    super(message);
    this.name = 'StackwiseError';
    this.type = type;
    this.fix = fix;
    this.detail = detail;
  }

  toJSON() {
    return {
      type: this.type,
      message: this.message,
      fix: this.fix,
      detail: this.detail,
    };
  }
}

const TYPE_LABEL = {
  config: { tag: 'CONFIG', color: chalk.yellow, exitCode: 1 },
  network: { tag: 'NETWORK', color: chalk.magenta, exitCode: 2 },
  internal: { tag: 'INTERNAL', color: chalk.red, exitCode: 3 },
};

/**
 * 把单个 StackwiseError 渲染到终端。
 */
export function renderError(err) {
  if (!(err instanceof StackwiseError)) {
    console.error(chalk.red('✗ Unexpected error:'), err.message);
    if (err.stack) {
      console.error(chalk.gray(err.stack));
    }
    return 3;
  }

  const meta = TYPE_LABEL[err.type] ?? TYPE_LABEL.internal;
  console.error(`${meta.color(`[${meta.tag}]`)} ${err.message}`);

  if (err.fix) {
    console.error(chalk.gray(`  → fix: ${err.fix}`));
  }

  // 仅在 internal 类型展示 detail，避免给用户暴露无关栈信息
  if (err.type === 'internal' && err.detail) {
    console.error(chalk.gray(`  detail: ${err.detail}`));
  }

  return meta.exitCode;
}

/**
 * 启动前批量校验。校验器返回 StackwiseError[]，本函数把错误一次性渲染并退出。
 *
 * @param {() => StackwiseError[]} validator
 */
export function ensureOrExit(validator) {
  let errors;
  try {
    errors = validator() ?? [];
  } catch (err) {
    errors = [
      new StackwiseError(
        'internal',
        'Pre-flight validator threw an unexpected error',
        'File a bug at https://github.com/GPPoseidon999/stackwise/issues',
        err?.stack || err?.message || String(err)
      ),
    ];
  }

  if (errors.length === 0) {
    return;
  }

  console.error(
    chalk.red(`\n✗ Found ${errors.length} issue(s) before starting:\n`)
  );

  let worstExit = 0;
  for (const err of errors) {
    const code = renderError(err);
    if (code > worstExit) worstExit = code;
  }

  process.exit(worstExit || 1);
}

/**
 * 顶层 catch：包住 commander action handler，避免任何未捕获错误吞掉退出码。
 *
 * 用法：program.command('init').action(wrapAction(runInit))
 */
export function wrapAction(handler) {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (err) {
      const code = renderError(err);
      process.exit(code);
    }
  };
}
