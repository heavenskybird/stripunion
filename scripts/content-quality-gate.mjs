import assert from 'node:assert/strict';
export function assessCandidate(candidate, peers = []) {
  const text = String(candidate?.text || '').trim();
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const words = normalized ? normalized.split(/\s+/).length : 0;
  const originalValue = ['platformFacts','pricingOrFeatures','comparison','freshness','internalLinks','structuredInformation','decisionSupport'].filter((key) => candidate?.[key] === true);
  const duplicate = peers.some((peer) => peer.url !== candidate.url && String(peer.title || '').trim().toLowerCase() === String(candidate.title || '').trim().toLowerCase() && String(peer.text || '').toLowerCase().includes(normalized.slice(0,120)));
  const reasons=[];
  if(words<350) reasons.push('under 350 words of substantive decision-support content');
  if(originalValue.length<3) reasons.push('fewer than three documented original-value elements');
  if(!candidate?.title||!candidate?.url) reasons.push('missing title or canonical URL');
  if(duplicate) reasons.push('near-duplicate match in supplied peer inventory');
  return { eligible:reasons.length===0, wordCount:words, originalValueElements:originalValue, reasons };
}
if(process.argv.includes('--self-test')) {
  assert.equal(assessCandidate({title:'x',url:'/x',text:'short'}).eligible,false);
  assert.equal(assessCandidate({title:'Good',url:'/a',text:'decision '.repeat(400),platformFacts:true,pricingOrFeatures:true,comparison:true}).eligible,true);
  assert.equal(assessCandidate({title:'A',url:'/a',text:'same words '.repeat(200)},[{title:'A',url:'/b',text:'same words '.repeat(200)}]).eligible,false);
  console.log('Content quality gate self-test passed.');
}
