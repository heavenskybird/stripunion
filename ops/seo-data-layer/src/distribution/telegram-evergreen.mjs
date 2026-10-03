import { publishTelegramEvent } from './telegram.mjs';

const content = [
  {
    title: 'Live rooms change constantly — see who is online now',
    excerpt: 'StripUnion now brings current Live Now discovery into the research flow before you continue to AVCams.',
    url: 'https://stripunion.com/avcams'
  },
  {
    title: 'Compare live-cam models before you spend',
    excerpt: 'Public-room discovery, token spending, private interaction and mobile use are different decision factors. Start with the model that fits you.',
    url: 'https://stripunion.com/best-live-cam-sites'
  },
  {
    title: 'What “free live cams” actually means',
    excerpt: 'Free public-room browsing and paid interaction are different layers. Compare what is available before tokens or private features begin.',
    url: 'https://stripunion.com/best-free-live-cam-sites'
  },
  {
    title: 'Looking for a Stripchat alternative?',
    excerpt: 'Start with the reason you want to switch: discovery, pricing, mobile experience or private interaction. Then see which live model fits.',
    url: 'https://stripunion.com/stripchat-alternatives'
  },
  {
    title: 'Tokens: compare the action cost, not just the package',
    excerpt: 'Tips, interactive features and private minutes can consume tokens differently. Understand the spending model before you buy.',
    url: 'https://stripunion.com/stripchat-pricing'
  },
  {
    title: 'xHamster Review 2026: site overview, features, pros & cons',
    excerpt: 'A practical editorial overview of browsing, search, mobile use and content-quality trade-offs.',
    url: 'https://stripunion.com/xhamster'
  },
  {
    title: 'F95Zone Review 2026',
    excerpt: 'Adult games, visual novels, mods, community discussion and download-security trade-offs in one practical overview.',
    url: 'https://stripunion.com/f95zone'
  },
  {
    title: 'Public rooms vs private-first experiences',
    excerpt: 'These are different product models, not just different brands. Decide how you want to browse and interact before comparing price.',
    url: 'https://stripunion.com/best-live-cam-sites'
  },
  {
    title: 'Mobile live cams: browser experience matters',
    excerpt: 'Discovery, chat, token purchase and private-session controls matter more than whether a platform advertises a separate app.',
    url: 'https://stripunion.com/stripchat-app'
  },
  {
    title: 'Research on StripUnion, browse live on AVCams',
    excerpt: 'Use reviews and comparisons to narrow the decision, then move into current live-room discovery when you are ready.',
    url: 'https://stripunion.com/avcams'
  },
  {
    title: 'Want to broadcast instead of watch?',
    excerpt: 'Viewer access and creator registration are separate paths. Review the creator route before starting a model signup.',
    url: 'https://stripunion.com/become-a-cam-model'
  },
  {
    title: 'Webmaster or affiliate traffic?',
    excerpt: 'StripUnion keeps viewer, creator and webmaster acquisition as separate funnels so each visitor reaches the right next step.',
    url: 'https://stripunion.com/stripcash-affiliate-program'
  }
];

function trackedUrl(rawUrl, index) {
  const url = new URL(rawUrl);
  url.searchParams.set('utm_source', 'telegram');
  url.searchParams.set('utm_medium', 'community');
  url.searchParams.set('utm_campaign', 'evergreen');
  url.searchParams.set('utm_content', `slot_${index}`);
  return url.toString();
}

function chooseIndex(now = new Date(), slot = 0) {
  const day = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000);
  return (day * 3 + slot) % content.length;
}

if (process.argv.includes('--self-test')) {
  if (content.length < 9) throw new Error('Evergreen content bank is too small.');
  const urls = new Set();
  for (const item of content) {
    const url = new URL(item.url);
    if (url.hostname !== 'stripunion.com' || !item.title || !item.excerpt) {
      throw new Error('Invalid evergreen Telegram item.');
    }
    urls.add(url.pathname);
  }
  if (urls.size < 6) throw new Error('Evergreen Telegram rotation lacks destination diversity.');
  for (const slot of [0, 1, 2]) {
    const index = chooseIndex(new Date('2026-10-03T00:00:00Z'), slot);
    if (index < 0 || index >= content.length) throw new Error('Evergreen slot selection is invalid.');
  }
  console.log('Evergreen Telegram rotation self-test passed.');
  process.exit(0);
}

const slot = Number(process.env.EVERGREEN_SLOT || 0);
if (!Number.isInteger(slot) || slot < 0 || slot > 2) {
  throw new Error('EVERGREEN_SLOT must be 0, 1 or 2.');
}

const index = chooseIndex(new Date(), slot);
const item = content[index];
const date = new Date().toISOString().slice(0, 10);

await publishTelegramEvent({
  ...item,
  url: trackedUrl(item.url, index),
  post_id: `evergreen-${date}-${slot}`,
  source: 'evergreen'
});

console.log(JSON.stringify({
  ok: true,
  slot,
  contentIndex: index,
  destination: new URL(item.url).pathname
}, null, 2));
