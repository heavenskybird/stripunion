# IMPLEMENTATION-BACKLOG

| 优先级/工作 | 依赖 | 验收条件 | 回归风险/成本 |
|---|---|---|---|
| P0 只读诊断 cycle 40160349037 的部署链 | Hostinger builds/logs 只读 access，现有 verification artifact | 对 content SHA、Git clone、build UUID、部署指纹、五 URL 逐项关联；确认根因/未知项，不改 receipt、不重发 | 避免新的 generation 浪费；API/日志访问需脱敏，无新增付费 |
| P0 评审 V0 draft 与接口 | 本 PR、本地 tests | 仅新增目录；scope/NULL/日期/score provenance 通过，生产路径完全未引用 | 低风险；不 merge 自动上线 |
| P1 抽取既有 topic/intent/hygiene 纯函数 | 现 opportunities/brain 的 sanitized golden fixtures | 原生产报告输出一致，新增 Unicode identity 不改变旧选题；避免两套 taxonomy/score | 中风险：topic collisions、重复选题；先测试再独立 PR |
| P1 严格 snapshot contract 与 quarantine | V0 records/provider contracts | malformed date/source/numeric、重复冲突、过期源分开报错；新增 Bing research adapter 原样保留 metrics/period，不填月量 | 低到中；无 collector 调度，Node 内置测试 |
| P1 聚合与 cannibalization drill-down | canonical GSC observation、同市场日窗口、inventory | distinct date 行聚合；impression-weighted position；排除 Domain/Blog 重计、URL/intent 假阳性；有最小样本 | 中风险：GSC cubes 拼接、匿名查询偏差；保留原始证据 |
| P1 Unified operations shadow report | 现有 Actions/health/ledger/outbox、Hostinger read-only | 无新 scheduler；一个事件 incident 去重，原因/症状分字段；五 URL failure 不被首页 PASS 掩盖 | 中风险：外部 quota、日志秘密、stale state；bounded reads |
| P1 数据可用性 manifest | 既有自然 SEO collector | source collection/outcome/update/window/freshness 分开；失败不覆盖有效快照，不声称旧快照等于今天成功 | 低风险，避免冗余 API 调用 |
| P2 Planner/Trends 授权与手动 read-only spike | owner 批准、合法访问与市场定义 | 估计/相对值明确；成人词无返回保留 NULL；成本/配额上限；无 campaign write | 授权可能受资格限制；先零付费/低量验收，不购套餐 |
| P2 公共主题 gap | 现 competitor collector + robots policy | 每请求尊重 allowlist/disallow，记录覆盖率；只声称 topic hypothesis，不声称对手 rank | 抓取条款/误报，中风险；严格限速 |
| P2 Conversion-informed ranking | approved offers、足够 GA4/first-party join 数据 | query 不可直接 join 时仅 page-level relevance；不把 0 observed revenue 当未接入；透明 confidence | 高误归因风险，需 7/14/30 日评估，无收益承诺 |
| P2 Report integration flag off | 以上纯函数/可用性 manifest | 只在既有 hourly loop 读取，坏/旧报告不阻塞 publisher；人工审阅输出差异 | 中风险：规划影响吞吐，不改变 5/hour 合同 |
| P3 Licensed SERP/backlinks adapter | owner 单独选供应商/预算/许可 | source/market/device/date 与样本范围完整；难度仅估计，有解释；provider optional | 潜在收费，默认不实现调用 |
| P3 Shadow recovery replay | incident baseline、幂等/CAS 模型 | 重复/移动 SHA/未知 timeout/3-attempt ceiling 全部 fail closed；只输出计划 | 高风险能力，必须先离线；不能自开 deployment |
| P4 单项有界恢复/控制交接 | owner 明确授权、回滚演练与验收窗口 | 单资源 allowlist、一次许可动作、审计、停用开关、验证后关闭 incident | 高风险/可能覆盖生产；独立 PR，不随关键词引擎上线 |

不在 backlog 默认授权范围：Supabase authority promotion、DB migration、DNS、commission/payout、批量删文、social resend、改小时调度。新的费用和任何生产部署需另行 owner 指令。
