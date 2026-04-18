# Memory Index (hot layer)

> ≤ 2000 tokens. 追加写入，不覆盖。超限时由 `stackwise memory promote` 把陈旧条目迁入 warm/cold 层。

**三层记忆架构**

| 层级 | 路径 | 作用 | 谁在写 |
|------|------|------|--------|
| hot  | `agents/memory/index.md`（本文件） | 跨 feature 的稳定决策与约定，每次 skill 启动都会读 | skills 追加；`stackwise memory promote` 剪裁 |
| warm | `agents/memory/decisions/[feature].md` | 单个 feature 的选型、妥协、风险 | 各 skill 在执行过程中追加 |
| cold | `agents/memory/archive/YYYY-MM.md` | 已完结 feature 的决策归档 | `stackwise memory promote` 月度迁移 |

**本文件（hot）格式**：分节追加，每条一行，形如 `- [YYYY-MM-DD] <标签>：一句话结论`。
**禁止在此层复读**：具体证据与讨论过程留在对应 feature 的 `decisions/[feature].md` 里。

_last_updated: (auto)_

## 架构决策
（待补）

## 通用约定
（待补）

## 活跃 feature
（待补）
