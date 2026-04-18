# Memory Archive — YYYY-MM (cold layer)

> 本文件是 **cold 层** 的示例，展示 `agents/memory/archive/YYYY-MM.md` 的归档格式。
> 真实数据由 `stackwise memory promote` 自动生成，不要手工编辑。
> 这一层是只读参考，skills 不会默认加载它 —— 只有在查历史时才会被 `stackwise memory search` 命中。

---

## feature: 01HQVZ3XK2M9N4B7F6J8R5W1P0-user-center
- 起止：2026-04-10 → 2026-04-18
- AC：2 条，全部通过
- 产物：prd.md · spec.md · review.md · test-report.md
- 高频决策：
  - 选 react-query + zod 做接口层（见 decisions）
  - biz/order-state 规则被命中 3 次，已提到 hot

## feature: 01HQW14M8K9N4B7F6J8R5W1P0-payment-retry
- 起止：2026-04-02 → 2026-04-09
- AC：4 条，3 通过 + 1 待人工验证（"支付失败率 < 0.1%" 属不可单测范畴）
- 产物：prd.md · spec.md · review.md · test-report.md
- 高频决策：
  - 放行 1 个 major（幂等性保护依赖后端头），记录在 decisions
  - 引入新 biz 规则 `biz/payment-idempotency`
