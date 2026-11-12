// Five observed production hubs only. Hostinger currently redirects these bare
// paths to slash URLs; align preferred canonical and sitemap without changing
// routes, other published guide canonicals, DNS or server security policy.
const hubs=new Set(['/stripchat-alternatives','/stripchat-app','/livejasmin','/chaturbate-alternatives','/xhamster']);
export function searchCanonical(path){const bare=String(path).replace(/\/$/,'');return hubs.has(bare)?bare+'/':path;}
