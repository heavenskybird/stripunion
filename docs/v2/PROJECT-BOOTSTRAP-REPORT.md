# PROJECT-BOOTSTRAP-REPORT

审计日期：2026-10-25，Asia/Shanghai。证据截止：GitHub 查询约 12:30；生产快照截至 12:15。后续自动运行可能改变状态。本次不派发、重跑、暂停或修改任何生产工作流。

## 检出与架构

- 已先读 AGENTS.md，并读 README、SEO-DATA-LAYER、AUTOMATION-SETUP、RELIABILITY-R1、GROWTH-CONTROL-PLANE、FIRST-PARTY-EDITORIAL-PUBLISHING、RESILIENT-GROWTH-RUNTIME 及相关集成说明/源码。
- 本地起点 `7cb0c1ab9e90b477e8b73eeb0747ec4b470de50d`；GitHub main 的只读查询一致。初始分支 work；保留未跟踪 `.astro/`。新分支 `codex/keyword-intelligence-v0`。
- 最近提交依次为内容批次、社交 outbox reconciliation、上一批 closure；不把 content commit 当作上线成功。
- Main 是 Astro 7 静态站，Node 22，配置集中在 src/config；guide modules 和数据驱动 review/category 页面构建到 HTML。Hostinger 原有 main 自动部署负责上线，publication-deployment.json 提供 guide source 指纹。
- Blog 是 WordPress；publish-wordpress-json.mjs、wordpress-queue 与 ledger 支持按 slug 幂等发布、媒体、SEO 字段和上线验证。Growth Bridge 在首次发布时派发 social-distribution，并记录去重标记/有限重试。此审计未读取实时 CMS 草稿或改文章。
- AVCams 是 StripCash 上游白标；live-models-worker 提供模型数据/归因相关能力，不能将其站点访问当作联盟点击。
- Supabase control-plane/client.mjs 为既有 upsert/读取与状态镜像接口。mode.json 当前为 shadow，promotion workflow AUTO_PROMOTE=false。数据库实时状态/权限 UNKNOWN；本次不连接、不迁移、不提升 authority。
- AI producer 已存在：generate-editorial-batch.mjs 调用 Responses API，默认模型由 workflow 配置为 gpt-6-luna，生成 artifact，经过确定性 compiler、质量/构建/视觉与上线门槛。Growth Brain、opportunities、experiments、observations 已提供确定性规划/实验层；不能将其统称为已具备自主根因诊断或自动部署修复。

## 可核实运行基线

| 项目 | 证据与结论 |
|---|---|
| 最近完整五篇周期 | [40151502518](https://github.com/heavenskybird/stripunion/actions/runs/40151502518)：09:39 开始，日志生成 5，live verify、ledger closure、R1 complete 均成功；最后 ledger 时间 09:44:33 |
| 最新未闭环周期 | [40160349037](https://github.com/heavenskybird/stripunion/actions/runs/40160349037)：12:01 开始，生成 5，构建/质量/视觉/提交成功；12:04–12:14 的 12 轮 probe 中五个 URL 持续 404，PUBLICATION_LIVE_CHECK_FAILED；closure/outbox enqueue 跳过 |
| R1 当前观察 | runtime 分支 receipt：cycleId/runId=40160349037，status=failure，attempts=1，12:14:53 完成；尚未达到三次上限；未来是否重试 UNKNOWN，没有人为重试 |
| 未闭环内容 | pending-publication-batch.json 与当前 cycle 匹配，五个源文件已提交；尚无这五篇 ledger。不得重新生成替代批次，不能把 generatedCount=5 算作 publishedCount=5 |
| 24 小时账本 | 固定区间 10-24 12:15 到 10-25 12:15，Astro 70、WordPress 0，共 70；目标仍是 120，差 50。这是账本时间计数，不是访问/收入，也不是本次创建内容。全历史 generated 总数未核实 |
| 网站健康 | [40149400830](https://github.com/heavenskybird/stripunion/actions/runs/40149400830)，09:07 oracle 日志：Main PASS、Blog PASS、AVCams PASS，但 AVCams sitemap_not_observed。这是该时刻证据，不抵消之后五篇 404 |
| 社交 | [40151816284](https://github.com/heavenskybird/stripunion/actions/runs/40151816284)：09:45 worker processed=5、delivered=4、scheduled=1、retryable=0、failed=0。历史总 outbox 1770：994 delivered、698 skipped、73 reconcile_required、4 scheduled、1 pending。scheduled 不是 delivered；73 条历史债务不得盲发 |
| SEO 快照 | 10-24 报告引用 GSC endDate=10-22，Bing/GA4/Buffer=10-23，Clarity=10-24。GSC Domain daily totals 1 click/100 impressions；Blog prefix 0/54 单独展示、不相加。快照存在不证明今天凭证有效 |
| Bing 能力 | 既有快照两站 verified，七个站点方法成功；8 seeds、305 related rows；38+3 indexed 是 Bing 返回的站点信号，不是 Google 完整索引库存；0 backlinks 是返回样本/统计内的零，不是全网零 |
| 收入与归因 | 旧快照 StripCash aggregate earnings=0；first-party clicks=5、postbacks=1、matched=0。没有可用 query→revenue join；GA4 revenue 未连接，不把它填 0 或分摊到关键词 |
| 部署根因 | 已证实上线验证失败；Hostinger clone/build/provider 状态及 WAF 根因 UNKNOWN，不能由 404 推断 Git clone 失败。既有 read-only acceptance 主要检查 staging，不等于生产 main 部署监控 |

## 工作流清单与边界

以下是当前 YAML 配置，不代表 GitHub 服务端所有工作流均 enabled；远端 workflow inventory 路径在 connector 中不可用，保留 UNKNOWN。运行证据仅验证上述样本。

| 工作流 | 触发/职责 | 并发/恢复 |
|---|---|---|
| editorial-producer-scheduler | 每小时 7/17/27/37/47/57 分钟、manual、kick push、受来源约束 workflow_run；调用 reusable Producer | scheduler-r1 非取消，合并 wakeups；不新增 scheduler |
| editorial-hourly-producer | reusable/manual，main-only，5 篇合同，52 分钟 admission | 共用非取消 writer lock，10 分钟 backoff、3 attempts、SHA receipt、原五篇恢复 |
| editorial-heartbeat-bridge | 专用 heartbeat 分支 push 唤醒 | 已有独立入口，不能将成功 bridge 当生产成功 |
| editorial-production-snapshot | 每小时 :25 与既有事件，统计 rolling ledger | 观察任务，不补发文章 |
| seo-data-daily | 01:20 UTC、manual、指定路径 main push | seo-data-persistence 非取消；per-source continue-on-error、保留成功快照；部分失败不能由总 job 成功掩盖 |
| traffic-competitor-daily / weekly-growth-report | 当前均 manual，名称中的 daily/weekly 不代表 cron | 各自持久化非取消锁；前者可链式派发后者 |
| social-outbox | 每 15 分钟、manual/kick 等 | 非取消锁，幂等 key、cadence cap、retryable/backoff、reconcile_required 隔离 |
| social-distribution / editorial-distribution | 已有发布事件/手动路径，分别面向 Blog 与 Astro | 旧分发路径仍存在，未来需评估跨路径重复风险；本次不调用 |
| telegram-evergreen | 00:15/08:15/16:15 UTC | schedule 分组非取消，保留已有 cadence |
| two-site-health | 每小时 :17、事件/manual | 可取消只读探针；Main/Blog/AVCams oracle |
| visual-qa | 每小时 :43、push/PR/manual | event/ref 分组，可取消；截图证据 |
| control-plane-authority-promotion | 每小时 :47/manual | 非取消；AUTO_PROMOTE=false |
| growth-control-plane-sync | 既有事件/manual，mirror | 非取消 shadow-sync 锁 |
| build | 全分支 push、main PR，指定路径排除 | Node 22、R1 suite、SEO suite、safe/prod builds；无生产部署步骤 |
| hostinger-readonly-acceptance | main push/manual | 非取消，staging metadata/read-only smoke |
| wordpress-editorial-publish / editorial-batch-publish | queue/artifact main 变更、manual | 各自非取消锁；有真实写操作，审计禁用调用 |
| deploy-live-models-worker | 既有 worker 部署工作流 | 与 V0 无关，不触发 |
| integration-smoke / stripcash-*-probe | 集成与 schema 探针 | 只读意图仍需检查源码/凭证，未主动运行 |
| telegram-bootstrap / editorial-backfill-2026-10-04 | 历史/手动写任务 | 非当前调度依据，不运行 |

## 可复用组件与缺口

- GSC collector 已分页收集 date/query/page 与多个独立 country/device cube；reuse 数据契约。gsc-scope.mjs 已防 Domain/Blog 重计，snapshot-freshness.mjs 可给后续集成作新鲜度门槛。
- Bing collector 已收集 query/page/crawl/backlinks/keyword stats/related words，但会 SubmitFeed，禁止把其 CLI 当只读适配器运行。V0 读取 JSON，无导入副作用。
- opportunities.mjs 已有 topic mapping、query hygiene、Bing expansion/trend 与内容路径建议；brain/experiments/content-inventory 已有商业关系与覆盖策略。脚本顶层有写文件副作用，本次不导入，后续先提取纯函数再统一，不平行替换其决策。
- opportunity-identity.mjs 复用完整 key 的 hash；GSC scope helper 直接复用。新增 Unicode normalization 专用于无损 observation identity，避免旧 ASCII-only 规则丢失非英语关键词，不替换生产聚类。
- 缺口：统一来源/市场/日期证据模型、可信月量、竞争 SERP、跨站 query gap、可归因 keyword revenue、统一 operations incident/correlation。V0 仅补第一项基础。

## 文档过时与未知项

README 仍称 m0-astro-static / planned deployment；RELIABILITY-R1 的“未合并”是历史验收记录；SEO 文档的 planned/SaaS 序列不是当前已实现清单；旧报告只计 27 tracked pages，不能当全站 guide 数。此任务不批量改历史文档，新的基线以本报告及对应 SHA/时间为准。

环境没有配置 secrets/outbound identities；gh API 被代理拒绝，已使用 GitHub connector 正常只读路径。未探测生产 secrets 内容。当前 Hostinger/Supabase 实时健康、GSC/Ads/Trends 授权、AVCams GSC property、未来部署和现时全站状态均 UNKNOWN。
