# EXTERNAL-ACCESS-REQUIREMENTS

本次离线 V0 不需要新凭据；不要把 key/token 粘贴到 chat、PR 或文件。已有 Actions Secrets 不等于本会话可读可用；当前环境 bindings 为空。本次也不要求导出这些秘密。

| 用途 | 凭据/权限最小要求 | 当前证据/owner 下一步 |
|---|---|---|
| 仓库审计 | GitHub repository contents read、Actions read、日志/artifacts read | connector 已能读 main/receipt/jobs/logs；CLI API 网络不可用，使用正常 connector；部分 inventory endpoint 不被支持，enabled state UNKNOWN |
| Draft PR | 同仓库 codex/* contents write、pull requests write | AGENTS 已授权常规 delivery；只创建 draft、不 merge、不改保护；远端实际许可由响应确定 |
| GSC | 既有 GOOGLE_SERVICE_ACCOUNT_JSON；webmasters.readonly OAuth；service account 对三个 property 的只读授权 | Main/Blog 历史快照存在；AVCams 未确认。owner 确认 property 可见性/原账号授权，不新建重复 collector |
| Bing | 既有 BING_WEBMASTER_API_KEY 与 BING_SITE_URLS；已验证站点访问 | 历史快照 Main/Blog verified；需后续自然 collector 验证当前授权；现 collector 会 SubmitFeed，未来独立只读模式需另案，不在审计运行 |
| Google Trends | 可用且许可的官方接口/导出访问；明确国家/语言/period/类别 | 当前 UNKNOWN；owner 确认可用产品/配额/条款，未确认前只接本地导出，不选未许可 scraping 库 |
| Keyword Planner | Google Ads developer token、OAuth client/refresh authorization、目标 customer（如适用 manager login customer）、googleads scope | 未验证任何 Ads 访问级别/成人关键词资格；owner 经安全凭据渠道配置后再做只读验收；不创建 campaign/预算、不保证所有成人词返回 |
| 竞争网站 | 配置 allowlisted HTTPS hosts、robots/条款许可、低速 bounded fetch | 复用现有 collector 的 sitemap/metadata；上线前补 robots disallow policy 验收（当前读取 robots 但不能据此宣称完整 robots 合规）。无登录/付费墙绕行 |
| SERP/backlinks | 可选 licensed provider read key、明确国家/设备/语言与调用预算 | 无必需依赖；owner 单独批准供应商、费用上限/保留期后才实现调用 |
| Hostinger read-only | Hostinger 账户授权/apiToken、网站 inventory、Node builds/settings/detail/logs、Git installation/settings 可读；真实 username/domain 由 list 得到 | 官方包定义已查，账户权限 UNKNOWN；无可调用 Hostinger tools，本次不注册 MCP、不改本地/生产配置。若以后要账户验收，连接官方 hosting MCP 后先只读 list |
| Hostinger deployment | build POST 的账户资格、同 customer Git installation、正确 repo/branch、核准现有 build settings | 本任务明确禁止；以后需 owner 单独批准指定域/资源、移动 SHA 风险、覆盖后回滚证据；不得把任何“Redeploy”按钮当通用 API |
| Supabase | 后续只读观察使用经 RLS/权限限定的读取路径；现有写密钥仅留 Actions | authority=shadow 保持；无需分享 service-role，不应用 migration；runtime DB 状态仍 UNKNOWN |
| WordPress | 未来 inventory 只读角色/REST listing 授权 | 当前无实时草稿导出；不要为只读审计使用 publish/media 写路径。已有 publisher Application Password 不在本会话读取 |
| Social | Buffer postsRead/insightsRead 等只读；Telegram/X 仅看已有 delivery evidence | 不需要 postsWrite；不发送/重发测试消息；scheduled 需后续送达证据 |
| Affiliate attribution | 既有 StripCash/receiver 的只读统计、click/postback join 结果 | 不改 payout/commission；不能以 white-label traffic 或 aggregate revenue 构造 query conversions |

网络：环境为 restricted HTTP；GitHub connector 可用，CLI api.github.com 与 developers.hostinger.com 被代理拒绝。未来要直接 API 验收需通过正式环境配置允许对应官方域（如 Google API、Bing、Hostinger），不能换 proxy/绕路。配置不是健康证明：调用后检查各来源结果，不以环境 state=unknown 宣称网络已 enforced/凭据 ready。

当前 owner 无需提供任何秘密即可审阅 V0。后续动作优先：核对 Hostinger 12:04 内容提交后的 clone/build/logs 证据，确认五篇 404 的部署根因；这与批准自动恢复/部署是不同事项。
