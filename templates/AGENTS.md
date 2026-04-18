# AGENTS.md

## 这是什么
本项目使用 stackwise v2.7 管理 AI 开发流程。
你是主 agent，负责驱动从 PRD 到测试报告的完整开发流水线。

## 启动前必读
1. 读 stackwise.config.json 了解项目配置
2. 读 agents/memory/index.md 了解项目历史决策
3. 读 agents/memory/codebase-index.md 了解已有代码状态
4. 读 agents/config/notify.json 初始化通知渠道
5. 如果有进行中的 feature，读对应 plan.json
   找第一个 status 不是 done 的 pipeline_step，从那里继续

## 文件位置
| 内容 | 路径 |
|---|---|
| 项目配置 | stackwise.config.json |
| 规则库 | agents/rules/ |
| skill 定义 | agents/skills/ |
| 项目记忆 | agents/memory/index.md |
| 代码库索引 | agents/memory/codebase-index.md |
| feature 产物 | agents/spec/[ulid]-[slug]/ |
| 通知配置 | agents/config/notify.json |

## 路径约定
每个 feature 的产物统一放在 agents/spec/[ulid]-[slug]/
文件命名固定：prd.md · spec.md · acceptance.yaml · plan.json · review.md · test-report.md
当前 feature 路径从 plan.json 的 spec_dir 字段读取

## 执行约束
- 每次只执行单个步骤，完成后在 chat 里报告，等待下一条指令
- 审批节点：展示摘要后等待人工在 chat 里回复，不要自动继续
- 每次执行 task 前检查 plan.json 确认依赖全部完成
- 禁止使用 --no-verify
- 禁止修改 lint / formatter 配置文件（.eslintrc、biome.json 等）
- 不要修改 agents/rules/（biz/ 除外）
- 不要修改 agents/schemas/

## 遇到问题时
- 校验失败：在 chat 里说明原因，等待人工指示
- 外部 API 失败：重试一次，仍失败则报告，继续流程不中断
- 不确定怎么做：直接在 chat 里问，不要猜
