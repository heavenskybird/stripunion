export const categories = [
  {
    slug: 'live-cams',
    name: 'Live Cams',
    title: 'Live Cam Sites: Reviews & Comparison Guide',
    description: 'Compare live cam platforms by access model, interaction options, usability, privacy information and overall fit.',
    blurb: 'Live cam platforms combine public live rooms with optional paid interactions. Compare the discovery style, token or credit model, private options and mobile experience before choosing what to try.',
    factors: ['Free public access', 'Token or credit model', 'Private interaction options', 'Mobile usability', 'Privacy and safety information', 'Content breadth']
  },
  {
    slug: 'vr-ar',
    name: 'VR / AR',
    title: 'VR Adult Platforms: Reviews & Comparison Guide',
    description: 'Compare VR-focused adult platforms by device fit, library model, streaming options and subscription approach.',
    blurb: 'VR users often care more about headset compatibility, playback quality and library structure than casual viewers do.',
    factors: ['Headset compatibility', 'Streaming vs downloads', 'Subscription model', 'Library breadth', 'Preview access', 'Navigation']
  },
  {
    slug: 'adult-games',
    name: 'Adult Games',
    title: 'Adult Game Platforms: Reviews & Discovery Guide',
    description: 'Explore adult game storefronts, communities and discovery platforms with clear editorial context.',
    blurb: 'Game-focused platforms differ widely in storefront model, community features, update cadence and pricing.',
    factors: ['Storefront or community model', 'Free vs paid access', 'Platform support', 'Discovery tools', 'Community features', 'Update cadence']
  },
  {
    slug: 'hentai-anime',
    name: 'Hentai / Anime',
    title: 'Hentai & Anime Platforms: Reviews & Discovery Guide',
    description: 'Compare streaming, manga and game-focused platforms serving adult anime audiences.',
    blurb: 'This category covers different formats, so our guides separate streaming, manga libraries and game platforms rather than treating them as interchangeable.',
    factors: ['Format', 'Free vs premium access', 'Library organization', 'Mobile experience', 'Account requirements', 'Content discovery']
  },
  {
    slug: 'dating-hookups',
    name: 'Dating / Hookups',
    title: 'Adult Dating Platforms: Reviews & Comparison Guide',
    description: 'Compare adult-oriented dating and casual connection platforms by membership model, communication features and privacy considerations.',
    blurb: 'Dating platforms require more attention to account privacy, messaging access and membership terms than passive entertainment sites.',
    factors: ['Membership model', 'Messaging access', 'Search and discovery', 'Privacy controls', 'Account cancellation', 'Community features']
  },
  {
    slug: 'premium-videos',
    name: 'Premium Videos',
    title: 'Premium Adult Video Platforms: Reviews & Comparison Guide',
    description: 'Compare subscription video platforms by membership model, library structure, playback options and value.',
    blurb: 'Premium video services usually compete on library quality, subscription terms and user experience.',
    factors: ['Subscription terms', 'Library breadth', 'Playback quality', 'Mobile usability', 'Cancellation', 'Preview access']
  },
  {
    slug: 'free-videos',
    name: 'Free Videos',
    title: 'Free Adult Video Platforms: Reviews & Comparison Guide',
    description: 'Understand the trade-offs between major free video platforms, including usability, account features and privacy considerations.',
    blurb: 'Free platforms can differ materially in account features, advertising load, moderation and privacy controls.',
    factors: ['Account requirements', 'Advertising', 'Search and discovery', 'Playback experience', 'Privacy controls', 'Moderation information']
  },
  {
    slug: 'adult-shops',
    name: 'Adult Shops',
    title: 'Adult Shops: Reviews & Comparison Guide',
    description: 'Compare established adult retailers by catalog, shopping experience, delivery information and customer policies.',
    blurb: 'Retailers should be compared on practical shopping factors rather than entertainment-platform features.',
    factors: ['Catalog breadth', 'Shipping information', 'Returns', 'Discretion/privacy', 'Pricing transparency', 'Customer support']
  }
];

export const categoryBySlug = Object.fromEntries(categories.map((item) => [item.slug, item]));
