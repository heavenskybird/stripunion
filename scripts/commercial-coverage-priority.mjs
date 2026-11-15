import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
export function coveragePriorities(audit, search) {
  if (audit.source !== 'compiled_article_html' || !Array.isArray(audit.rows)) throw Error('COMPILED_DETAILED_AUDIT_REQUIRED');
  const domain=search.reports?.find(r=>r.status==='ok'&&r.snapshot?.siteUrl==='sc-domain:stripunion.com');
  if(!domain)throw Error('OFFICIAL_DOMAIN_SEARCH_REQUIRED');
  const windows=domain.decisions.filter(w=>['current7','current28'].includes(w.name));
  const rows=audit.rows.map(row=>{
    const path='/guides/'+row.slug;
    const signals=windows.map(w=>{
      const cells=domain.snapshot.queryPageRows.filter(r=>r.date>=w.startDate&&r.date<=w.endDate&&new URL(r.page).pathname.replace(/\/$/,'')===path);
      return {window:w.name,startDate:w.startDate,endDate:w.endDate,clicks:cells.reduce((n,r)=>n+r.clicks,0),impressions:cells.reduce((n,r)=>n+r.impressions,0),observedUrls:[...new Set(cells.map(r=>r.page))],aggregation:'OBSERVED_QUERY_PAGE_CELLS_NOT_PROPERTY_TOTALS'};
    });
    const intent=row.category==='webmaster-affiliate'?'AFFILIATE_PROGRAM_REVIEW':row.category==='live-cams'?'CAM_AUDIENCE_FIT_REVIEW':'NO_APPROVED_CATEGORY_PRODUCT_OR_NONCOMMERCIAL';
    const action=row.state==='contextual_affiliate_present'?'MEASURE_EXISTING_PILOT':intent==='NO_APPROVED_CATEGORY_PRODUCT_OR_NONCOMMERCIAL'?'HOLD_NO_RELEVANT_APPROVED_OFFER':'REVIEW_CONTEXTUAL_EXIT';
    const current28=signals.find(w=>w.window==='current28');
    return {...row,path,intent,action,signals,priority:(current28?.clicks||0)*100+(current28?.impressions||0)};
  });
  return {version:1,sourceSha:process.env.GITHUB_SHA||'LOCAL',generatedAt:new Date().toISOString(),sourceAsOf:search.collectedAt,
    property:domain.snapshot.siteUrl,coverage:audit,missingTop20:rows.filter(r=>r.state!=='contextual_affiliate_present').sort((a,b)=>b.priority-a.priority||a.slug.localeCompare(b.slug)).slice(0,20),
    approvedCategoryReview:rows.filter(r=>r.action==='REVIEW_CONTEXTUAL_EXIT').sort((a,b)=>b.priority-a.priority).slice(0,20),
    note:'Traffic ranking is a planning lead, not permission to add a cam ad. Neutral safety, games, anime, shops and dating stay unmonetized until a suitable approved offer exists. Search aliases are retained; no site-wide index ratio or revenue inferred.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const audit=JSON.parse(execFileSync(process.execPath,['scripts/affiliate-coverage-audit.mjs','--details'],{encoding:'utf8',maxBuffer:4000000}));
  const search=JSON.parse(await fs.readFile('ops/seo-data-layer/data/search-growth/latest.json'));
  const result=coveragePriorities(audit,search);
  await fs.mkdir('artifacts/commercial',{recursive:true});await fs.writeFile('artifacts/commercial/coverage-priorities.json',JSON.stringify(result,null,2)+'\n');
  console.log('COMMERCIAL_PRIORITY '+JSON.stringify({sourceAsOf:result.sourceAsOf,compiled:result.coverage.compiledGuidePages,paid:result.coverage.contextualAffiliatePresent,top:result.missingTop20.map(r=>({path:r.path,action:r.action,signals:r.signals}))}));
}
