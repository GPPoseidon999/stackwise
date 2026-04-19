---
name: spec-writer
description: 读 prd.md + acceptance.yaml，结合 agents/active-rules.json 的当前技术栈写技术方案，产出 spec.md 并把 tasks 写回 plan.json。当用户说"写技术方案"、"生成 spec"，或 prd_approval 通过后由 stackwise run 触发时使用。
metadata:
  pattern: pipeline
  model: claude-sonnet-4-6
  stage: spec_writer
  reads:
    - agents/instruction.md
    - agents/spec/[feature]/prd.md
    - agents/spec/[feature]/acceptance.yaml
    - agents/spec/[feature]/plan.json
    - agents/active-rules.json
    - agents/memory/index.md
    - agents/memory/decisions/[feature].md  # 如果已存在
  writes:
    - agents/spec/[feature]/spec.md
    - agents/spec/[feature]/plan.json
    - agents/memory/decisions/[feature].md
---

## 触发前提

`prd_approval` 必须已经 done（用户在会话里显式说了"通过"）。如果 `pipeline_steps[step=prd_approval].status != done`，停下来报错，不要擅自把它标成 done。

## 输入契约

从 `agents/instruction.md` 读取：
- `feature`、`spec_dir`
- 可选的 `constraints`（用户在 prd_approval 时补充的约束，例如"必须兼容旧版接口"）

## 执行步骤

### Step 1 — 加载上下文
- `prd.md` — 功能点、数据结构、边界条件
- `acceptance.yaml` — 每条 AC 的稳定 id，**后续的 tasks 必须能对应到 AC**
- `agents/active-rules.json` — 项目当前激活的技术栈列表
- `agents/memory/index.md` 的 hot 区 — 近期决策、避免重复踩坑
- 如果 `agents/memory/decisions/[feature].md` 已存在，读进来，在它的基础上追加

### Step 2 — 决定要加载哪些规范

`active-rules.json` 里的每条规则有 `always_apply`、`applies_to`、`signals` 字段：
- `always_apply: true` 且 `applies_to` 包含 `implementation`：全部加载
- `always_apply: false`：只有 PRD / spec 的关键词命中 `signals` 时才加载

**不要**一次性把所有规则塞进 context —— 尊重 `agents/config/stackwise.json` 里的 `token_budget.instruction_budget`。规则加载总字数超出预算时，优先保留 `priority: critical` 和 `priority: high`。

### Step 3 — 设计技术方案

本次需求涉及哪些层就写哪些层（没涉及的不要凑字数）：

**接口设计**：每个新增/修改接口的完整定义 —— Method、路径、请求参数（字段名 / 类型 / 是否必填 / 描述）、响应结构、错误码。

**数据结构**：新增/修改的 TypeScript 类型、数据库 schema、store 结构。给出类型签名，不要伪代码。

**组件设计**：每个新增/修改组件的 Props 完整定义（字段名 / 类型 / 默认值 / 是否必填）、内部状态、关键逻辑一两句话说清楚。

**状态管理**：slice/store 结构、action 列表、selector 列表。

**影响范围**：新增文件、修改文件、接口变更、数据结构变更 —— 具体到路径。

### Step 4 — 拆分 tasks

tasks 必须满足：
- 粒度足够小，单次执行可在 token_budget 内完成。经验值：一个 task 生成 / 修改 ≤ 3 个文件、≤ 200 行。
- 按依赖关系排序，在 `depends_on` 里显式列出依赖的 task id。
- **每个 task 必须在 `covers_ac` 字段里列出它推进的 AC id**（来自 acceptance.yaml），这样 code-reviewer 能校验 AC 被谁覆盖。
- `skill: "code-writer"`、`model: "claude-opus-4-6"`（code 阶段一律用 opus，其它阶段用 sonnet）。

### Step 5 — 回写 plan.json

把 tasks 数组写入 `plan.json`。结构：

```json
{
  "tasks": [
    {
      "id": 1,
      "title": "新增 /api/user/profile GET 接口",
      "status": "pending",
      "skill": "code-writer",
      "model": "claude-opus-4-6",
      "depends_on": [],
      "covers_ac": ["a1b2"],
      "files": ["src/api/user.ts"]
    }
  ]
}
```

同时更新 pipeline：
- `pipeline_steps[step=spec_writer].status` → `done`
- `pipeline_steps[step=spec_approval].status` → `pending`

CLI 会用 `validatePlan`（格式 + 拓扑）来校验；如果 tasks 里有循环依赖或引用了不存在的 id，回写会被拒。

### Step 6 — 生成 spec.md

写入 `[spec_dir]/spec.md`：

```markdown
# [功能名] 技术方案

- feature: [feature id]
- prd: prd.md
- acceptance: acceptance.yaml
- 生成时间: [YYYY-MM-DD HH:mm]

## 影响范围
- 新增文件：…
- 修改文件：…
- 接口变更：…
- 数据结构变更：…

## 设计细节
### 接口
…
### 数据结构
…
### 组件
…
### 状态管理
…

## 任务列表
| # | 标题 | 依赖 | 覆盖 AC | 触及文件 |
|---|------|------|---------|----------|
| 1 | …    | —    | a1b2    | src/api/user.ts |
```

### Step 7 — 追加 decisions/[feature].md

在 `agents/memory/decisions/[feature].md` 里追加（没文件就创建）：

```markdown
## [YYYY-MM-DD] spec_writer 决策

- 选型：… 原因：…
- 没选 … 原因：…
- 已知风险：…
```

只记**非显然的判断**（选型、妥协、风险），不要把 spec.md 的内容复读进来。

### Step 8 — 向主 agent 交付 approval 提示

展示 spec.md 摘要 + tasks 表，然后：

> 技术方案已生成，请 review：
> - [spec_dir]/spec.md
> - [spec_dir]/plan.json（tasks 段）
>
> 回复「通过」进入开发；回复「修改：<意见>」我原地改；回复「拆分 task #N」我会把第 N 个 task 拆得更细。

不要自动触发 code-writer。

## 失败模式

- AC 有一条没有被任何 task 覆盖 → 要么补一个 task，要么在 spec.md 的"已知缺口"里显式声明并请用户确认。
- tasks 数超过 20 → 主动提示用户是否先实现一个 MVP 子集。
- 所需规则的总字数超出 `instruction_budget` → 砍掉 `priority: low/medium` 的 rule，并在回复里说明"本次没加载 X 规则，因为超预算"。
