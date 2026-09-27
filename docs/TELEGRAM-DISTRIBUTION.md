# Telegram Distribution

StripUnion uses Telegram as an independent social-distribution channel outside Buffer.

## One-time setup

1. In Telegram, create a **public channel** for StripUnion. A public channel username is preferred because it can be used directly as the Bot API chat identifier, for example `@stripunion`.
2. Open **@BotFather**, run `/newbot`, create a StripUnion publishing bot, and copy the bot token.
3. Add the bot to the StripUnion channel as an **administrator** with the minimum permission required to **Post Messages**. It does not need permission to add administrators or manage unrelated channel settings.
4. In GitHub repository **Settings → Secrets and variables → Actions**:
   - add secret `TELEGRAM_BOT_TOKEN`
   - add variable `TELEGRAM_CHANNEL_ID` with the public channel username including `@`
5. Never commit the bot token or paste it into chat, issues, pull requests, source files, or WordPress.
6. Publish a normal WordPress article. The existing Growth Bridge dispatches the article to the GitHub `social-distribution.yml` workflow. Buffer/X and Telegram then receive the same event independently.

## Behavior

- If Telegram credentials are absent, the Telegram step exits successfully and Buffer continues to work.
- The Telegram publisher fetches the published article and uses its public `og:image` / `twitter:image` when available.
- If no image is available, it falls back to a text post with the canonical article URL.
- Telegram posting is independent from Buffer, so a Buffer outage does not require Telegram credentials to be shared with Buffer.
- The bot is a publisher only. It is not used for direct messages, member scraping, unsolicited outreach, or automatic group joining.

## Growth use

The channel should be treated as a broadcast product, not a chat room. Daily automation can publish:
- new reviews and comparisons;
- pricing / token guides;
- selected creator/model referral guides;
- high-performing evergreen content when there is a clear update or new angle.

Member growth should come from opt-in promotion: links from StripUnion, the blog, X, future approved social channels, and relevant communities where promotion is allowed.
