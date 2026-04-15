# 研发自动化体系 — Cowork 实施上下文

> 本文档是完整的实施说明，Cowork 按此文档从零构建整套系统，无需额外询问。

---

## 一、项目背景与目标

技术负责人需要一套覆盖完整研发链路的自动化流程，从 PRD 读取到测试报告生成，全程 AI 驱动，人工只在关键节点审批。

**核心原则：**
- 先规划后编码（OpenSpec + Superpowers 理念）
- 规范驱动开发（技术栈规范自动检测匹配）
- 人工保留审批权（spec 审批、review 确认）
- 低成本先跑通，后续可升级为独立产品

---

## 二、完整流程

```
需求会议
    ↓
PRD / 会议纪要（输入文件）
    ↓
stackwise init          ← CLI：检测技术栈，拉取对应规范到 .standards/
    ↓
[Skill: prd-reader]     ← 读取 PRD/会议纪要，输出结构化需求清单
    ↓
[Skill: spec-generator] ← 生成 proposal.md + design.md + tasks.md（YYYY-MM-DD前缀）→ 人工审批
    ↓
人工确认 ✓
    ↓
[Skill: task-executor]  ← Claude Code 按 .standards/ 规范逐 task 开发，写入长期记忆
    ↓
所有 tasks 完成
    ↓
[Skill: review-dispatcher] ← Codex 整体 Review → MCP 推送飞书通知 → 人工确认 → Codex 修复
    ↓
[Skill: test-generator] ← AI 生成单测 + 自动执行
    ↓
[Skill: e2e-generator]  ← Gemini CLI 2.5 Flash Batch 根据 PRD 生成 E2E + 执行
    ↓
测试报告输出给技术负责人
```

---

## 三、产出清单（按优先级顺序实现）

### 3.1 stackwise CLI（最高优先级）

**仓库名：** `stackwise`  
**技术栈：** Node.js + commander.js  
**发布方式：** npm 包，支持 `npx stackwise` 直接使用  
**配置文件：** `stackwise.config.json`（存项目根目录）

**命令列表：**

```bash
stackwise init              # 初始化：检测技术栈 + 从 GitLab 拉取对应规范到 .standards/
stackwise sync              # 手动同步：重新检测 + 更新 .standards/
stackwise detect            # 只检测技术栈，打印结果，不拉规范（预览用）
stackwise list              # 列出当前项目激活的规范文件列表
stackwise add <stack>       # 手动添加某个技术栈的规范
stackwise remove <stack>    # 手动移除某个技术栈的规范
```

**检测逻辑：**

读取项目根目录 `package.json` 的 `dependencies` 和 `devDependencies`，根据包名映射到技术栈：

```javascript
// 映射表（需内置，可扩展）
const STACK_MAP = {
  // 框架
  'react': 'react',
  'next': 'nextjs',
  'vue': 'vue',
  'nuxt': 'nuxt',

  // TypeScript
  'typescript': 'typescript',

  // 状态管理
  'zustand': 'zustand',
  'jotai': 'jotai',
  '@reduxjs/toolkit': 'redux-toolkit',
  'recoil': 'recoil',
  'mobx': 'mobx',

  // 数据请求
  '@tanstack/react-query': 'react-query',
  'swr': 'swr',
  'axios': 'axios',
  'ky': 'ky',

  // 组件库
  '@shadcn/ui': 'shadcn',
  'shadcn-ui': 'shadcn',
  '@radix-ui/react-primitive': 'radix',
  '@mui/material': 'mui',
  'antd': 'antd',
  '@ant-design/react': 'antd',

  // 表单
  'react-hook-form': 'react-hook-form',
  'formik': 'formik',

  // 验证
  'zod': 'zod',
  'yup': 'yup',

  // 样式
  'tailwindcss': 'tailwind',
  'styled-components': 'styled-components',

  // 测试
  'vitest': 'vitest',
  'jest': 'jest',
  '@playwright/test': 'playwright',
  'cypress': 'cypress',

  // 构建工具
  'vite': 'vite',
  'turbopack': 'turbopack',

  // 路由
  'react-router-dom': 'react-router',
  'react-router': 'react-router',

  // 工具
  'date-fns': 'date-fns',
  'dayjs': 'dayjs',
  'lodash': 'lodash',
  'immer': 'immer',
};
```

**init 流程：**

```
1. 读取 package.json → 检测技术栈列表
2. 打印检测结果，询问是否手动调整（支持增删）
3. 读取 stackwise.config.json 中的 STANDARDS_REPO_URL（GitLab 地址）
4. git clone / git pull standards-repo 到临时目录
5. 按技术栈列表，只复制对应的规范文件到 .standards/
6. 生成 .standards/active-rules.json（记录当前激活的规范文件路径）
7. 将 .standards/ 加入 .gitignore（规范不进业务 repo）
```

**`active-rules.json` 格式：**

```json
{
  "generated_at": "2026-04-15T10:30:00Z",
  "standards_repo": "https://gitlab.com/your-org/standards-repo",
  "standards_version": "abc1234",
  "detected_stacks": ["react", "typescript", "zustand", "react-query", "tailwind", "zod"],
  "manual_overrides": [],
  "rules": [
    { "stack": "react", "file": ".standards/react/component-structure.md" },
    { "stack": "react", "file": ".standards/react/hooks.md" },
    { "stack": "react", "file": ".standards/react/performance.md" },
    { "stack": "typescript", "file": ".standards/typescript/types.md" },
    { "stack": "typescript", "file": ".standards/typescript/naming.md" },
    { "stack": "zustand", "file": ".standards/zustand/store-structure.md" },
    { "stack": "react-query", "file": ".standards/react-query/data-fetching.md" },
    { "stack": "tailwind", "file": ".standards/tailwind/usage.md" },
    { "stack": "zod", "file": ".standards/zod/schema-design.md" }
  ]
}
```

**`stackwise.config.json` 格式（放项目根目录）：**

```json
{
  "standards_repo": "https://gitlab.com/your-org/standards-repo",
  "branch": "main",
  "auto_sync": true
}
```

---

### 3.2 standards-repo 仓库结构

**托管位置：** GitLab（团队共享，人人可提 MR 添加规范）  
**仓库名：** `standards-repo`

```
standards-repo/
├── README.md                    # 说明如何添加新技术栈规范
├── stacks/
│   ├── react/
│   │   ├── component-structure.md
│   │   ├── hooks.md
│   │   └── performance.md
│   ├── typescript/
│   │   ├── types.md
│   │   └── naming.md
│   ├── nextjs/
│   │   ├── app-router.md
│   │   └── data-fetching.md
│   ├── zustand/
│   │   └── store-structure.md
│   ├── react-query/
│   │   └── data-fetching.md
│   ├── tailwind/
│   │   └── usage.md
│   ├── zod/
│   │   └── schema-design.md
│   ├── react-hook-form/
│   │   └── usage.md
│   ├── shadcn/
│   │   └── component-usage.md
│   ├── vitest/
│   │   └── testing-patterns.md
│   └── playwright/
│       └── e2e-patterns.md
└── meta/
    └── stack-map.json           # 包名到技术栈的映射表（stackwise CLI 读取）
```

**规范文件内容来源：**
- `react/`、`typescript/` 参考 cal.com `agents/rules/` 通用部分 + `mkosir/typescript-style-guide`
- 其他技术栈参考各自官方文档最佳实践
- 业务约定不放这里（放各项目自己的 `openspec/specs/` 里）

**规范文件格式要求：**
每个规范文件遵循统一格式，方便 AI 消费：

```markdown
# [技术栈] [规则主题]

## 适用场景
什么时候应该读这个文件（一句话）

## 核心规则
- 规则1
- 规则2

## 正确示例
\`\`\`typescript
// good
\`\`\`

## 错误示例
\`\`\`typescript
// bad
\`\`\`

## 例外情况
什么时候可以不遵循
```

---

### 3.3 项目内目录结构

```
your-project/
├── stackwise.config.json        # stackwise 配置
├── AGENTS.md                    # AI 全局行为约定（所有 AI 工具都读这个）
├── .standards/                  # 由 stackwise 自动生成，不进 git
│   ├── active-rules.json
│   ├── react/
│   │   ├── component-structure.md
│   │   ├── hooks.md
│   │   └── performance.md
│   └── typescript/
│       ├── types.md
│       └── naming.md
├── .claude/
│   └── skills/
│       ├── prd-reader/
│       │   └── SKILL.md
│       ├── spec-generator/
│       │   └── SKILL.md
│       ├── task-executor/
│       │   └── SKILL.md
│       ├── review-dispatcher/
│       │   └── SKILL.md
│       ├── test-generator/
│       │   └── SKILL.md
│       └── e2e-generator/
│           └── SKILL.md
└── openspec/
    ├── specs/                   # 长期记忆，项目级规格文档
    │   └── [module-name].md
    └── changes/                 # 每次需求的设计文档
        └── 2026-04-15_[feature-name]/
            ├── proposal.md      # 做什么、为什么
            ├── design.md        # 技术方案
            └── tasks.md         # 任务列表（带状态）
```

---

### 3.4 AGENTS.md

放项目根目录，所有 AI 工具（Claude Code、Codex、Gemini CLI）启动时都读这个文件。

**内容要求：**
```markdown
# Project Agent Instructions

## 必读顺序
1. 本文件（全局约定）
2. .standards/active-rules.json（查看当前激活的规范列表）
3. 按需读取 .standards/ 下对应规范文件
4. openspec/specs/ （项目长期记忆）

## 开发前置检查
- [ ] .standards/active-rules.json 存在（若不存在，运行 npx stackwise init）
- [ ] openspec/changes/[当前任务]/ 目录存在且 proposal.md 已审批

## 核心约定
- 永远不用 `as any`
- 所有规范以 .standards/ 为准，不自行推断
- 每完成一个 task，更新 tasks.md 中对应条目状态
- 长期记忆写入 openspec/specs/ 对应模块文件

## 工具分工
- Claude Code：负责开发实现
- Codex：负责 Review 和修复
- Gemini CLI：负责 E2E 生成和执行

## 禁止行为
- 不得跳过 spec 审批直接开始开发
- 不得在 layout.tsx 中做权限检查
- 不得使用 barrel imports
- 不得提交未经 type-check 的代码
```

---

### 3.5 六个 Skill 详细说明

所有 Skill 遵循 agentskills.io 规范，放在 `.claude/skills/` 下。

---

#### Skill 1: prd-reader

**模式：** Tool Wrapper  
**触发词：** "读取PRD"、"分析需求"、"读会议纪要"

**功能：**
- 接收 PRD 文件路径或会议纪要文件路径
- 支持格式：.md、.txt、.pdf、飞书文档链接
- 输出结构化需求清单

**输出格式：**
```markdown
## 需求分析结果

### 功能需求
- [ ] 需求1（优先级：P0/P1/P2）
- [ ] 需求2

### 非功能需求
- 性能要求
- 安全要求

### 边界条件
- 明确不做的事情

### 疑问点（需人工确认）
- 疑问1
```

---

#### Skill 2: spec-generator

**模式：** Pipeline（内嵌 Inversion）  
**触发词：** "生成spec"、"写设计文档"、"开始规划"

**功能：**
- 读取 prd-reader 输出的需求清单
- 读取 `.standards/active-rules.json` 获取当前规范
- 生成三个文件到 `openspec/changes/YYYY-MM-DD_[feature-name]/`

**Step 1 — Inversion（先问后写）：**
开始前必须确认：
- 功能名称（用于目录命名）
- 影响范围（哪些模块）
- 有无依赖其他未完成功能

**Step 2 — 生成 proposal.md：**
```markdown
# [YYYY-MM-DD] [功能名称]

## 背景
为什么要做这个

## 目标
做完之后达到什么效果

## 不做什么
明确的边界

## 方案选择
为什么选这个方案，放弃了哪些备选方案
```

**Step 3 — 生成 design.md：**
```markdown
# 技术设计

## 架构变更
影响哪些模块

## 数据结构
新增/修改的类型定义

## API 设计
接口变更

## 组件设计
新增/修改的组件

## 状态管理
store 变更
```

**Step 4 — 生成 tasks.md：**
```markdown
# 任务列表

## Tasks
- [ ] 1.1 [具体任务]（预估：30min）
- [ ] 1.2 [具体任务]（预估：1h）
- [ ] 2.1 [具体任务]（预估：2h）

## 完成标准
每个 task 完成后需要满足的条件
```

**生成完毕后输出：**
```
Spec 已生成：openspec/changes/2026-04-15_[feature-name]/
请审阅以上三个文件，确认后回复「确认开始」继续执行
```

**等待人工确认，收到确认前不执行任何代码操作。**

---

#### Skill 3: task-executor

**模式：** Pipeline  
**触发词：** "开始开发"、"执行tasks"、"确认开始"

**功能：**
- 读取 `openspec/changes/[当前feature]/tasks.md`
- 读取 `.standards/active-rules.json` 加载规范
- 逐 task 执行，每完成一个更新 tasks.md 状态
- 写入长期记忆到 `openspec/specs/`

**执行规则：**
- 每个 task 开始前，读取相关规范文件
- 严格按 tasks.md 顺序执行，不跳过
- 每个 task 完成后：
  1. 更新 tasks.md 对应条目为 `[x]`
  2. 运行 `type-check`，有错误必须修复再继续
  3. 若涉及新的架构决策，追加到 `openspec/specs/[module].md`

**长期记忆格式（openspec/specs/[module].md）：**
```markdown
# [模块名] 规格文档

最后更新：YYYY-MM-DD

## 架构决策
- 决策1：为什么这么设计

## 关键约定
- 约定1

## 已知问题
- 问题1（待解决）
```

---

#### Skill 4: review-dispatcher

**模式：** Pipeline  
**触发词：** "开始review"、"tasks完成"

**功能：**
- 触发 Codex 对本次所有变更进行整体 Review
- 通过飞书 MCP 推送通知给技术负责人
- 等待确认后触发 Codex 修复

**飞书通知格式：**
```
【stackwise Review】项目名 · 功能名
────────────────────
🔴 Critical：X 个
🟡 Warning：X 个  
🟢 Suggestion：X 个
────────────────────
📄 查看完整报告：[文件路径]
────────────────────
回复「确认修复」开始自动修复
回复「忽略」跳过修复直接进入测试
```

**MCP 配置要求：**
需在项目根目录配置 `.mcp/feishu.json`：
```json
{
  "webhook_url": "YOUR_FEISHU_WEBHOOK_URL",
  "notify_user": "YOUR_USER_ID"
}
```

**Codex Review 指令：**
```
对以下变更文件进行代码 Review，输出结构化报告。
规范参考：.standards/active-rules.json 中列出的所有规范文件。
变更范围：本次 git diff 的所有文件。
输出格式：按 Critical / Warning / Suggestion 分级，每条附上文件名和行号。
```

---

#### Skill 5: test-generator

**模式：** Generator  
**触发词：** "生成单测"、"写测试"、"review修复完成"

**功能：**
- 读取本次变更的源文件
- 读取 `.standards/vitest/testing-patterns.md`（若存在）
- 自动生成单元测试文件
- 执行测试并输出结果

**测试生成原则：**
- 每个函数/组件至少一个测试
- 覆盖正常路径 + 边界条件 + 错误路径
- Mock 外部依赖
- 测试文件放在 `__tests__/` 目录下或与源文件同级（`.test.ts`）

**执行命令：**
```bash
# vitest
npx vitest run --reporter=verbose

# jest
npx jest --coverage
```

**测试报告输出到：**
`openspec/changes/[feature]/test-report.md`

---

#### Skill 6: e2e-generator

**模式：** Generator  
**触发词：** "生成e2e"、"单测完成"

**功能：**
- 读取原始 PRD / 会议纪要
- 读取 `openspec/changes/[feature]/proposal.md`
- 使用 Gemini CLI 2.5 Flash Batch 生成 E2E 测试用例
- 执行 E2E 测试
- 生成最终测试报告

**Gemini CLI 调用方式：**
```bash
gemini batch \
  --model gemini-2.5-flash \
  --input prd-content \
  --prompt "根据以下 PRD 生成 Playwright E2E 测试用例..." \
  --output e2e-cases.json
```

**E2E 测试用例生成原则：**
- 覆盖 PRD 中每一个用户故事
- 使用 Page Object Model 组织
- 包含正常流程 + 异常流程
- 测试文件放在 `e2e/` 目录

**执行命令：**
```bash
npx playwright test --reporter=html
```

**最终报告输出到：**
`openspec/changes/[feature]/e2e-report.md`

格式：
```markdown
# 测试报告 · [功能名] · [YYYY-MM-DD]

## 单元测试
- 总用例：X
- 通过：X
- 失败：X
- 覆盖率：X%

## E2E 测试
- 总用例：X
- 通过：X
- 失败：X
- 失败详情：[链接]

## 结论
✅ 可以合并 / ❌ 需要修复
```

---

## 四、关键约束与边界

### 人工审批节点（不可跳过）
1. `spec-generator` 生成完毕后 → 人工审批 spec
2. `review-dispatcher` 通知后 → 人工确认是否修复

### 工具分工边界
| 工具 | 职责 | 不做什么 |
|------|------|----------|
| Claude Code | 开发实现 | 不做 Review |
| Codex | Review + 修复 | 不做新功能开发 |
| Gemini CLI | E2E 生成 + 执行 | 不做业务开发 |

### 规范优先级
```
.standards/（技术栈规范）
    ↓ 优先级低于
openspec/specs/（项目长期记忆）
    ↓ 优先级低于
openspec/changes/[feature]/（本次任务 spec）
```

---

## 五、新项目接入步骤

```bash
# 1. 安装 stackwise
npm install -g stackwise
# 或直接用 npx

# 2. 在项目根目录初始化
npx stackwise init
# 按提示确认技术栈，输入 standards-repo GitLab 地址

# 3. 把 Skill 文件复制到项目
cp -r skills-template/.claude/skills .claude/skills

# 4. 配置 AGENTS.md
cp skills-template/AGENTS.md .

# 5. 配置飞书 MCP
mkdir .mcp && cp skills-template/.mcp/feishu.json .mcp/
# 填入自己的 webhook_url

# 6. 开始第一个任务
# 把 PRD 文件放好，在 Claude Code 中触发 prd-reader skill
```

---

## 六、后续升级路径

当这套流程验证好用之后，可以升级为：

1. **stackwise CLI 发布到 npm** — 团队 `npx stackwise init` 一键接入
2. **Web 界面** — 可视化管理规范、查看测试报告
3. **IDE 插件** — VSCode / Cursor 插件，侧边栏显示当前激活规范
4. **规范质量评分** — 自动评估各项目的规范遵循情况

---

## 七、Cowork 实施顺序

**第一阶段（核心）：**
1. `stackwise` CLI — `init`、`sync`、`detect`、`list`、`add`、`remove` 六个命令
2. `standards-repo` 仓库结构 + React / TypeScript 规范文件内容（参考 cal.com agents/rules）
3. `AGENTS.md` 模板

**第二阶段（Skill）：**
4. `prd-reader` Skill
5. `spec-generator` Skill
6. `task-executor` Skill
7. `review-dispatcher` Skill（含飞书 MCP 集成）
8. `test-generator` Skill
9. `e2e-generator` Skill

**第三阶段（收尾）：**
10. 新项目接入 `README.md`
11. `skills-template/` 模板目录（方便新项目复制）

---

## 八、补充说明

- **飞书 MCP**：使用飞书机器人 Webhook，不需要复杂的 MCP Server，直接 HTTP POST 即可
- **standards-repo 规范内容**：参考 `https://github.com/calcom/cal.com` 的 `agents/rules/` 目录，通用规则直接借用，技术栈特定规则参考各官方文档
- **Gemini CLI Batch**：用于 E2E 生成，降低 token 成本，具体定价 Gemini 2.5 Flash 约 $0.30/1M input tokens，Batch 模式再打 5 折
- **Codex**：指 OpenAI Codex CLI，用于 Review 和修复，与 Claude Code 互补
- **长期记忆**：存在 `openspec/specs/` 而不是外部数据库，保持简单，随代码一起版本管理

---

*文档版本：1.0 | 生成时间：2026-04-15 | 状态：待实施*