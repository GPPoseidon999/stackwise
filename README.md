# stackwise

[English](#english) | [中文](#中文)

## English

`stackwise` is a CLI for syncing coding standards into product repositories.

It detects the current tech stack from `package.json`, pulls matching standards from a central repository, and writes a local `.standards/` snapshot that humans and AI tools can read consistently.

### Two-repository architecture

| Repository | Purpose |
| --- | --- |
| [`stackwise`](https://github.com/GPPoseidon999/stackwise) | This CLI tool |
| [`stackwise-standards`](https://github.com/GPPoseidon999/stackwise-standards) | Central rule repository — fork this to create your own |

The CLI and the rules are intentionally separate. Teams can fork `stackwise-standards` and point their config at the fork to maintain a private rule set without touching CLI code.

### Why stackwise

- Keep shared standards in one place
- Reuse the same rule set across multiple projects
- Sync only the stacks a project actually uses
- Keep cross-cutting rules such as testing, performance, build, and security aligned
- Give AI tools a stable local manifest instead of making them guess from remote docs

### Quick start

```bash
npx stackwise-cli init
```

### Configuration

Create `stackwise.config.json` in the target project root:

```json
{
  "standards_repo": "https://github.com/GPPoseidon999/stackwise-standards",
  "branch": "main",
  "auto_sync": true
}
```

To use a private fork of the standards repository, change `standards_repo` to point at your fork.

### Commands

| Command | Description |
| --- | --- |
| `stackwise-cli detect` | Detect stacks from `package.json` without changing files |
| `stackwise-cli init` | Detect stacks, let the user confirm them, then create `.standards/` |
| `stackwise-cli sync` | Re-detect the project and rebuild `.standards/` while keeping manual overrides |
| `stackwise-cli list` | Print the current active rules and manifest metadata |
| `stackwise-cli add <stack>` | Add one stack standard manually |
| `stackwise-cli remove <stack>` | Remove one stack standard manually |

### Output

After a successful sync, the target project gets:

```text
.standards/
|- stacks/
|- concerns/
|- meta/
`- active-rules.json
```

`active-rules.json` stores detected stacks, selected stacks, manual overrides, default concerns, and active rule metadata.

### Repository layout

```text
.
|- bin/          CLI entrypoint
|- src/
|  |- commands/  init, sync, detect, list, add, remove
|  |- constants/ stack-map
|  `- utils/     config, git, rules, detector, stacks, active-rules
`- package.json
```

### Local development

```bash
npm install
npm run dev -- --help
npm run dev -- detect
npm run dev -- init
npm run dev -- add zod
npm run dev -- remove react
```

### Contributing

Issues and pull requests are welcome. To add or improve standards rules, contribute to [`stackwise-standards`](https://github.com/GPPoseidon999/stackwise-standards) instead.

### License

MIT

---

## 中文

`stackwise` 是一个把研发规范同步到业务项目中的 CLI 工具。

它会从 `package.json` 检测当前项目的技术栈，从中央规范仓库拉取匹配规则，并在本地生成一份 `.standards/` 快照，供人和 AI 工具稳定读取。

### 双仓库架构

| 仓库 | 用途 |
| --- | --- |
| [`stackwise`](https://github.com/GPPoseidon999/stackwise) | CLI 工具本身 |
| [`stackwise-standards`](https://github.com/GPPoseidon999/stackwise-standards) | 中央规范仓库 —— fork 它来维护自己的私有规范 |

CLI 和规范是有意分开的。团队可以 fork `stackwise-standards` 并修改配置指向自己的 fork，从而维护私有规范，无需改动 CLI 代码。

### 为什么需要 stackwise

- 在一个地方集中维护共享规范
- 在多个项目之间复用同一套规则
- 只同步当前项目真正需要的技术栈规范
- 保持测试、性能、构建、安全等横切规则一致
- 给 AI 提供稳定的本地 manifest，而不是让它从远端文档里猜

### 快速开始

```bash
npx stackwise-cli init
```

### 配置文件

在目标项目根目录创建 `stackwise.config.json`：

```json
{
  "standards_repo": "https://github.com/GPPoseidon999/stackwise-standards",
  "branch": "main",
  "auto_sync": true
}
```

如果想使用私有规范仓库，把 `standards_repo` 改成你 fork 后的仓库地址即可。

### 命令说明

| 命令 | 说明 |
| --- | --- |
| `stackwise-cli detect` | 从 `package.json` 检测技术栈，不修改文件 |
| `stackwise-cli init` | 检测技术栈、让用户确认后生成 `.standards/` |
| `stackwise-cli sync` | 重新检测项目并重建 `.standards/`，同时保留手动 override |
| `stackwise-cli list` | 打印当前激活规则和 manifest 元数据 |
| `stackwise-cli add <stack>` | 手动增加一个技术栈规范 |
| `stackwise-cli remove <stack>` | 手动移除一个技术栈规范 |

### 输出结构

同步成功后，目标项目会得到：

```text
.standards/
|- stacks/
|- concerns/
|- meta/
`- active-rules.json
```

`active-rules.json` 中会记录检测到的技术栈、激活的技术栈、手动 override、默认 concern 和规则 metadata。

### 仓库结构

```text
.
|- bin/          CLI 入口
|- src/
|  |- commands/  init, sync, detect, list, add, remove
|  |- constants/ stack-map
|  `- utils/     config, git, rules, detector, stacks, active-rules
`- package.json
```

### 本地开发

```bash
npm install
npm run dev -- --help
npm run dev -- detect
npm run dev -- init
npm run dev -- add zod
npm run dev -- remove react
```

### 贡献

欢迎提 Issue 和 PR。如果想新增或改进规范规则，请向 [`stackwise-standards`](https://github.com/GPPoseidon999/stackwise-standards) 提交。

### 协议

MIT
