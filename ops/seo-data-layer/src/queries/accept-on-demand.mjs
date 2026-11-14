// Release-branch acceptance only. These are reporting reads, never test-event sends.
import { spawnSync } from 'node:child_process';
const cases=[
  ['filtered7',{days:7,keyword:'stripchat',page:'/stripchat-app/',countryGsc:'usa',countryGa4:'US',device:'mobile',hostname:'stripunion.com'}],
  ['blog90',{days:90,property:'blog'}],
  ['history365',{days:365,sources:'gsc',keyword:'chaturbate'}],
  ['utm28',{days:28,sources:'ga4',sourceMedium:'x / social',campaign:'bf20261113',adContent:'p01'}]
];
let failed=false;
for(const [name,query] of cases) {
  const result=spawnSync(process.execPath,['ops/seo-data-layer/src/queries/on-demand.mjs'],{stdio:'inherit',env:{...process.env,ANALYTICS_QUERY_JSON:JSON.stringify(query),ANALYTICS_REPORT_NAME:name},timeout:180000});
  if(result.status!==0)failed=true;
}
if(failed)process.exitCode=1;
