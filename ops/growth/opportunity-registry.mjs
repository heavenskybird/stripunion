import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export const STATUSES=['DISCOVERED','EVALUATED','APPROVED','IMPLEMENTED','DEPLOYED','MEASURED','BLOCKED','DEFERRED','REJECTED'];
const NORMAL=['DISCOVERED','EVALUATED','APPROVED','IMPLEMENTED','DEPLOYED','MEASURED'];
const validTime=t=>Number.isFinite(Date.parse(t));
export function validateRegistry(registry){
 if(registry?.version!==1||!Array.isArray(registry.opportunities))throw Error('REGISTRY_INVALID');const ids=new Set();
 for(const row of registry.opportunities){
  if(!/^[a-z0-9-]{3,100}$/.test(row.id||'')||ids.has(row.id)||!STATUSES.includes(row.status))throw Error('REGISTRY_ID_OR_STATUS_INVALID');ids.add(row.id);
  if(!row.origin?.url?.startsWith('https://github.com/heavenskybird/stripunion/issues/')||!validTime(row.origin.discoveredAt)||!row.hypothesis||!row.owner||!row.nextAction||!validTime(row.lastEvidenceAt)||!Array.isArray(row.dependencies)||!Array.isArray(row.evidence)||!row.evidence.length||!Array.isArray(row.history)||!row.history.length)throw Error('REGISTRY_PROVENANCE_REQUIRED');
  let previous=null,previousTime=0;
  for(const entry of row.history){const at=Date.parse(entry.at);if(!STATUSES.includes(entry.to)||entry.from!==previous||!Number.isFinite(at)||at<previousTime||!entry.evidenceUrl?.startsWith('https://'))throw Error('REGISTRY_HISTORY_INVALID');
   if(previous&&NORMAL.includes(previous)&&NORMAL.includes(entry.to)&&NORMAL.indexOf(entry.to)!==NORMAL.indexOf(previous)+1)throw Error('REGISTRY_STAGE_SKIPPED');
   previous=entry.to;previousTime=at;
  }
  if(previous!==row.status)throw Error('REGISTRY_STATUS_NOT_BOUND_TO_HISTORY');
  if(['DEPLOYED','MEASURED'].includes(row.status)&&!row.evidence.some(e=>e.kind==='production_http'&&e.url?.startsWith('https://')))throw Error('REGISTRY_DEPLOYMENT_PROOF_REQUIRED');
  if(row.status==='MEASURED'&&(!row.evaluation?.reportUrl||!row.evaluation?.windowStart||!row.evaluation?.windowEnd))throw Error('REGISTRY_MEASUREMENT_REQUIRED');
 }
 return registry;
}
export function registryReport(registry,now=Date.now()){
 validateRegistry(registry);const alerts=[];
 for(const row of registry.opportunities){const age=(now-Date.parse(row.lastEvidenceAt))/86400000;
  if(['EVALUATED','APPROVED','IMPLEMENTED'].includes(row.status)&&age>7)alerts.push({id:row.id,classification:'STUCK_ACCEPTED_OPPORTUNITY',days:Math.floor(age),nextAction:row.nextAction,ownerAction:row.ownerAction||null});
  if(row.status==='DEPLOYED'&&row.evaluation?.dueAt&&now>Date.parse(row.evaluation.dueAt)&&!row.evaluation.reportUrl)alerts.push({id:row.id,classification:'MEASUREMENT_OVERDUE',nextAction:row.nextAction});
 }
 return {version:1,asOf:new Date(now).toISOString(),opportunities:registry.opportunities.length,byStatus:Object.fromEntries(STATUSES.map(s=>[s,registry.opportunities.filter(r=>r.status===s).length])),alerts,
  ownerActions:registry.opportunities.filter(r=>r.ownerAction).map(r=>({id:r.id,action:r.ownerAction,status:r.status})),nextThree:registry.opportunities.filter(r=>!['MEASURED','REJECTED','DEFERRED'].includes(r.status)).sort((a,b)=>a.priority-b.priority).slice(0,3).map(r=>({id:r.id,status:r.status,nextAction:r.nextAction})),
  source:'Canonical Git registry; no status inferred from CI or article count',notificationPolicy:'Artifact only. Existing commercial radar should notify only on changed alert IDs/classification; this tool sends no notifications.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const registry=JSON.parse(await fs.readFile('ops/growth/opportunity-registry.json'));const report=registryReport(registry);await fs.mkdir('artifacts/trends-radar',{recursive:true});await fs.writeFile('artifacts/trends-radar/opportunity-registry-report.json',JSON.stringify(report,null,2)+'\n');console.log('GROWTH_OPPORTUNITY_REGISTRY '+JSON.stringify(report));}
