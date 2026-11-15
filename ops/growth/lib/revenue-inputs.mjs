import fs from 'node:fs/promises';
import path from 'node:path';
import { searchCanonical } from '../../../src/config/search-canonical.mjs';
export async function latestRevenueInput(rawRoot, name) {
  const dirs=(await fs.readdir(rawRoot)).filter(n=>/^\d{4}-\d{2}-\d{2}$/.test(n)).sort().reverse();
  for(const date of dirs)try{return {date,data:JSON.parse(await fs.readFile(path.join(rawRoot,date,name+'.json'),'utf8'))};}catch(e){if(e.code!=='ENOENT')throw e;}
  return null;
}

// Exact source file routes only. Underscore aliases are not guessed or merged.
export async function knownRevenuePageRoutes(root) {
  const routes={};
  for(const file of await fs.readdir(path.join(root,'src/pages'))) {
    if(!/^[a-z0-9-]+\.astro$/.test(file) || file==='404.astro') continue;
    const key=file.replace(/\.astro$/,'');
    if(key==='index')routes.homepage='/';else routes[key]=searchCanonical('/'+key);
  }
  for(const file of await fs.readdir(path.join(root,'src/data/guides'))) {
    if(!/^[a-z0-9-]+\.js$/.test(file))continue;
    const key=file.replace(/\.js$/,'');
    routes[key]=searchCanonical('/guides/'+key);
  }
  return routes;
}
