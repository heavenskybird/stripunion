import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {validateRegistry,registryReport}from'../../ops/growth/opportunity-registry.mjs';
const original=JSON.parse(await fs.readFile(new URL('../../ops/growth/opportunity-registry.json',import.meta.url)));
test('registry backfills documented blind spots with explicit source and next action',()=>{validateRegistry(original);assert(original.opportunities.length>=10);assert(original.opportunities.some(r=>r.id==='google-trends-alpha-access'&&r.status==='BLOCKED'));assert(!original.opportunities.some(r=>r.status==='MEASURED'));});
test('CI alone cannot produce deployed or measured status',()=>{const r=structuredClone(original);const row=r.opportunities[0];row.history.push({from:row.status,to:'APPROVED',at:'2026-11-16',evidenceUrl:row.origin.url},{from:'APPROVED',to:'IMPLEMENTED',at:'2026-11-16',evidenceUrl:row.origin.url},{from:'IMPLEMENTED',to:'DEPLOYED',at:'2026-11-16',evidenceUrl:row.origin.url});row.status='DEPLOYED';assert.throws(()=>validateRegistry(r),/DEPLOYMENT_PROOF/);});
test('stuck accepted opportunities have batched owner actions and deterministic alert identity',()=>{const fixture=structuredClone(original);const row=fixture.opportunities.find(r=>r.id==='official-trends-rss-radar');row.history=row.history.slice(0,row.history.findIndex(h=>h.to==='IMPLEMENTED')+1);row.status='IMPLEMENTED';row.lastEvidenceAt='2026-11-15T00:00:00Z';const report=registryReport(fixture,Date.parse('2026-11-25'));assert(report.alerts.some(a=>a.id===row.id&&a.classification==='STUCK_ACCEPTED_OPPORTUNITY'));assert(report.ownerActions.length);assert.equal(report.nextThree.length,3);assert(!report.notificationSent);});
test('duplicate IDs and skipped normal stages reject',()=>{let r=structuredClone(original);r.opportunities.push(r.opportunities[0]);assert.throws(()=>validateRegistry(r));r=structuredClone(original);const row=r.opportunities[0];row.status='IMPLEMENTED';row.history.push({from:'EVALUATED',to:'IMPLEMENTED',at:'2026-11-16',evidenceUrl:row.origin.url});assert.throws(()=>validateRegistry(r),/STAGE_SKIPPED/);});
test('blocked state cannot bypass approval and implementation gates',()=>{const r=structuredClone(original);const row=r.opportunities.find(o=>o.status==='BLOCKED');const nextAt=new Date(Date.parse(row.history.at(-1).at)+1000).toISOString();row.history.push({from:'BLOCKED',to:'DEPLOYED',at:nextAt,evidenceUrl:row.origin.url});row.status='DEPLOYED';assert.throws(()=>validateRegistry(r),/STAGE_SKIPPED/);});

test('age assurance regulatory refresh is an evaluated existing-URL update with official sources and no offer',()=>{
 const row=original.opportunities.find(o=>o.id==='age-assurance-regulatory-refresh');
 assert(row);
 assert.equal(row.status,'EVALUATED');
 assert.deepEqual(row.productionUrls,['https://www.stripunion.com/guides/adult-platform-age-verification-privacy-checklist/']);
 assert(row.evidence.some(e=>e.url==='https://www.ofcom.org.uk/online-safety/protecting-children/age-assurance'));
 assert(row.evidence.some(e=>e.url==='https://digital-strategy.ec.europa.eu/en/policies/eu-age-verification'));
 assert.equal(row.evaluation.status,'NOT_YET_MEASURED');
});
