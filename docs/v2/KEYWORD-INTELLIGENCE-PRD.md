# KEYWORD-INTELLIGENCE-PRD

目标是为真实成年访客、合格联盟转化和可核实收入提供选题证据。增加文章数不是关键词系统的唯一目标。V0 不驱动生产，所有建议需去重、事实检查、分类覆盖与商业许可审核。

## 数据来源与真实性

| 来源 | 可回答 | 不可推出/接入状态 |
|---|---|---|
| GSC 现有快照 | 本站 query/page clicks、impressions、CTR、平均 position | 不是行业搜索总量/当前精确排名；匿名 query 与行限制；country/device cube 不与 query-page cube 拼成伪完整 join |
| Bing 现有快照 | 本站 query/page 各自统计、crawl/feed、backlink 样本、keyword research | query stats 无 page join；weekly cadence；research impressions 不等同 monthly search volume；SubmitFeed 有写副作用 |
| Google Trends | 市场/时间/类别限定 0–100 相对兴趣、上升主题 | 未确认官方访问；不得依赖未经许可 scraping；不换算绝对月量，不跨不同归一化样本直接比较 |
| Keyword Planner | 经授权的历史月量估计与 Ads competition | 需 Ads API developer token/OAuth/customer access；成人关键词可能受限/无返回；Ads competition 不是 organic difficulty |
| 公开竞争网站 | taxonomy、标题、sitemap URL、新旧页面和覆盖主题 | 只得内容主题假设，不证明这些域对某词有排名、流量或 backlink；遵守 robots/条款、限速、无复制正文 |
| 可选 licensed SERP/backlink | 带国家/语言/设备/时间的采样排名与 link evidence | owner 批准成本后才接入；非强依赖。GSC Wizard/Ahrefs/Semrush 不进入核心依赖 |

## 统一记录与证据粒度

model.d.ts 定义 keyword、normalized_keyword、language、country、search_engine、property、search_intent、topic_cluster、category、estimated_monthly_search_volume、volume_history、volume_trend、volume_source、data_confidence、our_rank、our_ranking_url、impressions、clicks、ctr、competitor_domains、competitor_rankings、seo_difficulty_estimate、backlinks、referring_domains、content_gap、cannibalization_risk、affiliate_relevance、opportunity_score、observed_at、source_updated_at 和 evidence。

EvidenceKind 区分 first_party_measured / provider_estimate / sampled_serp / model_hypothesis。每条 observation 保存 source/property、geo/language、measurement period、collection date、provider update date（未知为 NULL）与 limitations。多来源扩展应保留每个 metric 的 observation，不用一个“高置信度”覆盖所有字段。V0 一条记录是一条 date/query/page 观测，不是已聚合的 keyword master；未知语言/国家不猜 en/US。

NFKC+小写+折叠空白，保留标点/变音/中日韩字符；不靠 stem 或删品牌拼写归并 measured data。topic variants 只在独立 hypothesis 层映射。Identity 包含词、市场、引擎、property、page、period；同一测量日的更新 collection 替换旧值，重叠 31 日窗口不能相加；同时间相冲突数据 fail closed。不同日期/页面保留；多个 GSC cube 不重复导入。

GSC 分别存 Domain、Blog prefix、AVCams Domain；分析优先 Domain，Blog 仅作独立 drill-down/fallback，不能相加。用 Domain 内 page hostname 计算 Main/Blog分段。AVCams 单独 scope，未授权时 UNKNOWN。不同搜索引擎的 position 不能平均混算，白标 session 与 affiliate click 独立。

## 分类与聚类（设计，不自动写入 V0）

从现有 taxonomy 初始化 Live Cams、Adult Games、VR/AR、Dating/Hookups、Hentai/Anime、Premium Videos、Free Videos、Adult Shops；Affiliate/Webmaster 和 Privacy/Safety/Payment 是跨类意图/主题维度，避免为其强行覆盖已有 category slug。creator/model 保留 referral-only。

意图枚举 informational、commercial_investigation、transactional、navigational、creator_referral、webmaster_affiliate、unknown。先复用既有 topic mapping/内容 inventory、品牌词、比较/价格/取消/隐私等规则；再可选模型输出 hypothesis、reason/confidence。人工标注样本验证混淆率，禁止把未审模型分类当测量。聚类 canonical topic + intent + locale，先查 canonical URL，再提 refresh/差异化建议。

Cannibalization 仅把同市场/意图、相近日期两个以上 URL 的可观测 impressions 标为“需调查”，不能只因一个 query 多 URL 就删除/合并页面。首页/品牌 navigation、多语言/不同意图需排除。需最小样本与 7/14/30 日对照；未知覆盖不是 content_gap=true。

## 透明机会评分

模型版本 V0：demand .20、trend .10、ranking .20、difficulty .10、commercial .15、coverage .15、intent .10。所有输入先有来源、转换规则、范围 [0,1]、适用 period；difficulty 输入是“有证据的可竞争性”，不是 Ads competition。缺失值维持 NULL，在输出显示缺失权重与 coverage，不重新归一化给缺少证据的词高分。

Score = 100 × Σ(weight × known_signal) / Σ(all_weight) × confidence × freshness。

confidence、freshness 均 [0,1]；无已知 signal 则 score=NULL。权重可配置并校验；输出每项 value/weight/contribution、coverage、label=model-derived prioritization。未知 confidence 默认 0。新鲜度应同时考虑 collection 和测量窗口结束时间，例如 confidence=样本质量/来源可靠性，freshness=max(0,1-ageDays/sourceTTL)；后续校准，不能把示例阈值视为客观事实。

建议转换：verified volume 用冻结版本的 log 规模映射（不使用 impressions 冒充月量）；trend 用同源同市场可比窗口；ranking 用有足够 impressions 的 4–20 平均位置/CTR 改进空间；difficulty 必须 SERP/链接竞争证据；commercial 来自 approved offer/intent 与可验证 conversion；coverage 根据 inventory+canonical path；intent 为目标任务匹配程度。各转换、阈值、置信度另附 evidence rationale。

解释示例：仅 ranking=1，confidence=1、freshness=1 时 20 分、coverage=.20，其余指标 NULL；confidence=.5、freshness=.5 则 5 分。这是单元测试中的合成规划案例，不是任何真实关键词评分。当前快照报告不自动评分，避免未经校准赋权。

## 报告与验收

| 报告 | 即刻可做 | 新权限/证据 |
|---|---|---|
| Top Industry Keywords | Bing related seeds 的有限候选清单，明确覆盖偏差 | 完整行业/月量排序需 Planner/其他许可数据，不能称全行业 Top |
| Our Ranking Keywords | GSC 平均位置+URL，Bing query 平均位置，按 scope/date 分开 | 当前精确 SERP 需采样适配器 |
| Competitor Keyword Gap | 公共 metadata 主题覆盖假设 | 对手 rank/真实 keyword gap 需许可 SERP/数据导出 |
| Rising/Emerging | Bing 同源可比时间序列趋势信号 | Trends 授权；需最小样本/基期，不把“新出现”当增长 |
| Low Competition | 当前 UNKNOWN | 需 SERP/链接等证据与定义；不能只用低 Ads competition |
| Existing Optimization | GSC CTR/4–20 位置+内容 inventory，先人工评估 | 足够 7/14/30 日样本，避免一日噪声 |
| New Content | 现有 category coverage + distinct intent 候选 | 需求不足时标 hypothesis，无自动发布/造 review |
| Indexation Bottlenecks | Bing crawl/feed/index count 与 sitemap 缺口信号 | GSC URL Inspection 需配额/权限；feed accepted 不证明页面已索引 |

报告必须展示 period、source age、缺失数据、样本大小、score rationale、现有 URL 与建议动作；保留 zero/NULL 区别，导出 JSON 与 Markdown。不能承诺流量、收入或将模型报告自动变成 public pages。接受条件包括 scope 去重、更新窗口去重、无伪月量/难度、部分源失败可见、无生产 side effects。
