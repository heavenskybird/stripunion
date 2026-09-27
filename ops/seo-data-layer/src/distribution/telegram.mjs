const token = process.env.TELEGRAM_BOT_TOKEN;
const rawChatId = String(process.env.TELEGRAM_CHANNEL_ID || '').trim();
const chatId = rawChatId && !rawChatId.startsWith('@') && !/^-?\\d+$/.test(rawChatId)
  ? `@${rawChatId}`
  : rawChatId;

function stripHtml(value = '') {
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function readEvent() {
  const raw = process.env.SOCIAL_EVENT_JSON;
  if (!raw) throw new Error('SOCIAL_EVENT_JSON is required');
  const event = JSON.parse(raw);
  if (!event.title || !event.url) throw new Error('Telegram event requires title and url');
  return event;
}

function buildText(event) {
  const title = stripHtml(event.title);
  const excerpt = stripHtml(event.excerpt || '');
  const body = excerpt ? `${title}\n\n${excerpt}` : title;
  const maxBody = 780;
  const trimmed = body.length > maxBody ? `${body.slice(0, maxBody - 1).trimEnd()}…` : body;
  return `${trimmed}\n\n${event.url}`;
}

async function discoverImage(url) {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'StripUnion-Telegram/1.0' }
    });
    if (!response.ok) return null;
    const html = await response.text();
    const patterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return new URL(match[1], response.url).toString();
    }
  } catch {
    return null;
  }
  return null;
}

async function telegram(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(`Telegram ${method} failed with HTTP ${response.status}: ${data?.description || 'unknown error'}`);
  }
  return data.result;
}

export async function publishTelegramEvent(event) {
  if (!token || !chatId) {
    console.log('Telegram distribution skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID is not configured.');
    return { skipped: true };
  }

  const text = buildText(event);
  const image = await discoverImage(event.url);
  let result;

  if (image) {
    result = await telegram('sendPhoto', {
      chat_id: chatId,
      photo: image,
      caption: text.slice(0, 1024)
    });
  } else {
    result = await telegram('sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: false
    });
  }

  console.log(JSON.stringify({
    ok: true,
    channel: chatId,
    messageId: result?.message_id || null,
    usedImage: Boolean(image),
    sourceId: event.post_id || null
  }, null, 2));

  return { skipped: false, result };
}

if (process.argv.includes('--self-test')) {
  const sample = buildText({
    title: '<b>Example title</b>',
    excerpt: 'A concise example &amp; summary.',
    url: 'https://blog.stripunion.com/example/'
  });
  if (!sample.includes('Example title') || !sample.includes('https://blog.stripunion.com/example/')) {
    throw new Error('Telegram copy self-test failed');
  }
  console.log('Telegram distribution self-test passed.');
} else {
  const event = readEvent();
  await publishTelegramEvent(event);
}