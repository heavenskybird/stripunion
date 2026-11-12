import fs from 'node:fs/promises';import {createRequire} from 'node:module';import {windows,growthDecisions} from './search-growth-decisions.mjs';
const require=createRequire(new URL('../ops/seo-data-layer/package.json',import.meta.url));const {google}=require('googleapis');
const {googleAuth}=await import('../ops/seo-data-layer/src/lib/google-auth.mjs');const client=google.searchconsole({version:'v1',auth:googleAuth(['https://www.googleapis.com/auth/webmasters.readonly'])});
const endDate=new Date(Date.now()-2*86400000).toISOString().slice(0,10),startDate=windows(endDate)[3].startDate;
const reports=[];
for(const siteUrl of ['sc-domain:stripunion.com','https://blog.stripunion.com/']){
 try {
 const snapshot={siteUrl,startDate,endDate,collectedAt:new Date().toISOString(),dailyRows:[],queryPageRows:[]};
 for(const dimensions of [['date'],['date','query','page']]){
  const out=[];let complete=false;
  for(let page=0;page<10;page++){
   const r=await client.searchanalytics.query({siteUrl,requestBody:{startDate,endDate,dimensions,type:'web',aggregationType:dimensions.includes('page')?'byPage':'byProperty',dataState:'final',rowLimit:25000,startRow:page*25000}},{timeout:20000}).catch(e=>{throw new Error('GSC_QUERY_REFUSED_'+(Number(e.response?.status)||Number(e.code)||(/permission|access|forbidden/i.test(e.message)?'PERMISSION':/invalid|aggregation|parameter/i.test(e.message)?'INVALID_QUERY':/network|fetch|socket|certificate|timeout/i.test(e.message)?'TRANSPORT':'UNKNOWN')));});
   const rows=r.data.rows||[];out.push(...rows.map(row=>({...Object.fromEntries(dimensions.map((k,i)=>[k,row.keys[i]])),clicks:row.clicks,impressions:row.impressions,ctr:row.ctr,position:row.position})));
   if(rows.length<25000){complete=true;break;}
  }
  if(!complete)throw Error('SEARCH_GROWTH_PAGINATION_INCOMPLETE');
  snapshot[dimensions.includes('page')?'queryPageRows':'dailyRows']=out;
 }
 reports.push({status:'ok',snapshot,decisions:growthDecisions(snapshot)});
 }catch(e){reports.push({status:'failed',siteUrl,error:/^GSC_QUERY_REFUSED_|SEARCH_GROWTH_/.test(e.message)?e.message:'GSC_SCOPE_READ_FAILED'});}
}
const result={source:'official-google-search-console',collectedAt:new Date().toISOString(),startDate,endDate,generatedAt:new Date().toISOString(),reports,note:'GSC web dates are Pacific calendar dates. Domain and Blog URL-prefix overlap; never sum them. Anonymized Query/Page rows are not property totals.'};
await fs.mkdir('ops/seo-data-layer/data/search-growth',{recursive:true});await fs.writeFile('ops/seo-data-layer/data/search-growth/latest.json',JSON.stringify(result,null,2)+'\n');await fs.mkdir('ops/seo-data-layer/data/raw/'+endDate,{recursive:true});await fs.writeFile('ops/seo-data-layer/data/raw/'+endDate+'/search-growth.json',JSON.stringify(result,null,2)+'\n');console.log('SEARCH_GROWTH_DECISIONS '+JSON.stringify(reports.map(r=>r.status!=='ok'?r:({siteUrl:r.snapshot.siteUrl,windows:r.decisions.map(w=>({name:w.name,startDate:w.startDate,endDate:w.endDate,coverage:w.coverage,hubs:w.hubs.map(h=>({slug:h.slug,decision:h.decision,impressions:h.impressions,clicks:h.clicks}))}))}))));

if(reports.some(r=>r.status!=='ok'))process.exitCode=1;
