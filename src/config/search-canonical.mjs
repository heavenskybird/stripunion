// Observed Hostinger hub and guide redirects end in a slash. Align preferred
// canonical, structured data and sitemap; leave routing and security unchanged.
const hubs=new Set(['/stripchat-alternatives','/stripchat-app','/livejasmin','/chaturbate-alternatives','/xhamster']);
export function searchCanonical(path){const bare=String(path).replace(/\/$/,'');return (hubs.has(bare)||/^\/guides\/[a-z0-9-]+$/.test(bare))?bare+'/':path;}
