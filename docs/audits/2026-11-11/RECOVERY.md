# StripUnion recovery — R0 inventory / R1 repair candidate

本报告是阶段性证据与修复候选，不是生产恢复声明。日期按 Asia/Shanghai；机器证据保留 GitHub UTC。基线 main `0e10ce79f8bfebbab74a7937101163b00d1062fd`。协调工单 [#166](https://github.com/heavenskybird/stripunion/issues/166)、历史 [#155](https://github.com/heavenskybird/stripunion/issues/155)。

## 取证范围及边界

- 读取 AGENTS、README、AUTOMATION-SETUP、SEO-DATA-LAYER、RELIABILITY-R1、RESILIENT-GROWTH-RUNTIME，及相应 workflow / generator / outbox / analytics 源码。
- 原分支 `work`、HEAD `62e078bd`，原未跟踪 `.astro/` 保留；fetch 后从当前 origin/main 建立 `codex/recovery-r0-r1-20261111`。README 的旧 staging 状态不是部署事实。
- GitHub connector 读取最新 1,000 个 runs，覆盖 10/27–11/11；最近成功/失败索引见 [recovery-evidence.json](recovery-evidence.json)。空值仅表示此窗口未观察到，不能推断历史上从未失败。时间为 run 创建时间，不冒充业务输出时间。
- 读取当前独立 receipt、#155 评论、#164/#165 元数据，以及当前故障和最近成功 producer 的实际 jobs/logs。`gh api` 返回 Forbidden；正常 Git fetch 与 GitHub connector 仍可用。按 workflow 查询的 connector URL 不支持，改用已支持的 repository run collection 分页读取。
- 当前执行环境没有绑定生产 Secrets / outbound identities，没有 Hostinger connector 或账户日志权限；生产站点域名不在环境出站 allowlist。未把本地访问限制当作站点故障，也未改变网络/平台权限。
- 公共健康 artifact `13849406399` 已通过 connector 取到文件引用，但此执行器未读取 ZIP 内容；HTTP 错误码/底层网络原因仍需解码 artifact 或新的受控 oracle 证据。
- 未执行生产生成、发送、历史重跑、receipt 修改、scheduler 开关、merge、部署或新增长实验。

## P0 的当前事实

当前 receipt blob SHA `8f204ec0fe1477f9c3627b75d3d692506e47d4e4`，分支 `codex/editorial-r1-runtime`：status=failure、cycleId=`41254032304`、runId=`41260561057`、attempts=3，最后完成于 11/01 09:19:24。

这不是 #155 原始 cycle `38850741342`。原始故障已在 10/21 恢复，后续存在实际成功批次；不能照搬旧 rearm 判断。

| 当前 cycle 的尝试 | 实际失败步骤 | 已证实原因 |
| --- | --- | --- |
| [41254032304](https://github.com/heavenskybird/stripunion/actions/runs/41254032304) | Plan hourly batch and generate only the deficit | 三次候选校验后仍有重复 slug / backlogId `adult-games-save-data-portability-audit` |
| [41257256944](https://github.com/heavenskybird/stripunion/actions/runs/41257256944) | 同上 | OpenAI HTTP 429，type=insufficient_quota、code=credit_balance_exhausted |
| [41260561057](https://github.com/heavenskybird/stripunion/actions/runs/41260561057) | 同上 | 同一额度耗尽错误；不是 transient rate limit |
| [43033462000](https://github.com/heavenskybird/stripunion/actions/runs/43033462000) | Admit one durable cadence cycle | cycle-retry-limit；安装、生成、编译、部署全部 skipped |

额度是否已恢复未知；本地没有 credential，未发付费请求。现有默认模型已经是 `gpt-6-luna`，换重试不能解决余额问题。账户核实入口：https://platform.openai.com/settings/organization/billing 。不新增付费服务、不自动充值、不要求在聊天提供密钥。

## 原五篇 / checkpoint / Ledger / deployment

当前 main 的 checkpoint 是前一成功 cycle `41249384691`，phase=closed，不是当前失败 cycle 的未部署批次。生成失败前移除旧 checkpoint 的行为发生在临时 runner；未提交成功，因此 main 仍保留旧 closed manifest，这是预期的审计保留。

成功内容提交 `a4fcb00f`；closure 提交 `6cad1ac4`。五个 artifact、guide、唯一 backlog published 行、Ledger 都存在：

1. creator-platform-payout-statement-reconciliation-workflow
2. live-cam-platform-account-suspension-appeal-terms-audit
3. adult-dating-first-meeting-safety-planning-guide
4. adult-anime-game-purchase-model-cost-checklist
5. free-video-age-assurance-data-minimization-checklist

[成功 run 41249384691](https://github.com/heavenskybird/stripunion/actions/runs/41249384691) 的 job `124679505698` 原始日志：前三轮五个 404，第四轮（11/01 06:48:57，elapsed=106899ms）五个 URL 经同路径 301 到尾斜杠后均为真实 200，`PUBLICATION_LIVE_CHECK_OK`；同一 verifier 强制部署指纹匹配才可成功。Ledger verified_at 为 06:48:57–06:49:02，distribution_state=distribution_pending。**这只能证明该时点部署成功，不是今天的 live 证明，也不等于分发完成。**

当前失败 cycle 没有提交自己的五篇 checkpoint；禁止拿上一批 closed manifest 充当新 cycle 成功。恢复必须先检查最新 main/receipt 是否已变化，再排空 writer、核实额度、通过 reviewed 修复，最后按照 R1 runbook 做 SHA 保护的 receipt rearm。此 PR 不修改 receipt，不扩大三次上限。

## Current State / Failure Inventory

成功/失败 run 的精确时间及来源见 JSON。下表中的“未知”不能用 workflow 绿灯补齐。各项恢复均要求现有最小权限。

| 模块 | 最近成功 / 失败证据 | 是否运行、业务输出与重复风险 | 根因 / 恢复动作 / 权限 / 验收 |
| --- | --- | --- | --- |
| Editorial Scheduler | 成功 41249384691（11/01 06:42）；失败 43033462000（11/11 21:54），admission | 持续 wake，但无新生产；共享 reusable producer 锁，当前 fail-closed | 已证实 retry ceiling；修复下述 generator/额度后排空并受控 rearm。需 Actions 与 runtime branch write；新自然 wake 真实五篇后连续三 cycle |
| Hourly Producer | 通过 Scheduler 的 reusable job 取证，不能只查 standalone runs | 当前不执行生成；历史 rerun 被拒绝；未观察到当前生成中的 job | 最新三次实际生成错误见上；保持单写入者、质量门、限次恢复 |
| R1 receipt/checkpoint | receipt 11/01 09:19 failure；closed checkpoint 11/01 06:49 | receipt 阻止新生产；旧 closed checkpoint 不代表新 cycle 输出 | 已证实；禁止删除、伪造 success 或把旧 manifest 绑定新 cycle。需 SHA + writer drain 才可 rearm |
| Generator/compiler/quality | 41249384691 全链路通过；41254032304 生成校验失败 | 防重复成功拦截；生成器仍可能返回重复/无效内容 | 已证实完整校验存在、prompt 只给截断库存；本 PR 补完整占用 ID、所选分类上下文、超时和安全错误分类。离线测试不能证明模型永不重复 |
| Hostinger / fingerprint | 41249384691 06:48:57 指纹门与五个 200；当前 Hostinger provider 最近成功/失败未知 | 历史部署延迟已恢复；当前生产状态未知；main 元数据提交仍可能触发不必要部署 | 不把旧 #164 的 404 当当前根因。需 Hostinger 只读 token/日志和新 fingerprint；验收当前五篇 200 + SHA256 匹配，无改 WAF/部署配置 |
| Publication Ledger | 五行 11/01 06:48:57–06:49:02；当前 cycle 无新增 | 历史五篇 closed；distribution_pending 不表示未上线，也不表示社交已发送 | 源文件/manifest/ledger 一致。恢复验收保留 published_at、幂等 closure、不能重复入队 |
| Native Social Outbox | 最后绿色 41755681572（11/04 09:40）；失败 43023930891（11/11 20:51），Reconcile historical Buffer deliveries | worker 被前置对账阻塞；当前 tracked 事件无 pending/retryable。X delivered284/skipped1233/reconcile28；Telegram delivered1427/skipped73/reconcile45 | 已证实 Buffer 429，RATE_LIMIT_EXCEEDED，window=30d。需独立对账/投递、共享请求预算/持久冷却、attempt journal；不靠无限 backoff、不升级套餐。验收 provider receipt + 零重复，未知发送不得重发 |
| Buffer / X | 新鲜度最后 11/04 15:34:18；11/11 SEO/Outbox 均 429 | 旧 Buffer 339 sent 的聚合窗口不等于本地 X284 delivered；不能相减为丢失数 | 已证实月窗口额度限制；减少重复全历史分页、缓存并显式标 stale，跨 worker 共用预算。需现有 Buffer read/write 适当 scope；验收有界请求与可核实发送 |
| Telegram | evergreen 42970397330（11/11 14:09）绿色；失败 41865507125（11/05 00:16），具体步骤尚未取日志 | native 路径被 Buffer 阻塞，evergreen 为独立直接发送入口；绿色不证明 provider 实际交付 | 旧发送入口绕过 native cap/锁的代码已证实；实际历史重复未知。先审 #165 并统一 journal/caps，再安全隔离 Telegram；保留45条 reconcile_required |
| SEO Data Daily | 成功41793123027（11/04 15:33）；失败42982170466（11/11 15:48），Mark missing source snapshots as failure | 成功源实际持久化；整个红灯掩盖 partial success，不是全源中断 | Buffer 失败触发全局 failed；需要每源 outcome、collectedAt、数据期、degraded 总结，关键错误仍报警，保留全部有效快照。验收单源失败不抹其他数据，也不伪造全健康 |
| GSC Domain / Blog | 11/11 15:48:36 / :44 实际 collectedAt，数据期至11/09；同次步骤成功 | 有新业务数据；Domain包含Blog，不能相加；窗口内最近单源失败未逐次取证 | #155 的旧权限故障已恢复，不再要求重复授权。现有 service account；验收独立快照、scope/延迟标记与 collector outcome |
| GA4 / GA4 Admin | 11/11 15:48:47 / :48 成功 | 主站0 sessions、Blog5；有采集不等于主站埋点正确。最近失败未知 | 主站测量缺口已观测，tag/consent/hostname/filter 根因未知；需当前部署HTML、Hostinger PUBLIC_GA4_MEASUREMENT_ID、用户同意后的测试事件和官方报表。不得绕过 consent |
| Clarity | 11/11 15:48:49 成功；最近失败未知 | 真实新快照，3天聚合不能当单日；用户行为值可为0 | 数据管道本次成功；需新鲜度与受同意控制的真实tag验证，不额外调用导出额度 |
| Bing | 11/11 15:49:01，collector和acceptance成功；最近单源失败未知 | 新快照，查询/页统计周更，不能宣称实时；历史验证问题不能当当前事实 | 本次正常；保持主/Blog verified、7方法、feed与有界诊断，现有API key；无新增增长探测 |
| StripCash | 11/11 15:49:03 成功；最近失败未知 | 聚合API返回0，不是某个确定时间窗的零收入 | 默认聚合时间语义未知；保留 reportScope，不能与第一方累计数据直接对账。需官方时间/币种语义及同scope证据 |
| Affiliate attribution | 11/11 15:49:04 成功；最近失败未知 | 41 clicks /13 postbacks /1 matched /12 unmatched；UNKNOWN币种224.25，不能计为确定币种收入 | join gap已证实，根因未知；p1连字符/下划线并存仅是线索，不能据此改历史身份。需匿名事件ID、postback映射、scope/currency合同；验收幂等、唯一join和不重复收入 |
| Main / Blog public health | 成功42948635193（11/11 10:49）；失败43007239882（18:52），Enforce oracle result | 同次 standalone main/blog通过，oracle main/blog fetch失败；AVCams未列 required failure | 传输/runner/CDN原因未知；不能宣称全站宕机或擅自认定WAF。需artifact状态码、安全底层错误码、request timing/重定向证据；通过新oracle验证 |
| AVCams | 上述 oracle 日志未列 required failure；详细HTTP/最近provider故障未知 | 上游管理，canonical/sitemap仅warning；第一方attribution另有快照 | 需独立homepage/robots/sitemap输出，不用主站健康代替；不可擅改上游或affiliate归因 |
| Control Plane authority | mode=shadow；42998582501（11/11 17:50）绿色 | readiness运行不表示authority提升；AUTO_PROMOTE=false | 保持shadow，不借恢复提升权限。数据库当前mirror状态未读，不能声明健康；新三cycle及原readiness规则验证后另审 |
| ChatGPT任务边界 | 只读peek确认Producer Heartbeat暂停（last_run11/06），Growth Engine暂停（last_run10/29）；旧Daily/Weekly/Growth Ops暂停 | 当前无这两个任务争抢生产；Heartbeat prompt有旧LEGACY段，Growth Engine仅observer | 不自动启用旧任务。恢复时仅一个外部wake owner，不能让观察者发送/生成；先复核prompt与当前R1、权限、告警及out-of-band分支 |

## 多入口与单写入者审查

Scheduler 的 schedule、workflow_run、手动 wake 共用 `editorial-producer-scheduler-r1`；canonical Producer reusable/manual 共用 `editorial-hourly-producer`，cancel-in-progress=false。bridge 只接受 bot 分支成功的可信 push，不直接生产。目前没有证据证明存在两个同时获准的 R1 writer。

**锁覆盖范围不等于整个系统 exactly-once。** `editorial-batch-publish`、历史 backfill、editorial-distribution、WordPress publisher 仍是不同代码路径；它们和 native outbox / social-distribution / telegram-evergreen 的写入或发送不全共享R1锁。尤其 social-distribution 直接 Buffer + Telegram、evergreen 直接 Telegram；cap/journal集中化前不得当作备用发送路径。历史 workflow 的存在不证明它正在执行，分页窗口未观察到这些旧 publisher 的运行，是否仍有外部 WordPress webhook 调用未知。

#164 是离线 Keyword Intelligence + 历史审计，当前范围不合并。#165 的4提交/31文件混合 outbox、布局、遥测等，仍Draft；只读元数据确认未合并。其具体 diff/CAS/五条旧route切换尚未完成逐行审查，不能声称本次已验收或直接合并。

## 本 PR 修复、验证和回滚

生成器：给所选分类提供完整占用标识；仍由全库存 duplicate/semantic-overlap/compiler/事实质量门最终裁决。240秒请求deadline；固定安全 provider错误码区分额度、限流、鉴权、权限与其他HTTP错误，不打印远端body，不新增 provider retry / fallback，不改变财务配置。

验证：41/41离线R1+generator+provider测试；`npm run check`（1634 source/public）通过；production-indexable build与`check:prod-seo`通过。Node24.19本地，CI仍使用Node22；未更改依赖。第一次本地build因Astro telemetry写home路径失败，设置ASTRO_TELEMETRY_DISABLED=1后通过，没有修改home。未进行在线模型、社交或生产部署验收。

上线前回滚是关闭Draft。若以后合并出现问题，通过新的codex PR revert这几个代码文件，保留receipt/checkpoint/ledger/outbox历史；没有新的schema或runtime toggle要回滚。

## 后续执行门（未完成项）

1. 完成 #165 逐行审查并拆出独立outbox修复；加入持久attempt journal、未知发送对账、跨入口caps、Buffer月窗口预算。先离线mock quota/ambiguous send、后受控真实验收。
2. 独立数据PR：每源collection outcome与freshness、旧Buffer显式stale/unknown；任何degraded状态应可见，不通过删除final gate掩盖失败。
3. 解码最新健康artifact，补传输诊断；核实Hostinger当前build配置、GA4 tag和consent-approved事件；只读匿名归因事件确认identity/currency。仅有聚合数字不能修复历史join。
4. 确认现有API额度恢复及当前main CI通过。暂停Scheduler并排空所有相关writer，再重新核对receipt SHA/manifest/ledger；若证据仍符合原runbook，SHA保护仅调整attempts、保留完整历史和失败状态。**这些前提未满足，不执行rearm。**
5. 一次新的自然wake：恰好五个独立有效guide、五个真实200、指纹匹配、Ledger close、零重复；再连续三cycle与24小时观察，72小时cadence基线。未达到前不宣称无人值守恢复，不启动SEO扩产/关键词实验。

需要的外部配合是核实既有API账户额度，以及提供当前环境的合法Hostinger只读/生产观测路径或由已有Actions输出证据；不要在聊天发送任何Secrets。72小时验收尚未开始，不能在一次PR绿灯中代签。
