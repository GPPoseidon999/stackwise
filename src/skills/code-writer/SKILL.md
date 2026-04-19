---
name: code-writer
description: 读 plan.json 里下一个可执行 task，按 spec.md 的设计细节生成代码，跑 lint / 类型检查 / 自动修复，完成后把 task 标 done 并回写 plan.json。当用户说"开始开发"、"执行任务"、"写代码"，或 spec_approval 通过后由 stackwise run 触发时使用。
metadata:
  pattern: pipeline
  model: claude-opus-4-6
  stage: code_writer
  reads:
    - agents/instruction.md
    - agents/spec/[feature]/spec.md
    - agents/spec/[feature]/acceptance.yaml
    - agents/spec/[feature]/plan.json
    - agents/active-rules.json
    - agents/memory/index.md
  writes:
    - <产品源码 — src/, lib/, app/ 等>
    - agents/spec/[feature]/plan.json   # 任务状态、实际触及文件
    - agents/memory/decisions/[feature].md
---

## 触发前提

- `pipeline_steps[step=spec_approval].status == done`
- `plan.json` 通过 `validatePlan`（格式 + 拓扑）
- 至少有一个 `tasks[i].status == "pending"` 且其 `depends_on` 指向的 task 全部 `done`

如果 CLI 的 `nextRunnableTask(plan)` 返回 null，说明已经没有可跑的 task，停下来回到 Step 5。

## 执行模式

**一次只跑一个 task**。每次被触发，只推进一个 task 然后退出 —— 不要在一次会话里把 tasks 跑完。这样做的理由：
- 让主 agent 有机会在两个 task 之间写回 memory、刷新上下文
- 一个 task 失败时，不会连累后面的 task
- 便于和 acceptance.yaml 对账

## 执行步骤

### Step 1 — 锁定当前 task

从 `plan.json` 读 `nextRunnableTask` 的返回值（CLI 已经算好写在 `agents/instruction.md` 的 `current_task` 里）。核对：
- `skill == "code-writer"`
- `status == "pending"`
- `depends_on` 里每个 id 都是 `done`

任何一条不满足就停下来，**不要**自己挑 task 也不要自己改 `depends_on`。

### Step 2 — 按需加载规则

对 `active-rules.json` 做筛选：
- `always_apply: true` 且 `applies_to` 含 `implementation`：加载
- 否则：当前 task 的 `title`、`files`、spec.md 的相关段里包含 rule 的 `signals` 才加载

尊重 `agents/config/stackwise.json` 里的 `token_budget.instruction_budget`。规则总字数超限时，优先保留 `priority: critical/high`，并在最终回复里声明被跳过的规则。

### Step 3 — 加载 spec 的相关切片

不要把整份 spec.md 都塞进来。按 task 的 `files` 和 `covers_ac` 定位到：
- 接口 / 数据结构 / 组件 / 状态管理章节里**跟这个 task 相关**的小节
- acceptance.yaml 里 `id ∈ task.covers_ac` 的 AC 文本

### Step 4 — 生成 / 修改代码

严格遵守：
- 接口字段、类型定义必须和 spec.md 一致。spec.md 没写到的字段不要加。
- 组件 props 必须和 spec.md 一致。
- 命中 signals 的规则全部按 rule body 的 Core rules 执行。冲突时 `priority: critical > high > medium > low`。
- 若规则之间冲突到无法调和，**停下来**请用户定夺，不要二选一。

### Step 5 — 自愈循环（lint + 类型检查）

从 `package.json#scripts` 挑：
- lint（优先 `lint`，其次 `eslint`）
- 类型检查（优先 `type-check` / `typecheck`，其次 `tsc --noEmit`）

伪循环：
```
run lint
  → 0 errors 0 warnings → 过
  → 有 error → 修 → 再跑
  → 只有 warning → 允许过，但记录在 decisions 里
run typecheck
  → 有 error → 修 → 再跑
  → 0 error → 过
```

连跑 3 轮仍然有 error：**停下来**在回复里列出 error 原文，让用户介入。不要把 `@ts-ignore` / `eslint-disable` 当万能逃生符。

### Step 6 — 回写 plan.json

把当前 task：
- `status` → `done`
- `files` → 实际触及的文件路径（可以比 spec 多 / 少，用实际值覆盖）
- 如需要，追加 `notes`（一行话，说本次有什么非预期的调整）

如果 `nextRunnableTask` 返回 null（所有 tasks 都 done），把 `pipeline_steps[step=code_writer].status` → `done`，`pipeline_steps[step=code_reviewer].status` → `pending`。

### Step 7 — 追加 decisions/[feature].md

只记非显然的事：
- 原计划不用 X，实际用了 X，原因
- 规则之间冲突的裁决
- lint 留的 warning 以及理由

### Step 8 — 交付

回复里包含：
1. 当前 task 的 id / 标题 / 状态
2. 触及文件清单（路径）
3. 是否还有 pending tasks；如果有，报下一个 id 并告知主 agent 再次调用本 skill

**不要**自动 review。code-reviewer 由 CLI / 主 agent 在所有 tasks 都 done 后显式触发。

## 失败模式

- CLI 的 `instruction.md` 里 `current_task` 和 `nextRunnableTask(plan)` 不一致 → 以 `plan.json` 为准，报告给主 agent。
- spec.md 的相关切片缺字段（比如接口只写了路径没写参数）→ 停下来回到 spec-writer 阶段，不要自己补。
- 命中的 rule 在 `agents/rules/` 里找不到实体文件 → 停下来让 `stackwise sync` 重跑；这是 sync 漂移的信号。
