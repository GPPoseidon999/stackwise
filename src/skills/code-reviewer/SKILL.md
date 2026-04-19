---
name: code-reviewer
description: 对照 spec.md、acceptance.yaml 和激活规则（含 biz 本地规则）review 本次 feature 所有触及的代码，输出 review.md。有 blocker 时把 code_reviewer 标 blocked 并列出待修项交还 code-writer。当用户说"review 代码"、"代码审查"，或 code_writer 全部 done 后触发时使用。
metadata:
  pattern: reviewer
  model: claude-sonnet-4-6
  stage: code_reviewer
  reads:
    - agents/instruction.md
    - agents/spec/[feature]/spec.md
    - agents/spec/[feature]/acceptance.yaml
    - agents/spec/[feature]/plan.json
    - agents/active-rules.json
    - git diff（相对于 feature 分支的 base）
  writes:
    - agents/spec/[feature]/review.md
    - agents/spec/[feature]/plan.json
    - agents/memory/decisions/[feature].md
---

## 触发前提

- 所有 `tasks[i].status == "done"`
- `pipeline_steps[step=code_writer].status == done`
- `pipeline_steps[step=code_reviewer].status == pending`

## 输入契约

从 `agents/instruction.md` 读：
- `feature`、`spec_dir`
- `diff_base` — 默认是 `git merge-base HEAD main`；如果没开 git，CLI 会列出改动文件清单代替 diff

## 执行步骤

### Step 1 — 获取改动

```
git diff --name-only <diff_base>...HEAD   # 文件清单
git diff <diff_base>...HEAD               # 完整 diff
```

没开 git：从 `plan.json` 里聚合所有 tasks 的 `files` 字段，直接读文件当前内容（无法产出真正的 diff，会弱化增量判断，在 review.md 里标注这一点）。

### Step 2 — 加载规则

分两类加载：
- `source: "standards"` 的 rules —— 按文件扩展名 + spec.md 内容命中 `signals`
- `source: "local"`（即 `agents/rules/biz/`）的 rules —— **全部加载**。biz 规则是团队本地规范，不应被 signals 筛走。

规则太多时：优先保留 `priority: critical/high`、同时命中多个 signals 的 rule。

### Step 3 — 六维度检查

对每处改动逐条过：

| 维度 | 问什么 |
|------|--------|
| 规范符合度 | 代码是否违反了命中的规则？（引用 `rule.id` + 行号） |
| AC 覆盖 | spec.md 对应 task 的 `covers_ac` 列出的每条 AC，是否都能被代码证明？ |
| 逻辑正确性 | 边界条件（spec.md "边界条件"段）是否都处理？空值、并发、回滚？ |
| 性能 | 大列表未虚拟化、`useEffect` 依赖错 / 缺、N+1 query、重渲染 |
| 安全 | 未校验的入参、敏感信息写日志、权限校验缺失、XSS/SSRF |
| 测试可行性 | 关键逻辑是否方便在 test-writer 阶段写单测？（过度耦合会影响可测性） |

### Step 4 — 严重度分档

- **blocker**：AC 未实现、逻辑错误、安全漏洞、critical priority 规则违反 → 必须修
- **major**：high priority 规则违反、明显性能问题、边界条件遗漏 → 强烈建议修
- **minor**：medium/low priority 规则违反、可读性、命名 → 可延后

### Step 5 — 写 review.md

写入 `[spec_dir]/review.md`：

```markdown
# [功能名] Code Review

- feature: [feature id]
- spec: spec.md
- reviewed_at: [YYYY-MM-DD HH:mm]
- diff_base: [sha 或"无 git"]

## 结论
[通过 / 待修复：blocker N / major N / minor N]

## AC 覆盖
| AC | 文本 | 是否通过 | 证据 |
|----|------|----------|------|
| a1b2 | … | ✅ | src/api/user.ts:L30 |
| c3d4 | … | ❌ | 未实现重定向 |

## 问题列表

### [blocker] src/api/user.ts:L42
规则：security/input-validation
问题：`req.body.email` 未经校验直接写入 DB。
建议：在 handler 顶部用 zod schema 校验。

### [major] src/components/UserCard.tsx:L88
规则：react/hooks
问题：`useEffect` 依赖数组缺了 `userId`，会读到上一轮的 closure。
建议：把 `userId` 加进依赖数组。

### [minor] …

## 本次未加载的规则
因预算 / signals 不命中：[rule.id 列表]，以及跳过原因。
```

### Step 6 — 根据结论更新 plan.json

**有 blocker**：
- `pipeline_steps[step=code_reviewer].status` → `blocked`
- 在 `plan.json` 的 `tasks` 末尾追加修复 task：每个 blocker 一个 task，`skill: "code-writer"`、`model: "claude-opus-4-6"`、`depends_on: []`、`covers_ac` 继承原 task、`title` 写"修复 review 发现的 X"。
- 把 `pipeline_steps[step=code_writer].status` 改回 `pending`，让下一轮 `stackwise run` 重进 code-writer。

**只有 major/minor**：
- `pipeline_steps[step=code_reviewer].status` → `done`
- `pipeline_steps[step=test_writer].status` → `pending`
- major/minor 的处理意见写在 review.md，是否修由用户在会话里定。

### Step 7 — 追加 decisions/[feature].md

只记裁决类事项 —— 哪些 major 放过了、原因；biz 规则里哪一条被引用得最多；本次 review 学到了什么以后要复用的判断。

### Step 8 — 交付

回复里包含：
1. review.md 完整内容（或摘要 + 路径，视 blocker 数量而定）
2. 当前 pipeline 状态
3. 如果有 blocker：明确告诉主 agent "请再次触发 code-writer 执行修复 tasks"。如果无 blocker：明确告诉主 agent "可以进入 test-writer"。

## 失败模式

- 找不到 diff / 文件清单 → 报告给主 agent，不要凭空猜测改了什么。
- AC 覆盖表里存在一条 `❌` 但对应 task 的 status 是 done → 这是 code-writer 的 bug，把这条 AC 记成 blocker，并在 decisions 里写"code-writer 误报完成"。
- review 发现的 blocker 数 > 原 tasks 数的两倍 → 停下来提示用户："本次 review 发现问题数量异常高，建议回 spec_writer 阶段重新设计。"
