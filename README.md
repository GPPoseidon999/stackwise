# stackwise

[English](#english) | [中文](#中文)

## English

**Stackwise v2.7** is an AI dev workflow context manager. The CLI is a lightweight launcher; a main agent (Cowork, Codex, etc.) drives the full pipeline from PRD to test report.

### What the CLI does vs. what the main agent does

The CLI only handles the deterministic, repo-local plumbing. It never calls external APIs.

| Concern | CLI | Main agent |
| --- | --- | --- |
| Rules | Sync standards, build `active-rules.json` | Load rules into the per-step instruction pack |
| Pipeline | Launch entry + `plan.json` schema/topology check + git branch | Execute one step at a time + chat-driven approvals |
| Notifications | — | Read `notify.json`, push to Feishu / Slack / ... |
| PRD ingestion | — | Call Feishu Doc API or read a local markdown file |
| Memory | Configure memory params | Read/write memory + `codebase-index.md` around each session |
| Rollback | — | `git checkout main -- .` to revert the feature branch |
| Test quality | — | Static check + actual run + coverage gate |

### Two-repository architecture

| Repository | Purpose |
| --- | --- |
| [`stackwise`](https://github.com/GPPoseidon999/stackwise) | This CLI tool |
| [`stackwise-standards`](https://github.com/GPPoseidon999/stackwise-standards) | Central rule repository — fork it to run your own private rule set |

Teams fork `stackwise-standards` and point `standards_repo` at their fork. The CLI stays untouched.

### Why stackwise

- One launcher, one main agent, one deterministic pipeline across PRD → spec → code → review → test
- `plan.json` is the single source of truth for execution; `acceptance.yaml` is the single source of truth for acceptance criteria
- Each task runs in its own session — no accumulated context drift — with `codebase-index.md` injected as shared ground truth
- Chat-driven approvals at three checkpoints (PRD, spec, review) — no webhooks, no polling
- Feature-level git branching gives a clean rollback boundary
- Three-layer memory (hot `index.md` / warm `decisions/[feature].md` / cold `archive/YYYY-MM.md`) stays parallel-safe by appending, never overwriting
- Local `biz/` rules incubate team conventions until they are mature enough to graduate into `stackwise-standards`

### Requirements

- Node.js >= 18
- Git
- A main agent (Cowork, Codex, or any agent that can read `AGENTS.md` and follow single-step instruction packs)

### Quick start

```bash
# 1. Initialize: detect stacks, pull rules, generate AGENTS.md, inject .gitignore
npx stackwise-cli init

# 2. Start a feature from a Feishu doc (or a local .md file)
npx stackwise-cli run new --prd "https://xxx.feishu.cn/docx/Abc123"

# 3. Resume a feature later
npx stackwise-cli run [feature]
```

After `run new`, the CLI creates a feature branch (`<english-name>-YYYYMMDD`), initializes `plan.json`, and hands off to the main agent. The agent reads `AGENTS.md`, walks the pipeline, and pauses at each approval checkpoint for your reply in chat.

### Pipeline at a glance

```
PRD input (Feishu URL or local .md)
    │
    ▼
[prd-reader]  →  prd.md
    │
    ▼  ── approval #1 (chat) ──
    │
[spec-writer] →  spec.md + acceptance.yaml
    │  (CLI validates plan.json schema + topology)
    ▼  ── approval #2 (chat) ──
    │
[code-writer] ×N tasks (one session per task, deps injected)
    │  (codebase-index.md updated incrementally)
    ▼
[code-reviewer] → review.md
    │
    ▼  ── approval #3 (chat, if semantic issues) ──
    │
[test-writer] → tests + test-report.md (static + run + coverage)
    │
    ▼
Final report → human decides merge strategy
Decisions written to memory/decisions/[feature].md
```

### Commands

| Command | Description |
| --- | --- |
| `stackwise init` | Detect stacks, pull rules, generate `AGENTS.md`, inject `.gitignore` |
| `stackwise init --force` | Force re-initialize (requires typing the project name to confirm) |
| `stackwise sync` | Pull standards updates (preserves `biz/`) and sync `CHANGELOG.md` |
| `stackwise detect` | Detect stacks from `package.json` without writing anything |
| `stackwise list` | Print the current active rules and manifest metadata |
| `stackwise add <stack>` | Add one stack rule manually |
| `stackwise remove <stack>` | Remove one stack rule manually |
| `stackwise run new --prd <url\|path>` | Start a new feature: create branch, init `plan.json`, launch main agent |
| `stackwise run [feature]` | Continue a feature: validate `plan.json`, launch main agent |
| `stackwise status` | Overview of every feature's `pipeline_status` |
| `stackwise stats` | Aggregate run metrics (filter with `--skill` / `--model`) |
| `stackwise doctor` | Diagnose config issues and suggest fixes |
| `stackwise memory show` | View `agents/memory/index.md` |
| `stackwise memory clean` | Manually trigger memory archive/cleanup |
| `stackwise lint-rules` | Validate frontmatter of every file in `agents/rules/` |

### Configuration

`stackwise.config.json` in the target project root:

```json
{
  "standards_repo": "https://github.com/GPPoseidon999/stackwise-standards",
  "branch": "main",
  "memory": {
    "index_max_tokens": 2000,
    "retention_days": 30
  },
  "token_budget": {
    "total": 1000000,
    "reserved_for_output": 128000,
    "instruction_budget": 872000,
    "warn_threshold": 500000
  },
  "test": {
    "coverage_threshold": 80,
    "require_edge_cases": true
  }
}
```

Notification channels live in `agents/config/notify.json` (managed by the main agent, not the CLI).

### Output tree after init

```text
AGENTS.md                        ← Single entrypoint for the main agent
stackwise.config.json
agents/                          ← Entire dir is gitignored by default
  rules/
    react/ typescript/ ...       ← Managed by `stackwise sync`
    biz/                         ← Team-local rules (not in git)
      _template.md
      _example-order-state.md
  skills/
    prd-reader/SKILL.md
    spec-writer/SKILL.md
    code-writer/SKILL.md
    code-reviewer/SKILL.md
    test-writer/SKILL.md
  schemas/
    prd.schema.yaml
    spec.schema.yaml
    review.schema.yaml
  memory/
    index.md                     ← Hot layer, <=2000 tokens, append-only
    codebase-index.md            ← Shared code-base ground truth
    decisions/[feature].md       ← Warm layer, feature-scoped
    archive/YYYY-MM.md           ← Cold layer, monthly
    conventions.md
  spec/[ulid]-[slug]/
    prd.md spec.md acceptance.yaml plan.json review.md test-report.md
  config/
    notify.json
  evals/
  metrics.jsonl
  active-rules.json
```

### Key concepts

**`plan.json` — the single execution truth.** Once `spec.md`'s `tasks` section is compiled into `plan.json`, the spec is locked; any further change goes through `plan.json`. As tasks complete, the main agent ticks `[ ]` → `[x]` in `spec.md` so it stays readable as a human progress board.

**`acceptance.yaml` — the single AC truth.** Each AC has a content-hash `id` (e.g. `AC-a3f2`). Regenerations with >90% similarity reuse the old id, so ACs stop drifting between iterations. `spec.md` only references ids — never duplicates AC text.

**`codebase-index.md` — shared code-base ground truth.** Built once at the start of a feature, incrementally updated after each task. Records existing interfaces, utility functions, test coverage, and naming conventions. Every skill reads from it instead of re-scanning the repo.

**Feature-level rollback.** Every `run new` creates a dedicated branch (`<english-name>-YYYYMMDD`); `main` is never touched during a feature. To roll back, the main agent runs `git checkout main -- .` on the feature branch.

**Chat-driven approvals.** Approval nodes don't poll files or wait on webhooks. The main agent posts a summary in chat; you reply with `approved` to continue, or with edits to trigger a regeneration.

**biz/ rules.** Write team-specific conventions under `agents/rules/biz/` using the standard frontmatter (`owner`, `last_reviewed`, etc.). Once a rule proves itself, graduate it into `stackwise-standards` via PR.

### Skills

| Skill | Model | Input | Output |
| --- | --- | --- | --- |
| `prd-reader` | claude-sonnet-4-6 | Feishu doc content or local markdown | `prd.md` (unknown sections marked pending) |
| `spec-writer` | claude-sonnet-4-6 | `prd.md` + `codebase-index.md` | `spec.md` + `acceptance.yaml` (with AC self-check and interface conflict detection) |
| `code-writer` | claude-opus-4-6 | Per-task instruction pack + upstream outputs | Business code (fresh session per task) |
| `code-reviewer` | claude-sonnet-4-6 | `spec.md` + `acceptance.yaml` + code | Structured `review.md` (semantic vs. auto-fixable buckets) |
| `test-writer` | claude-sonnet-4-6 | `acceptance.yaml` + `codebase-index.md` | Tests + `test-report.md` (static check + actual run + coverage gate) |

All summary/distillation work is done by the main agent itself (`claude-sonnet-4-6`). Haiku is not used anywhere in v2.7.

### Local development

```bash
npm install
npm run dev -- --help
npm run dev -- detect
npm run dev -- init
npm run dev -- run new --prd ./examples/sample-prd.md
npm test
```

### Contributing

Issues and pull requests are welcome. To add or improve rules, please contribute to [`stackwise-standards`](https://github.com/GPPoseidon999/stackwise-standards) instead of this repo.

### License

MIT

---

## 中文

**Stackwise v2.7** 是一个 AI 开发上下文管理器。CLI 是轻量启动器，主 agent（Cowork、Codex 等）负责驱动从 PRD 到测试报告的完整流水线。

### CLI 和主 agent 的职责划分

CLI 只负责仓库内的确定性工作，不调用任何外部 API。

| 职责 | CLI 管 | 主 agent 管 |
| --- | --- | --- |
| 规则 | 从 standards 同步，生成 `active-rules.json` | 把规则加载到单步指令包里 |
| 流程 | 启动入口 + `plan.json` 格式/拓扑校验 + git branch | 按步执行 + 对话驱动审批 |
| 通知 | 不涉及 | 读 `notify.json`，推飞书 / Slack 等 |
| PRD 输入 | 不涉及 | 调飞书文档 API 或读本地 MD 文件 |
| 记忆 | 配置 memory 参数 | session 前后读写 memory + `codebase-index.md` |
| 回滚 | 不涉及 | `git checkout main -- .` 撤回 feature 分支变更 |
| 测试质量 | 不涉及 | 静态检查 + 实际运行 + 覆盖率校验 |

### 双仓库架构

| 仓库 | 用途 |
| --- | --- |
| [`stackwise`](https://github.com/GPPoseidon999/stackwise) | CLI 工具本身 |
| [`stackwise-standards`](https://github.com/GPPoseidon999/stackwise-standards) | 中央规范仓库 —— fork 它来维护自己的私有规范 |

团队 fork `stackwise-standards`，把 `standards_repo` 指向自己的 fork 即可，不需要改 CLI 代码。

### 为什么需要 stackwise

- 一个启动器、一个主 agent、一条确定性流水线贯穿 PRD → spec → code → review → test
- `plan.json` 是执行的唯一真源，`acceptance.yaml` 是验收标准的唯一真源
- 每个 task 独立 session，不累积上下文漂移；所有 skill 共享 `codebase-index.md` 作为代码库基准
- 三个审批节点（PRD、spec、review）全部对话驱动，不轮询、不监听 webhook
- Feature 级 git 分支，回滚边界清晰
- 三层记忆（热 `index.md` / 温 `decisions/[feature].md` / 冷 `archive/YYYY-MM.md`）全部追加写入，并行安全
- 本地 `biz/` 规则孵化团队约定，成熟后提取到 `stackwise-standards`

### 环境要求

- Node.js >= 18
- Git
- 一个主 agent（Cowork、Codex，或任何能读 `AGENTS.md` 并按单步指令包执行的 agent）

### 快速开始

```bash
# 1. 初始化：检测技术栈、拉规则、生成 AGENTS.md、注入 .gitignore
npx stackwise-cli init

# 2. 从飞书文档（或本地 MD）启动一个 feature
npx stackwise-cli run new --prd "https://xxx.feishu.cn/docx/Abc123"

# 3. 之后继续执行
npx stackwise-cli run [feature]
```

`run new` 会创建 feature 分支（`功能英文-YYYYMMDD`）、初始化 `plan.json`，然后把控制权交给主 agent。主 agent 读 `AGENTS.md` 走完流水线，遇到审批节点时在 chat 里等你回复。

### 完整流程图

```
PRD 输入（飞书 URL 或本地 .md）
    │
    ▼
[prd-reader]  →  prd.md
    │
    ▼  ── 审批节点 1（chat） ──
    │
[spec-writer] →  spec.md + acceptance.yaml
    │  (CLI 校验 plan.json 格式和拓扑)
    ▼  ── 审批节点 2（chat） ──
    │
[code-writer] ×N 个 task（每个 task 独立 session，依赖产物注入）
    │  (codebase-index.md 增量更新)
    ▼
[code-reviewer] → review.md
    │
    ▼  ── 审批节点 3（chat，有 semantic 问题时） ──
    │
[test-writer] → 测试代码 + test-report.md（静态 + 运行 + 覆盖率）
    │
    ▼
最终报告 → 人工决定合并方式
决策写入 memory/decisions/[feature].md
```

### 命令说明

| 命令 | 说明 |
| --- | --- |
| `stackwise init` | 检测技术栈 + 拉规则 + 生成 `AGENTS.md` + 注入 `.gitignore` |
| `stackwise init --force` | 强制重新初始化（需要输入项目名二次确认） |
| `stackwise sync` | 重新同步规则（不动 `biz/`）+ 同步 `CHANGELOG.md` |
| `stackwise detect` | 只检测技术栈，不写文件 |
| `stackwise list` | 打印当前激活规则和 manifest 元数据 |
| `stackwise add <stack>` | 手动增加一个技术栈规范 |
| `stackwise remove <stack>` | 手动移除一个技术栈规范 |
| `stackwise run new --prd <url\|path>` | 新建 feature：创建分支 + 初始化 `plan.json` + 启动主 agent |
| `stackwise run [feature]` | 继续执行：校验 `plan.json` + 启动主 agent |
| `stackwise status` | 所有 feature 的 `pipeline_status` 总览 |
| `stackwise stats` | 聚合历史 metrics（支持 `--skill` / `--model` 过滤） |
| `stackwise doctor` | 诊断配置问题，给出修复建议 |
| `stackwise memory show` | 查看 `agents/memory/index.md` |
| `stackwise memory clean` | 手动触发 memory 归档清理 |
| `stackwise lint-rules` | 校验 `agents/rules/` 下所有规则文件的 frontmatter |

### 配置文件

在项目根目录创建 `stackwise.config.json`：

```json
{
  "standards_repo": "https://github.com/GPPoseidon999/stackwise-standards",
  "branch": "main",
  "memory": {
    "index_max_tokens": 2000,
    "retention_days": 30
  },
  "token_budget": {
    "total": 1000000,
    "reserved_for_output": 128000,
    "instruction_budget": 872000,
    "warn_threshold": 500000
  },
  "test": {
    "coverage_threshold": 80,
    "require_edge_cases": true
  }
}
```

通知渠道配置放在 `agents/config/notify.json`（由主 agent 读取，CLI 不涉及）。

### init 后的目录结构

```text
AGENTS.md                        ← 主 agent 统一入口
stackwise.config.json
agents/                          ← 整个目录默认 gitignore
  rules/
    react/ typescript/ ...       ← `stackwise sync` 管理
    biz/                         ← 团队本地维护，不进 git
      _template.md
      _example-order-state.md
  skills/
    prd-reader/SKILL.md
    spec-writer/SKILL.md
    code-writer/SKILL.md
    code-reviewer/SKILL.md
    test-writer/SKILL.md
  schemas/
    prd.schema.yaml
    spec.schema.yaml
    review.schema.yaml
  memory/
    index.md                     ← 热层 ≤2000 token，追加写入
    codebase-index.md            ← 代码库索引
    decisions/[feature].md       ← 温层，按 feature 隔离
    archive/YYYY-MM.md           ← 冷层，按月归档
    conventions.md
  spec/[ulid]-[slug]/
    prd.md spec.md acceptance.yaml plan.json review.md test-report.md
  config/
    notify.json
  evals/
  metrics.jsonl
  active-rules.json
```

### 核心概念

**`plan.json`：执行唯一真源。** `spec.md` 的 tasks section 生成 `plan.json` 后 spec 加锁，后续变更直接改 `plan.json`。每完成一个 task，主 agent 把 `spec.md` 中对应 checkbox 从 `[ ]` 改成 `[x]`，让它作为人可读的进度看板。

**`acceptance.yaml`：AC 唯一真源。** 每条 AC 的 id 基于 description 哈希（如 `AC-a3f2`），重新生成时相似度 >90% 复用旧 id，避免 AC 在迭代中漂移。`spec.md` 验收标准 section 只写引用，不重复 AC 内容。

**`codebase-index.md`：代码库共享基准。** feature 开始时全量扫描生成，每个 task 完成后增量更新。记录已有接口、工具函数、测试覆盖、命名约定。所有 skill 都从这里读代码库状态，不重复扫描。

**Feature 级回滚。** 每次 `run new` 创建独立分支（`功能英文-YYYYMMDD`），feature 期间 `main` 不动。需要回滚时，主 agent 在 feature 分支上跑 `git checkout main -- .`。

**对话驱动审批。** 审批节点不轮询文件、不监听 webhook。主 agent 展示摘要后在 chat 里等待回复——`approved` 继续，否则按修改意见重新生成。

**biz/ 规则。** 在 `agents/rules/biz/` 下写团队内部约定，统一 frontmatter（含 `owner`、`last_reviewed` 等）。规则足够成熟后通过 PR 提取到 `stackwise-standards`。

### Skill 一览

| Skill | 模型 | 输入 | 输出 |
| --- | --- | --- | --- |
| `prd-reader` | claude-sonnet-4-6 | 飞书文档内容或本地 MD | `prd.md`（找不到的 section 标注待确认） |
| `spec-writer` | claude-sonnet-4-6 | `prd.md` + `codebase-index.md` | `spec.md` + `acceptance.yaml`（AC 自检 + 接口冲突检测） |
| `code-writer` | claude-opus-4-6 | 单步指令包 + 依赖产物 | 业务代码（每 task 独立 session） |
| `code-reviewer` | claude-sonnet-4-6 | `spec.md` + `acceptance.yaml` + 代码 | 结构化 `review.md`（semantic / auto-fixable 分档） |
| `test-writer` | claude-sonnet-4-6 | `acceptance.yaml` + `codebase-index.md` | 测试代码 + `test-report.md`（静态 + 运行 + 覆盖率） |

所有摘要提炼操作统一由主 agent 自己完成（`claude-sonnet-4-6`）。v2.7 不再使用 Haiku。

### 本地开发

```bash
npm install
npm run dev -- --help
npm run dev -- detect
npm run dev -- init
npm run dev -- run new --prd ./examples/sample-prd.md
npm test
```

### 贡献

欢迎提 Issue 和 PR。如果想新增或改进规范规则，请向 [`stackwise-standards`](https://github.com/GPPoseidon999/stackwise-standards) 提交。

### 协议

MIT
