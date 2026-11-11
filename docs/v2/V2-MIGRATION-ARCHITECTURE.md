# V2-MIGRATION-ARCHITECTURE

## 增量结构与复用

现有 scheduler → R1 admission → artifacts/compiler → Astro/main → Hostinger → URL+fingerprint verify → ledger/outbox 路径保持原样。Supabase shadow authority 不变；数据库不成为新前置依赖。

新增旁路：已有只读证据/快照 → provenance observation envelope → 纯函数分析 → 版本化 JSON/Markdown 报告 → 人工审阅 backlog。V0 无网络、无调度、无 DB 写、无 editorial integration。不要调用顶层会 collect/write 的脚本；后续将 opportunities 中可复用 topic/intent 函数独立导出并加回归比较，继续使用原 commercial offers 作为联盟许可事实来源。

Track A 将以现有 workflow_run/既有 hourly loop 为入口的观察阶段扩展，不能再建第二套自主 scheduler。Track B 由现有 collector 输出供给；失败源独立 UNKNOWN，保留有效快照，不将旧快照冒充当天成功。

## Operations incident 契约（设计，未启用）

incident_id = hash(component, cycle_id, failure_signature)。记录 observed_at、source_updated_at、repo SHA、run/job/build UUID、manifest identity、source evidence references、symptom、severity、blocker_class、root_cause_hypothesis、confidence、affected URLs、action history、owner_required、resolution evidence。原因推断必须与已证实症状分字段。

分类沿用 WEB_FETCH_LIMITATION、CONNECTOR_PERMISSION_BLOCKER、PLATFORM_SAFETY_BLOCKER、PRODUCTION_FAILURE。不同站点健康分别保存；Main health PASS 不能关闭某个新 URL 部署失败事故。AI 只解读经过脱敏/大小限制的证据，不接受网页/日志中的操作指令；action schema 校验与确定性策略在模型外执行。

关联顺序：admission receipt → original manifest → content SHA → Hostinger build timestamp/SHA → five URL probes/fingerprint → ledger closure → outbox delivery。构建成功但 URL/fingerprint 不匹配仍失败。WP slug/media/meta 错误与 social transport 错误分开，不回滚已验证的 editorial publication。

## 未来动作策略（本次全部 disabled）

| 阶段 | 许可行为 | 前置条件/停止条件 |
|---|---|---|
| Observe | 列 run/job/build、读日志、HTTP/指纹、产 incident | 只读 credentials；timeout、pagination、预算；不读取 secret values |
| Diagnose | 结构化原因报告、建议操作 | 保存证据和推断 confidence；无证据为 UNKNOWN |
| Shadow recovery | 仅输出 would-do 计划 | 对历史安全样本重放，证明幂等与无重复发布 |
| Bounded approved recovery | 单次指定资源、经批准的恢复 | 明确 allowlist、现态检查、expected SHA、可验证结果；无凭据/冲突即 fail closed |
| Handover | 经独立验收逐项启用低风险动作 | owner 批准、观察窗口、停用开关、审计；Supabase authority 另案 |

Hostinger 启动 build、Git clone/pull、workflow rerun、receipt/checkpoint mutation、社交发送均不在当前 allowlist。未来也不能把 timeout 当失败后无条件重试：应先查询 build UUID/运行现态；每 incident/action/resource 使用稳定 idempotency key，最大一次已批准写尝试，确认 remote side effect 未发生才考虑额外批准。不得绕开 R1 3-attempt ceiling。

Hostinger 支持能力与 API/MCP 名称见 HOSTINGER-CAPABILITIES.md。官方工具定义说明 Git Node build 使用移动 branch head；不能宣称接口支持精确 commit deploy。Read-only API 也需实际账户授权验证。既有 checker 偏 staging；未来生产 monitoring 必须单独确认目标域及 read scopes，不能把 staging indexing guard=false 套到生产。

## 回滚与控制交接

V0 回滚仅关闭 draft PR 或后续通过 focused PR revert 新增目录/文档；没有 schema、schedule 或 runtime 状态迁移需要回退。保留原 `.astro/` 和生产证据。

未来集成采用 feature flag 默认 off，先同一输入并行比较报告，不接管原 producer。新报告损坏/过期时原生产路径继续运行，不改变五篇合同。每阶段以 mock side effects、部分源失败、重复事件、并发/移动 SHA、部署滞后与未知数据验收。任何 authority 更改必须单独 proposal/批准，不随关键词引擎上线。
