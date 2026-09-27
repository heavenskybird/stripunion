import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pageDir = path.join(repo, 'src/pages');
const dataDir = path.join(repo, 'ops/growth/content-inventory');
const files = (await fs.readdir(pageDir)).filter((name) => name.endsWith('.astro') && !['404.astro','affiliate-disclosure.astro','age-verification.astro','contact.astro','disclaimer.astro','editorial-policy.astro','privacy-policy.astro','terms.astro'].includes(name)).sort();
const gscRoot = path.join(repo, 'ops/seo-data-layer/data/raw');
const dirs = (await fs.readdir(gscRoot).catch(() => [])).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort().reverse();
let gsc = null;
for (const dir of dirs) try { gsc = JSON.parse(await fs.readFile(path.join(gscRoot,dir,'gsc.json'),'utf8')); break; } catch {}
let bing = null;
for (const dir of dirs) try { bing = JSON.parse(await fs.readFile(path.join(gscRoot,dir,'bing.json'),'utf8')); break; } catch {}
const queryStats = new Map();
for (const row of gsc?.queryRows || []) { const url=String(row.page||'').toLowerCase(); const key=url.split('/').filter(Boolean).at(-1)||'index'; queryStats.set(key,(queryStats.get(key)||0)+Number(row.impressions||0)); }
for (const site of bing?.sites || []) for (const row of site.pageStats || []) { const url=String(row.Page||row.page||'').toLowerCase(); const key=url.split('/').filter(Boolean).at(-1)||'index'; queryStats.set(key,(queryStats.get(key)||0)+Number(row.Impressions||row.impressions||0)); }
const clusterOf = (text) => /best.*(?:cam|site)|top.*cam/i.test(text)?'best cam sites':/vs|versus/i.test(text)?'platform-vs-platform':/pric|token|credit/i.test(text)?'pricing/tokens':/payment|billing|wallet/i.test(text)?'payments':/app|mobile|device|vr/i.test(text)?'mobile/device':/model|creator|work|earn/i.test(text)?'creator/model referral':/feature|search|private|magic/i.test(text)?'features':/country|regional|region/i.test(text)?'regional':/review/i.test(text)?'platform reviews':'guides';
const tokens = (value) => new Set(String(value||'').toLowerCase().match(/[a-z0-9]{3,}/g)||[]);
const rows=[];
for(const file of files){
 const body=await fs.readFile(path.join(pageDir,file),'utf8');
 const route=file.replace(/\.astro$/,'');
 const title=body.match(/(?:const title\s*=\s*|<title>)(['"`])([\s\S]*?)\1/)?.[2]||body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g,' ').trim()||route;
 const description=body.match(/const description\s*=\s*(['"])([\s\S]*?)\1/)?.[2]||'';
 const plain=body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\{[^}]*\}/g,' ').replace(/\s+/g,' ').trim();
 const words=plain.split(/\s+/).filter(Boolean).length;
 const h2=(body.match(/<h2\b/gi)||[]).length;
 const links=(body.match(/href\s*=/gi)||[]).length;
 const commercial=/best|review|vs|alternative|price|pricing|token|compare/i.test(`${title} ${route}`)?5:2;
 const opportunity=Math.min(5,Math.round((queryStats.get(route)||0)/10));
 const t=tokens(plain);const similarities=rows.map((r)=>{const u=tokens(r.body);let intersection=0;for(const word of t)if(u.has(word))intersection++;return t.size&&u.size?intersection/(t.size+u.size-intersection):0;});const overlap=similarities.length?Math.max(...similarities):0;
 const freshness=/2026|updated|checked|verified/i.test(body)?4:2;
 const internalLinks=Math.min(5,Math.floor(links/2));
 const affiliate= /AffiliateButton|AffiliateCTA/.test(body)?5:/affiliate/i.test(body)?2:0;
 const completeness=Math.min(5,(description?1:0)+(h2>=3?2:h2?1:0)+(words>=450?1:0)+(links>=3?1:0));
 const uniqueness=Math.max(0,5-Math.round(overlap*5));
 const score=Math.round(commercial*5+opportunity*4+uniqueness*3+freshness*2+(5-Math.round(overlap*5))*2+internalLinks*2+affiliate+completeness);
 const value={route:`/${route}`,title,cluster:clusterOf(`${title} ${route}`),score,scorecard:{commercialIntent:commercial,keywordOpportunity:opportunity,uniqueness,freshnessSignal:freshness,overlapRisk:Number(overlap.toFixed(2)),internalLinkPotential:internalLinks,affiliateRelevance:affiliate,contentCompleteness:completeness},signals:{wordCount:words,headings:h2,links,queryImpressions:queryStats.get(route)||0},candidateType:'update existing Astro page',qualityGate:words>=350&&h2>=2&&description.length>=45&&overlap<0.72?'review-ready':'needs editorial review',body:plain};
 rows.push(value);
}
rows.sort((a,b)=>b.score-a.score);
const result={generatedAt:new Date().toISOString(),scope:'tracked Astro content only; this is not the WordPress draft inventory',sources:{gsc:gsc?.collectedAt||null,bing:bing?.collectedAt||null,wordpressDrafts:{status:'unavailable',reason:'No authenticated WordPress draft-listing connector or repository export is available.'}},inventorySize:rows.length,wordpressDraftCount:null,publishReadyDraftCount:null,updateCandidates:rows.slice(0,30).map(({body,...row},i)=>({...row,rank:i+1})),pages:rows.map(({body,...row})=>row)};
await fs.mkdir(dataDir,{recursive:true});await fs.writeFile(path.join(dataDir,'latest.json'),JSON.stringify(result,null,2)+'\n');
console.log(`Content inventory: ${rows.length} Astro pages; WordPress drafts unavailable; ${result.updateCandidates.filter((x)=>x.qualityGate==='review-ready').length} existing-page candidates meet the preliminary review gate.`);
