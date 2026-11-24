import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../ops/seo-data-layer/package.json',import.meta.url));
const {google}=require('googleapis');
const {googleCredentials}=await import('../ops/seo-data-layer/src/lib/google-auth.mjs');
const auth=new google.auth.GoogleAuth({credentials:googleCredentials(),scopes:['https://www.googleapis.com/auth/analytics.readonly']});
try{
 const api=google.analyticsadmin({version:'v1beta',auth});
 const [property,streams]=await Promise.all([api.properties.get({name:'properties/530171093'}),api.properties.dataStreams.list({parent:'properties/530171093'})]);
 const matching=(streams.data.dataStreams||[]).filter(s=>s.webStreamData?.measurementId==='G-K57BRX69X1'&&new URL(s.webStreamData.defaultUri).hostname==='stripunion.com');
 if(matching.length!==1)throw new Error('GA4_PRODUCTION_STREAM_NOT_PROVEN');
 const report={propertyId:'530171093',timeZone:property.data.timeZone,measurementId:'G-K57BRX69X1',streamId:matching[0].name.split('/').at(-1),defaultUri:matching[0].webStreamData.defaultUri,checkedAt:new Date().toISOString()};
 await fs.writeFile('work/recovery/ga4-property.json',JSON.stringify(report,null,2)+'\n');console.log('GA4_PROPERTY_VERIFIED '+JSON.stringify(report));
}catch(e){throw new Error('GA4_PROPERTY_VERIFICATION_REFUSED_'+(Number.isInteger(e.code)?e.code:'UNKNOWN'));}
