# Reliability Sprint R1

状态：分支实现与离线验证完成；尚未合并、部署或完成生产调度验收。日期：2026-10-11，Asia/Shanghai。

## Bootstrap 与边界

- canonical origin：`heavenskybird/stripunion`；默认分支 `main`。
- 从实时 fetch 的 `07357704dd386c9fd550971b3c39f01c2206543a` 建立 `codex/reliability-r1`，工作树为 `D:\AIcoding\stripunion\.worktrees\reliability-r1`。
- 原工作树在 `codex/two-site-growth-control-plane`，已有六个修改文件和多个未跟踪增长文件；全部保留，没有 stash/reset/覆盖。
- 已读取 `AGENTS.md`、`README.md`、`SEO-DATA-LAYER.md`、`AUTOMATION-SETUP.md`、`CONTENT-FACTORY.md`、`FIRST-PARTY-EDITORIAL-PUBLISHING.md`、`RESILIENT-GROWTH-RUNTIME.md`、`AUTONOMOUS-GROWTH-ENGINE.md`、`GROWTH-CONTROL-PLANE.md`，并核对相关工作流与实际源码。README 的迁移时期状态不作为当前部署证据。
- 不修改生成器、选题/质量规则、五篇合同、已发布 guide 或现有 Ledger 数据；不调用 OpenAI、Supabase 写 API、历史 Producer 或社交发布；不修改生产 Secrets、DNS、账单。
- `mode.json` 在 bootstrap 时为 `shadow`。R1 仅将现有自动提升工作流设为 `AUTO_PROMOTE=false`，继续评估 readiness，保留 shadow authority。

## 调度审计与实现

旧 Scheduler 六个 cron 时间点、kick push、六类 workflow_run 和 workflow_dispatch 共用一个 `cancel-in-progress=true` 组。一个新事件能取消正在查询或 dispatch 的调度器；dispatch 请求成功但尚未进入 run list 时会出现证据空窗。失败创建时间超过十分钟就再次 dispatch，没有失败次数上限。workflow_run 未过滤 PR/非 main 来源。Producer 的单独 concurrency 只能排队，不能让重复的手动请求自行去重。

R1 将 Scheduler 改为直接调用 reusable Producer，完全移除 Producer dispatch 和自动 enable 操作。Scheduler 使用独立、不取消运行中的 concurrency group，pending wakeups 可以合并。所有入口在 Producer job 上共用原来的 `editorial-hourly-producer` 锁，取得锁之后重新拉取 main，再判断是否到期。自动入口和手动入口都受同一 admission 限制；没有强制跳过的输入。

`workflow_run` 只接受同仓库、main、非 pull_request 来源。Scheduler/Producer 都只从 main 执行生产。GitHub Actions 的队列不保证 FIFO，因此这里将事件视为 wakeup，按持久化时间重新评估；不依赖某一个特定 cron，也不补派四个小时对应的四个批次。

锁属于 Actions，而非 Git/Supabase。小型运行审计 receipt 存在隔离分支 `codex/editorial-r1-runtime` 的 `ops/control-plane/editorial-r1-receipt.json`，只记录运行身份、cycle identity、开始/完成时间、状态、失败次数及最近 200 个 run ID。runtime 使用已有 `GITHUB_TOKEN` 的 contents 权限，首次自动创建该分支；更新必须携带文件 SHA，409/403/API 超时/损坏记录一律停止，不能回退为“没有记录、允许生产”。该分支不部署，也不合并 main。

- 成功周期沿用原来的 52 分钟 cadence。
- 未完成/失败周期采用十分钟 backoff，最多三次 admitted attempts；包括崩溃/被取消后仍为 running 的 receipt。
- 对已见 run ID 去重；拒绝 `GITHUB_RUN_ATTEMPT != 1` 的历史重跑。
- 第一次从真实旧 Producer run history 初始化，保留最近的 cooldown，不能因更换调度器立即再生产一批。
- 到达上限后保持可见失败，需要人工判断根因和恢复，不持续消耗生成/构建资源。
- 本分支部署前不创建 runtime branch、不写生产 receipt。

官方依据：[可复用工作流](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)、[Actions concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)、[Contents API 与 SHA 更新](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents)。

## Commit → Deploy → Verify → Ledger

| 断点 | R1 行为 |
| --- | --- |
| 生成或 preflight 失败、尚未 push | 不声称发布成功；下一次 admission 有 backoff/次数限制。未提交的 worker 输出仍可能丢失，这是现有边界。 |
| 内容 push 成功、Hostinger 尚未部署 | 五篇 manifest 与内容同一提交，保存在 `ops/editorial/pending-publication-batch.json`；HTTP/部署证据不足时不写 Ledger、不入队。 |
| URL 已 live、部分本地 Ledger/outbox 已写、closure push 失败 | main 上原五篇 manifest 仍存在；新运行恢复相同五篇，generatedCount=0，跳过重新编译，重新真实验证，不重新选题。 |
| Ledger closure 已 push、success receipt 写失败/进程中断 | closure 提交保留 phase=closed 的原 manifest；同一 cycle 恢复并幂等关闭。 |
| 新 cycle 在内容提交前失败 | 旧 phase=closed manifest 的 cycle identity 不匹配，恢复器跳过它，避免用上一批五篇假冒新周期。 |
| 发布 closure 完成、后续 mirror/report 失败 | 已成功 receipt 不会被 ancillary failure 改回 failure，不立即启动另一批生产。 |

已有 Ledger 记录在 recovery 中不会回退到 distribution_pending，不改变 published_at。原 distributed 完成路径仍能单调升级 pending 记录到 distributed；损坏 JSON 明确失败，不覆盖证据。Outbox 继续使用原有 slug/channel 文件与 idempotency key；本次没有改变额度或消息生成规则。

`scripts/check-live-publications.mjs` 要求五个不同的 canonical guide URL，拒绝凭证、query/hash、跨 origin URL。请求使用 manual redirect；只允许同 HTTPS origin、同 guide 路径的 301/308 尾斜杠规范化，最多两跳，整个跳转链共用请求超时。最终成功只接受真实 200。

| 状态 | 分类/恢复 |
| --- | --- |
| 401/403 | access-denied，当前验证立即失败；不能用其他四篇、health oracle 或部署指纹抵消。 |
| 404 | not-deployed，在有边界的等待内重新探测；持续 404 永不进入 Ledger。 |
| 429 | rate-limited，有上限 backoff；不持有或打印远端错误正文。 |
| 500–599 | server-error，有上限 backoff；持续故障永不成功。 |
| transport timeout/error | 状态 0，保留安全错误类型；不记录可能携带凭证的错误消息。 |
| 未许可的 3xx/其他状态 | terminal unexpected response，不把跨 origin、跨 guide、首页/挑战页、query/凭证或循环跳转作为发布。 |

默认总期限十分钟，最多三十轮，每请求七秒超时，15/30/60 秒 backoff；sleep/request timeout 均裁剪到剩余期限。参数还设有硬上界（最大十分钟、四十轮、十秒请求超时），不能配置无限重试。

每次 Astro build 自动输出 `/publication-deployment.json`，包含 guide source 的 SHA-256 指纹，不包含凭证、内部 payload 或文章全文。Verify 必须同时满足五个真实 200 和本批五个指纹匹配。允许更新的部署包含其他新 guide，不要求整个站点与旧 commit 完全相同。旧/缺失/损坏/超出 512 KB 的指纹均不能证明部署成功。

这是“生产构建内容已可见”的部署证据，并非 Hostinger provider job 状态查询；本次没有新增 Hostinger API 凭证或远程自动 redeploy。最终请求日志和安全 JSON 结果保存在 Actions 日志及 `publication-verification-<run-id>` artifact，保留十四天。

## 变更文件

| 文件 | 目的 |
| --- | --- |
| `.github/workflows/editorial-producer-scheduler.yml` | reusable call、多源来源过滤、取消重复 dispatch、非取消式 coalescing。 |
| `.github/workflows/editorial-hourly-producer.yml` | 共用 job 锁、admission gate、精确 checkpoint/recovery、指纹验证、失败记录与证据。 |
| `.github/workflows/control-plane-authority-promotion.yml` | 禁止 R1 期间自动提升。 |
| `.github/workflows/build.yml` | CI 运行无外部调用的 R1 suite；忽略独立 receipt 更新。 |
| `scripts/editorial-r1-runtime.mjs` | 有 SHA 防护的 admission receipt、限次恢复、五篇 manifest 生命周期。 |
| `scripts/check-live-publications.mjs` | 状态分类、双重边界、部署证据、可导入测试与安全日志。 |
| `scripts/publication-deployment.mjs` | 构建指纹生成与复用。 |
| `scripts/record-astro-publication.mjs` | 保留既有 Ledger、禁止 recovery 降级、允许分发完成升级。 |
| `astro.config.mjs` | 注册轻量构建完成 hook，无新增依赖。 |
| `scripts/test/reliability-r1.test.mjs` | 30 项离线测试，含临时文件中的真实 checkpoint/Ledger CLI 测试。 |
| `docs/CONTENT-FACTORY.md`、`docs/GROWTH-CONTROL-PLANE.md` | 更新 canonical 运行说明。 |
| `docs/RELIABILITY-R1.md` | 本报告、优化建议、风险及 runbook。 |

## 验证结果

- Node.js 22.23.3（官方 Windows archive，SHA-256 对照官方 SHASUMS256）；另外早期在本地 Node 24.14.0 验证。依赖按仓库现有 `npm install` 路径安装，未增加依赖或 lockfile。
- `node --test scripts/test/reliability-r1.test.mjs`：30/30 通过。覆盖 cron 漏触发、重复/手动触发、历史 rerun、并发 SHA 冲突、API fail-closed、403/404/429/5xx、部分 URL 失败、真实 abort 超时、部署延迟/陈旧指纹、deadline/attempt ceiling、精确五篇恢复、partial Ledger、不可变发布时间及 closed-cycle 恢复；并覆盖真实生产尾斜杠跳转模式、最终故障、跨页跳转与循环上限。
- `node scripts/check-live-publications.mjs --self-test`：通过。
- actionlint 1.7.12（官方 release/checksum）：四个变更 workflow 校验通过。Windows 没有 ShellCheck，本次 actionlint 明确禁用其调用；现有 shell 块另经 diff 审阅。
- `npm run check`：419 个 source/public 文件通过。
- `PUBLIC_ALLOW_INDEXING=false npm run build` 与 staging robots artifact 检查：通过。
- `PUBLIC_ALLOW_INDEXING=true PUBLIC_GA4_MEASUREMENT_ID=G-TEST123456 npm run build`、`npm run check:prod-seo` 与 GA4/Clarity artifact 检查：通过；449 个静态页面。测试 measurement ID 不写入配置或已发布内容。
- 本地构建指纹覆盖 360 个 guide 模块，并与 source SHA-256 全量比对一致。
- `git diff --check`：通过。Draft PR [#152](https://github.com/heavenskybird/stripunion/pull/152) 已创建；实现提交 `baf97be`、`c4faf6a` 的 [push Build](https://github.com/heavenskybird/stripunion/actions/runs/38107880922) 与 [PR Build](https://github.com/heavenskybird/stripunion/actions/runs/38107883566) 均通过。后续报告更新的最新 checks 以 PR 为准；没有合并 main。
- 测试全部使用 mock HTTP、模拟状态存储或临时文件，不 dispatch/rerun 任何历史 Producer，不访问真实 OpenAI/社交发布。此次不声称生产 R1 已通过。

只读运行证据：[最近成功的 Producer](https://github.com/heavenskybird/stripunion/actions/runs/38101793893)；[前次失败运行](https://github.com/heavenskybird/stripunion/actions/runs/38093278768) 的 jobs API 确认失败于 Wait for production and enqueue native social outbox。首次 sandbox 内日志下载返回 GitHub API 403；随后通过已有认证 CLI 的正常只读路径成功读取，日志明确记录 `PUBLICATION_LIVE_CHECK_FAILED`，五个真实 HTTP 403 URL 分别为：

- `/guides/adult-games-storefront-license-and-update-checklist`
- `/guides/adult-shop-total-order-cost-comparison`
- `/guides/webmaster-affiliate-report-reconciliation-workflow`
- `/guides/premium-video-subscription-plan-fit-audit`
- `/guides/live-cam-room-discovery-filter-evaluation`

没有重跑该历史 Producer。日志权限限制已排除；这些 403 必须作为当次真实发布验证失败保留。仅凭日志不能归因到 Hostinger/WAF/CDN 的具体规则，本次没有修改规则或生产配置。

直接只读生产 HTTP 抽查确认既有 `/guides/adult-affiliate-webmaster-program-evaluation-guide` 返回 301 到同路径尾斜杠，再返回真实 200。修正后的 probeUrl 同样记录原 301 和最终 200；因此加入两跳以内的严格同 guide 规范化支持，不修改公开 canonical URL。

## 十四天视觉证据存储压力

2026-10-11 只读 Actions artifacts 分页 API 快照：

| 未过期类型 | 个数 | 压缩字节总量 | 单个范围 |
| --- | ---: | ---: | --- |
| editorial-hourly-visual-qa | 81 | 2,519,841,277 | 27.38–37.57 MB |
| visual-qa-local | 37 | 1,298,074,773 | 8.52–37.34 MB |
| visual-qa-production | 28 | 902,681,828 | 0.65–35.20 MB |
| 合计 | 146 | 4,720,597,878 | 约 4.72 GB / 4.40 GiB |

实际 inventory 并不等于 billing API 的已计费量。本仓库 visibility=public，但没有检查账户实际 plan、共享 storage quota 或支出限制，也不因此承诺 artifact storage 自动免费。官方说明区分公共仓库标准 runner 计算费用与 storage：[Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)。

按测得均值，Producer 与 production Visual QA 各每小时一个 artifact、持续十四天，估算约 `(31.11+32.24) MB × 24 × 14 = 21.3 GB`，还没有包含 PR/local 截图和其他 artifacts。这是满 cadence 估算，不是实际十四天已运行量。

建议后续单独批准分层存储，而非继续把所有成功 PNG 留十四天：

1. 将 JSON 报告、HTTP/deployment 证据、截图尺寸与 SHA-256 manifest 分离，完整保留十四天；小型证据不依赖 PNG 重复压缩。
2. 失败与 release/验收代表批次保留全页截图十四天；常规成功截图仍产生并可下载，但缩短到一日。成功一日 PNG 仍约 1.52 GB，单靠缩短 retention 不能保证落在免费额度内。
3. 如免费 storage 不足，成功报告十四天、每日代表性截图一次十四天约 0.89 GB，也可能超过额度。需再按实际免费 headroom 计算采样频率/PNG 字节预算，必要时把完整证据导出至现有本地存储或已有且确认无新增费用的容量，验证导出 manifest 后再清理。
4. 清理机制只处理可证明重复/已成功导出的 artifacts，先 dry-run 列出 run ID、大小与证据位置；保留失败样本，禁止为了省空间删除唯一事故证据。存储上限应明确报警/停用新增冗余截图上传，不能通过购买容量恢复。
5. 此次不改变既有十四天 screenshot retention、不删除任何历史 artifact、不升级 plan、不配置账单。账户 quota/budget 和可用零付费归档位置需要人工确认后，才能做实质性零付费保证。

## 未解决风险与人工配合

1. **部署前排空旧工作流**：本次没有 merge。批准上线时，先在 Actions 暂停 Scheduler，等待所有正在运行的旧 Producer 完成（尤其是持有旧 manifest 的运行），确认没有外部任务直接 dispatch Producer。再审阅并合并本 PR；不能在旧 Producer 中途替换脚本后重跑历史 run。
2. **首次生产验收**：确认 Hostinger 部署本 PR 的正常 main build，直接读取 `https://stripunion.com/publication-deployment.json`，确认 200/version=1。再恢复 Scheduler；等待一次自然 cron admission，不手动派发 Producer。检查 R1_ADMISSION、receipt branch、单个五篇 manifest、全部 PUBLICATION_PROBE 结果和 Ledger closure；重复 wakeup 应 skip，pending 不应取消正在执行的 writer。
3. **403 根因**：历史日志已通过认证只读路径取回，五个 403 已确认，无需 Kenny 手工转发日志。若上线后 403 再现，管理员应将新 run 的时间、五个 URL、User-Agent 和 PUBLICATION_PROBE 证据与 Hostinger/CDN 已有访问/防护日志对照，确定拒绝来自哪一层。不得因其他 URL 200 或 oracle 正常把该批次标记成功；配置变更需另行授权，本次没有提升 token scope 或修改凭证。
4. **重试上限恢复**：发生 cycle-retry-limit 时，先暂停 Scheduler、等 writer 排空；检查原 manifest/五个源文件/verify artifact/Hostinger 部署。修复实际问题后，在 GitHub 的 `codex/editorial-r1-runtime` 分支编辑 `ops/control-plane/editorial-r1-receipt.json`，只将 attempts 调整为 1，保留 status=failure/running、cycleId、runId、recentRunIds、startedAt 和原 manifest。必须记录人工原因；这给同一 cycle 两次额外有上限尝试。恢复 Scheduler，等待新的自然 wakeup。禁止删 receipt、伪造 success、重跑历史 Producer，或重新生成已提交批次。
5. **first-attempt API 写失败**：admission 以 SHA 写 receipt 成功后若 runner 恰在写 GITHUB_ENV/output 前中断，会保留 running receipt；下次仍受 backoff/三次上限控制。不存在 receipt 写失败后的 permissive fallback。
6. **其他写入者**：single writer 限于自动/手动 canonical Producer。旧 editorial-distribution、人工 PR merge、社会 outbox 的元数据提交仍是独立写入者；现有 rebase retry 可能遇到语义冲突，会失败并保留 checkpoint，不自动消解不明确冲突。未在 R1 重构所有发布渠道或改造分发为 exactly-once。
7. **时间保证**：GitHub cron 可以延迟或丢弃；多源 wakeup 能降低漏触发影响，无法保证每小时精确触发或实际 120/24h。全源中断要人工查看 Actions，不增加外部付费 scheduler。
8. **API/branch rules**：既有 GITHUB_TOKEN 的 contents write 需要允许 runtime branch 创建/更新；遇到组织 ruleset 阻挡即失败，不削弱保护。只有独立分支的 receipt 写入通过 mock/CAS 测试，尚无真实 hosted acceptance。
9. **证据限制**：公开 build marker 证明内容部署可见，不是 provider deployment job/日志状态；十分钟后仍延迟会停在原批次并限次恢复。达到三次失败后必须处理根因。
10. **免费存储**：确认账号当前免费 storage headroom、是否存在共享占用及可用的零费用归档位置，再决定第 5 节的具体留存/采样预算。

## 回滚

合并前：关闭 PR 即可，生产无 R1 变化；保留独立分支供检查，不触碰原工作树。

合并后：暂停 Scheduler 并排空 writer，从当前 main 建立新的 `codex/*` repair 分支，通过 PR revert 本次 R1 代码提交（不要 reset main，不回滚任何后来内容提交）。保留 `pending-publication-batch.json`、Ledger/outbox 与 runtime receipt 供诊断；原恢复器可基于 canonical publishing 状态恢复，但应人工核对原五篇清单。

如果需要继续保留 shadow，回滚 PR 必须将 authority-promotion 的 AUTO_PROMOTE 保持 false；完整 revert 会恢复旧自动提升行为，应在 review 中显式拦住。指纹 hook 的移除不会改变 guide URLs/文章。runtime branch 不需要删除，保留其审计记录；确认回滚后的来源、concurrency 与重试行为后再恢复 Scheduler，不并行运行新旧 Scheduler。
