// Never add a Blog URL-prefix snapshot to a Domain property snapshot:
// Blog is already included in the verified Domain property and would double count.
export function selectSearchOpportunityGsc(domain, blog) {
  if (domain) return { snapshot: domain, sourceName: 'GSC', scope: 'domain' };
  if (blog) return { snapshot: blog, sourceName: 'GSC-Blog', scope: 'blog-url-prefix' };
  return { snapshot: null, sourceName: null, scope: 'unavailable' };
}
