# KEYWORD-INTELLIGENCE-V0

本实现是隔离的离线数据基础，无生产调用者。目录 ops/keyword-intelligence；未改 package scripts、workflow、editorial producer、publisher、R1、outbox、Supabase、affiliate 或 deployment 配置；无新增 runtime dependency。

## 文件与接口

- model.d.ts：全部需求字段、EvidenceKind、Evidence、KeywordRecord、SnapshotProvider、ScoreResult 类型契约；缺失值 NULL。
- engine.mjs：纯函数 GSC/Bing snapshot adapters、Unicode normalization、observation identity/dedup、canonical GSC property selection、可配置透明 score。
- report.mjs：只读显式本地 JSON 路径，stdout 输出完整离线报告，不写 repo、不 import collector。
- test/engine.test.mjs：sanitized synthetic contract fixtures，仅作单元测试，不能当生产 SEO 数据。
- example-report.json：现有历史快照 100 条 observations 的前 5 条示例；mode=offline-historical-example，包含原始 collection/date/source。不是行业完整榜，不是 fake fixture；未知月量/难度/竞争对手/商业归因为 NULL。

直接复用 ops/growth/gsc-scope.mjs 与 opportunity-identity.mjs。现有 opportunities 顶层写文件，不安全导入；V0 没有复制其生产 topic/hygiene/recommendation 规则，分类暂留 NULL，PRD 说明后续提取方式。Bing research/links 与 Trends/Planner/SERP 不在 V0 adapter 范围，接口可扩展，不伪造可用性。

## 本地运行（Node.js 22）

```sh
node ops/keyword-intelligence/test/engine.test.mjs
node --test ops/keyword-intelligence/test/*.test.mjs
node ops/keyword-intelligence/report.mjs \
  ops/seo-data-layer/data/raw/2026-10-22/gsc.json \
  ops/seo-data-layer/data/raw/2026-10-22/gsc-blog.json \
  ops/seo-data-layer/data/raw/2026-10-23/bing.json > work/keyword-snapshot-report.json
```

目录 work 需存在。示例 CLI 要求 Domain 路径；Blog-only fallback 与 AVCams scope 可通过纯函数 canonicalGscRecords 调用，尚未添加自动 discovery/日期选择。没有隐式调用免费/收费 API。报告顺序按稳定 identity 排列，不叫 opportunity ranking；评分需另外传入已审核 evidence-backed signals/权重/confidence/freshness。

Node 22.23.4 在 workspace 的 npm cache 中隔离获取；主机默认 Node 24 未替换。受限 runner 的子进程测试输出会折叠，直接执行测试文件可见每个 case。R1 child_process 测试在默认 sandbox 受到 EPERM，使用正常附加权限重跑通过，无生产外部调用。

## 验证记录

最终结果见 VALIDATION.md。V0 可安全离线审阅不等于 production-ready；尚无实时凭据验收、完整行业 corpus、SERP/Planner 接入、线上报告集成或 autonomous recovery。
