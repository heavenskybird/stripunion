import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../ops/seo-data-layer/package.json',import.meta.url));
const {BetaAnalyticsDataClient}=require('@google-analytics/data');
const {googleCredentials}=await import('../ops/seo-data-layer/src/lib/google-auth.mjs');
const client=new BetaAnalyticsDataClient({credentials:googleCredentials()});
let count=0,attempts=0,errorCode=null;
for(let i=0;i<4;i++){
 attempts++;
 try{
  const [r]=await client.runRealtimeReport({property:'properties/530171093',dimensions:[{name:'eventName'}],metrics:[{name:'eventCount'}],dimensionFilter:{filter:{fieldName:'eventName',stringFilter:{matchType:'EXACT',value:'recovery_consent_check'}}},limit:10},{timeout:20000});
  count=(r.rows||[]).reduce((s,row)=>s+Number(row.metricValues?.[0]?.value||0),0);
  if(count>0)break;
 }catch(e){errorCode=Number.isInteger(e.code)?e.code:'UNKNOWN';break;}
 if(i<3)await new Promise(resolve=>setTimeout(resolve,15000));
}
const report={propertyId:'530171093',measurementId:'G-K57BRX69X1',eventName:'recovery_consent_check',checkedAt:new Date().toISOString(),attempts,eventCount:count,errorCode,propertyEventObserved:count>0,scope:'Realtime event name within current window; not a purchase or proof of affiliate conversion'};
await fs.writeFile('work/recovery/ga4-realtime.json',JSON.stringify(report,null,2)+'\n');console.log('GA4_REALTIME '+JSON.stringify(report));
