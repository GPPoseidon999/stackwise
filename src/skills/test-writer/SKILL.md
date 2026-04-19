---
name: test-writer
description: 基于 acceptance.yaml 与本次改动的代码，写单元测试和 E2E 测试，跑测试自动修复，输出 test-report.md，并把 pipeline 推进到完成态。当用户说"写测试"、"生成测试"，或 code-reviewer 结论为通过时触发使用。
metadata:
  pattern: pipeline+generator
  model: claude-sonnet-4-6
  stage: test_writer
  reads:
    - agents/instruction.md
    - agents/spec/[feature]/spec.md
    - agents/spec/[feature]/acceptance.yaml
    - agents/spec/[feature]/plan.json
    - agents/spec/[feature]/review.md
    - agents/active-rules.json
    - agents/config/stackwise.json
  writes:
    - <测试源码 — tests/, __tests__/, e2e/ 等>
    - agents/spec/[feature]/test-report.md
    - agents/spec/[feature]/plan.json
    - agents/memory/decisions/[feature].md
---

## 触发前提

- `pipeline_steps[step=code_reviewer].status == done`
- `pipeline_steps[step=test_writer].status == pending`

如果 review.md 里有未处理的 blocker，停下来让 code-writer 先修。

## 输入契约

从 `agents/instruction.md` 读：
- `feature`、`spec_dir`
- `coverage_threshold` — 来自 `agents/config/stackwise.json#test.coverage_threshold`（默认 80）
- `require_edge_cases` — 默认 true

## 执行步骤

### Step 1 — 选择测试框架

先看 `package.json`：
- 有 `vitest` → 单测用 vitest（命令通常 `npm run test` 或 `vitest run`）
- 没 vitest 有 `jest` → 用 jest
- 有 `@playwright/test` → E2E 用 playwright
- 有 `cypress` → E2E 用 cypress

把选中的框架写进 `test-report.md` 的元信息段。没有任何测试框架 → 停下来请用户补装。

### Step 2 — 按需加载规则

从 `active-rules.json` 加载：
- 命中的测试框架规则（`stacks/vitest/`, `stacks/jest/`, `stacks/playwright/` 等）
- `concerns/testing/` 下的全部规则（`test-case-design`、`mock-boundaries`、`e2e-scope`）
- 与本次改动文件相关的 stack 规则（用于理解被测对象，不用于写测试本身）

### Step 3 — 对齐 acceptance

打开 `acceptance.yaml`，把每条 AC 映射到测试类型：

| AC 性质 | 默认落在 |
|--------|---------|
| 纯函数 / 数据转换 / 校验逻辑 | 单测 |
| 组件行为（渲染、事件、派发 action） | 单测 |
| 跨页面 / 跨接口 / 真实用户路径 | E2E |
| must_pass: false 的 AC | 单测即可，不强制 E2E |

在 test-report.md 的"AC 覆盖计划"段列出映射，让用户能在最终报告里看到每条 AC 去了哪。

### Step 4 — 写单测

按 spec.md 里的 **边界条件** 段为每个函数 / 组件写：
- happy path 至少 1 条
- 每条边界条件至少 1 条
- 异常路径（错误输入、接口失败、超时）至少 1 条
- 外部依赖（fetch、db、clock）**在 boundary 上** mock（遵守 `concerns/testing/mock-boundaries`），不 mock 被测单元自身

测试文件命名跟随项目已有约定（先读一下 `tests/` 或 `__tests__/` 里的现成文件）。

### Step 5 — 写 E2E

每条 `must_pass: true` 且映射到 E2E 的 AC → 至少一个 playwright/cypress 用例：
- 用语义 locator（`getByRole`、`getByLabelText`），禁 CSS nth-child
- 不用 `waitForTimeout`，用 `toBeVisible` / `toHaveText` 的轮询断言
- 每个用例独立（不依赖前一个用例遗留的状态）

### Step 6 — 自愈循环

```
run unit tests
  → 全过 → 记录覆盖率 → 下一步
  → 失败 → 分析原因：
      测试写错 → 改测试
      代码 bug → 改代码（少量）并在 decisions 里记录
  → 再跑
run e2e
  → 同上
```

连跑 3 轮仍有失败：停下来，在 `test-report.md` 的失败段列出原始报错，交还用户。**禁止**用 `.skip` / `.todo` 绕过失败。

### Step 7 — 覆盖率校验

跑覆盖率（`vitest --coverage` / `jest --coverage`）：
- 整体覆盖率 ≥ `coverage_threshold` → 过
- 低于阈值 → 定位未被覆盖的函数 / 分支，决定：
  - 是可测的 → 补测试
  - 是生成代码 / 类型声明 / 纯展示 JSX → 在 test-report 的"豁免"段解释

### Step 8 — 写 test-report.md

```markdown
# [功能名] 测试报告

- feature: [feature id]
- framework: vitest + playwright
- generated_at: [YYYY-MM-DD HH:mm]

## 结论
单测：xx/xx 通过，覆盖率 xx%（阈值 xx%）
E2E：xx/xx 通过
状态：[通过 / 待修复]

## AC 覆盖
| AC | 文本 | 测试类型 | 测试文件 | 结果 |
|----|------|---------|----------|------|
| a1b2 | … | unit | tests/user.test.ts::"...应..." | ✅ |
| c3d4 | … | e2e  | e2e/login.spec.ts::"..." | ✅ |

## 失败（如有）
…

## 覆盖率豁免
- src/types.ts：纯类型声明，不纳入分母
```

### Step 9 — 回写 plan.json

- 所有测试通过 + AC 全覆盖 + 覆盖率达标 → `pipeline_steps[step=test_writer].status` = `done`、`pipeline_status` = `done`
- 否则 → `pipeline_steps[step=test_writer].status` = `blocked`，在 `notes` 里写阻塞原因

### Step 10 — 追加 decisions/[feature].md

记录：
- 覆盖率豁免项 + 原因
- 为写测而调整的代码
- 对 test-case-design 规则的非平凡解读

### Step 11 — 交付

**如果 pipeline_status == done**：回复里列出本次 feature 的 4 份产物：
- `[spec_dir]/prd.md`
- `[spec_dir]/spec.md`
- `[spec_dir]/review.md`
- `[spec_dir]/test-report.md`

并提示主 agent：「feature [feature id] 完成。可以 merge 了 —— 或者运行 `stackwise memory promote [feature]` 把本次 decisions 归档。」

**如果 blocked**：明确告知失败的测试 + 下一步由谁解决。

## 失败模式

- acceptance.yaml 里某条 AC 在单测 + E2E 都没法落到测试里（例如"系统可用性 99.9%"这种不可单测的 AC）→ 在 test-report 的"测试不可达"段列出，`must_pass` 保持但结论标 "📋 待人工验证"，pipeline 仍可置 done。
- 覆盖率工具跑不起来（项目没接）→ 停下来请用户启用；不要改 `coverage_threshold` 绕过。
