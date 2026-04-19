---
name: prd-reader
description: 读取 PRD（URL、文件或用户粘贴的文本），提取结构化需求，写入 agents/spec/[feature]/prd.md 与 acceptance.yaml，并更新 plan.json 进入 prd_approval 门。当用户说"读取 PRD"、"分析需求"、"处理 PRD"，或由 stackwise run new 触发时使用。
metadata:
  pattern: generator
  model: claude-sonnet-4-6
  stage: prd_reader
  reads:
    - agents/instruction.md
    - agents/config/stackwise.json
    - agents/memory/index.md
  writes:
    - agents/spec/[feature]/prd.md
    - agents/spec/[feature]/acceptance.yaml
    - agents/spec/[feature]/plan.json
---

## 上下文来源

`stackwise run new --prd <来源> --name <英文名>` 会生成 feature id（`[ulid]-[slug]`），创建 `agents/spec/[feature]/` 目录并写好初始 `plan.json`，然后把下一步指令写入 `agents/instruction.md`。本 skill 从这里接手。

## 输入契约

从 `agents/instruction.md` 读取：
- `feature` — feature id（`[ulid]-[slug]` 格式）
- `spec_dir` — `agents/spec/[feature]/`
- `prd_source` — PRD 来源，形如 `url:https://…`、`file:docs/prd.md` 或 `text:<inline>`

如果是 URL：抓取页面正文，忽略导航 / 广告 / 页脚。如果抓取失败，**停下来**请求用户粘贴内容，不要编造。
如果是 file 路径：用文件工具读取。
如果是 text：直接使用。

## 执行步骤

### Step 1 — 加载 PRD 原文
按 prd_source 类型处理：
如果是飞书 URL（域名包含 feishu.cn 或 larkoffice.com）：

从 agents/config/notify.json 读取 prd_source.app_id 和 prd_source.app_secret
获取 tenant_access_token：

   POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal
   Content-Type: application/json
   {"app_id": "<app_id>", "app_secret": "<app_secret>"}
取返回的 tenant_access_token 字段。

从 URL 提取 node_token：

/wiki/Xxxx123 格式 → node_token = Xxxx123
/docx/Xxxx123 格式 → 跳过第 4 步，直接用 Xxxx123 作为 obj_token


（仅 wiki URL）用 node_token 换取 obj_token：

   GET https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=<node_token>
   Authorization: Bearer <tenant_access_token>
从返回的 data.node.obj_token 取值，data.node.obj_type 应为 docx。

拉取文档正文：

   GET https://open.feishu.cn/open-apis/docx/v1/documents/<obj_token>/raw_content
   Authorization: Bearer <tenant_access_token>
从返回的 data.content 取正文，作为后续步骤的 PRD 原文。
任何一步返回非 0 code：停下来，报告步骤编号和错误信息，不要编造内容，等待用户处理。
如果是普通 URL（非飞书）：
抓取页面正文，忽略导航 / 广告 / 页脚。抓取失败则停下来请用户粘贴，不要编造。
如果是 file 路径：
用文件工具读取。
如果是 text：
直接使用。

### Step 2 — 提取功能名
从内容中概括出本次需求的核心功能，2-4 个中文字，例如"用户中心"、"订单列表"、"消息通知"。
这个名字要和 `spec_dir` 里的 slug 对得上（slug 一般是功能名的英文/拼音），如果对不上，在 prd.md 里用 `功能名: …` 显式写出中文名。

### Step 3 — 结构化提取
从原文提取以下字段。原文里找不到的字段统一写"待确认（原文未说明）"，**严禁编造**：

- **背景**：为什么要做，一两句话
- **功能点**：每条一个可交付的功能，编号列出（F1、F2、F3…）
- **数据结构 / 接口变更**：涉及的字段、API、数据库变更
- **边界条件**：异常情况、权限限制、边缘场景
- **验收标准**：明确的可测试条件（AC1、AC2、AC3…）
- **不在范围内**：明确排除的功能，防止后续阶段自作主张扩展

### Step 4 — 生成 prd.md

写入 `[spec_dir]/prd.md`，内容结构：

```markdown
# [功能名] 需求文档

- feature: [feature id]
- prd_source: [来源]
- 生成时间: [YYYY-MM-DD HH:mm]

## 背景
…

## 功能点
- **F1**：…
- **F2**：…

## 数据结构 / 接口变更
…

## 边界条件
- …

## 验收标准
- **AC1**：…
- **AC2**：…

## 不在范围内
- …
```

### Step 5 — 生成 acceptance.yaml

为每条 AC 计算一个稳定 id：对 AC 正文（不含编号前缀）做 md5，取前 4 位十六进制。写入 `[spec_dir]/acceptance.yaml`：

```yaml
feature: [feature id]
acceptance:
  - id: a1b2      # md5(AC1 正文).slice(0,4)
    text: "用户在用户中心页可以查看头像和昵称"
    must_pass: true
  - id: c3d4
    text: "未登录用户访问会被重定向到登录页"
    must_pass: true
```

`must_pass: true` 表示这条 AC 是硬门槛；`false` 表示期望但不阻断（用来标"nice-to-have"）。默认 `true`。

### Step 6 — 更新 plan.json

读 `[spec_dir]/plan.json`（`stackwise run new` 已经建好了），做如下更新：
- `pipeline_steps[step=prd_reader].status` → `done`
- `pipeline_steps[step=prd_approval].status` → `pending`
- `pipeline_status` → `in_progress`（保持不变）

用 CLI 的 schema 要求回写，**不要**乱加字段；如果有不认识的字段，保留原样。

### Step 7 — 向主 agent 交付 approval 提示

在回复里展示：
1. `prd.md` 的完整内容
2. `acceptance.yaml` 的 AC 列表
3. 一句明确的 approval 话术：

> PRD 初稿已生成，请 review：
> - [spec_dir]/prd.md
> - [spec_dir]/acceptance.yaml
>
> 回复「通过」进入 spec 阶段；回复「修改：<你的修改意见>」我会原地改 prd.md 并再次请求确认。

**不要**自动跳到 spec-writer。人类必须在会话里显式批准才能越过 `prd_approval` 门。

## 失败模式

- **PRD 来源抓不到**：停下来请用户粘贴，不要自己编。
- **AC 一条都提不出来**：在 prd.md 里标"⚠️ 原文没有给出可测验收标准，请补充"，把 acceptance.yaml 留空，**不要**推进到 prd_approval done。
- **feature id 和 spec_dir 对不上**：停下来报错；feature id 是 CLI 分配的，不要自己生成。
