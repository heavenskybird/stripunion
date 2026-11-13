// Read the single previously authorized event; never send another test event.
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../ops/seo-data-layer/package.json',import.meta.url));
const {google}=require('googleapis');
const {googleAuth}=await import('../ops/seo-data-layer/src/lib/google-auth.mjs');
const api=google.analyticsdata({version:'v1beta',auth:googleAuth(['https://www.googleapis.com/auth/analytics.readonly'])});
const property='properties/530171093';
const result=await api.properties.runReport({property,requestBody:{
 dateRanges:[{startDate:'2026-11-12',endDate:'today'}],
 dimensions:[{name:'eventName'},{name:'date'}],metrics:[{name:'eventCount'}],
 dimensionFilter:{filter:{fieldName:'eventName',stringFilter:{matchType:'EXACT',value:'recovery_consent_check'}}},limit:'10'
}},{timeout:20000});
const evidence={checkedAt:new Date().toISOString(),property,measurementId:'G-K57BRX69X1',previouslySentAt:'2026-11-12T14:33:49.499Z',readOnly:true,newEventsSent:0,
 rows:result.data.rows||[],rowCount:result.data.rowCount||0,
 classification:result.data.rows?.length?'EXISTING_EVENT_OBSERVED':'INGESTION_UNCONFIRMED',
 note:'No rows do not establish root cause: standard report processing delay, consent, stream and filters require separate evidence.'};
await fs.mkdir('artifacts/search-growth',{recursive:true});await fs.writeFile('artifacts/search-growth/ga4-existing-diagnostic.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence));
