# feature decisions — _example.md

> 本文件是 **warm 层** 的示例，展示 `agents/memory/decisions/[feature].md` 应该长什么样。
> `stackwise run new --prd ...` 会按 feature id 新建真实文件，不会覆盖你的数据。
> 真实 feature 完成后，用 `stackwise memory promote [feature]` 把摘要送进 hot 层，原文送进 cold 层归档。

---

## [YYYY-MM-DD] spec_writer 决策
- 选型：用 react-query + zod 做接口层校验 。原因：项目已装 zod，新增依赖成本低；react-query 的 cache 能覆盖 90% 的取数场景。
- 没选 SWR。原因：SWR 的错误边界不够明确，团队过去在 X 项目里踩过坑。
- 已知风险：acceptance.yaml 的 AC `a1b2` 依赖后端 /user/profile 接口上线；若后端延期，spec 里的 UserCard 组件先用 mock 返回。

## [YYYY-MM-DD] code_writer 决策
- 规则冲突：`react/component-structure` 要求 props 类型 inline 声明，`typescript/types` 要求抽到 `types.ts`。按 priority 比较后两者都是 high，裁决：组件内部状态类型 inline，跨模块的 props 类型走 `types.ts`。
- lint 留了 1 个 warning：`react-hooks/exhaustive-deps` 在 debounced 回调里是误报，无法修正。

## [YYYY-MM-DD] code_reviewer 决策
- 放行 1 个 major（UserCard 用了非虚拟化渲染）。理由：AC 里没有列表规模要求，且后端 page size 上限为 20。若后续场景变更需要重开 issue。
- biz 规则 `biz/order-state` 本次被命中 3 次，最高价值；建议在 hot 索引里挂一条。

## [YYYY-MM-DD] test_writer 决策
- 覆盖率豁免：`src/types/user.ts` —— 纯类型声明。
- AC `c3d4`（重定向）无法单测（依赖真实路由栈），用 playwright 的 redirect assertion 做 E2E。
