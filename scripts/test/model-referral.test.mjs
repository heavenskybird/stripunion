import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {modelLinks,allowedReferralUrl,traceReferral,urlEvidence}from'../model-referral-audit.mjs';
const response=(status,location='',html='')=>({status,headers:new Headers(location?{location}:{}),text:async()=>html});
test('model destination gets a distinct campaign without changing referral account/placement',async()=>{
  const config=(await fs.readFile('src/config/site.js','utf8')).replace(/^const allowIndexing.*\n/,'const allowIndexing=false;\n');
  const configUrl='data:text/javascript,'+encodeURIComponent(config);
  const source=(await fs.readFile('src/lib/affiliate.js','utf8')).replace("'../config/site.js'",JSON.stringify(configUrl));
  const {buildAvcamsUrl}=await import('data:text/javascript,'+encodeURIComponent(source));
  const model=buildAvcamsUrl({pagePath:'/become-a-cam-model',placement:'become_model_hero',destinationPath:'/signup/model',label:'Review Signup'});
  const url=new URL(model.url);assert.equal(model.campaignId,'su_model_referral');assert.equal(model.program,'model-referral');assert.equal(url.searchParams.get('p1'),'become-a-cam-model');assert.equal(url.searchParams.get('p2'),'become_model_hero');assert.equal(url.searchParams.get('path'),'/signup/model');assert(url.searchParams.get('userId'));assert(!url.searchParams.has('memberId'));
  assert.equal(buildAvcamsUrl({pagePath:'/avcams',placement:'viewer'}).campaignId,'su_livecam_review');
});
test('unapproved hosts, unsafe protocols and invented click identifiers are refused',()=>{
  for(const url of ['https://avcams.online/api/click','https://evil.com/signup/model','http://avcams.online/signup/model','https://stripchat.com.evil.com/become-a-model','https://avcams.online/signup/model?memberId=fake','https://avcams.online/signup/model?p3=qa','https://u:p@stripchat.com/become-a-model'])assert.throws(()=>allowedReferralUrl(url));
});
test('GET-only trace proves destination/parameter transport, never provider credit',async()=>{
  let calls=0;
  const result=await traceReferral('https://avcams.online/signup/model',{expectedUserId:'public-test',fetchImpl:async(url,options)=>{calls++;assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');return calls===1?response(302,'https://stripchat.com/become-a-model?userId=public-test'):response(200,'','<title>Become a Model</title>');}});
  assert.equal(calls,2);assert.equal(result.state,'OFFICIAL_MODEL_ROUTE_200');assert.equal(result.referralIdInFinalUrl,true);assert.equal(result.attributionCredit,'UNPROVEN');
  assert(!JSON.stringify(result).includes('public-test'));
});
test('loop, challenge and redirects off the verified route remain unaccepted',async()=>{
  assert.equal((await traceReferral('https://avcams.online/signup/model',{fetchImpl:async()=>response(302,'https://avcams.online/signup/model')})).state,'REDIRECT_LOOP');
  assert.equal((await traceReferral('https://avcams.online/signup/model',{fetchImpl:async()=>response(302,'https://evil.com/')})).state,'UNAPPROVED_REDIRECT_HELD');
  assert.equal((await traceReferral('https://stripchat.com/become-a-model',{fetchImpl:async()=>response(200,'','<title>Just a moment...</title>')})).state,'PROVIDER_CHALLENGE');
});
test('HTML extraction excludes viewer links and keeps sponsorship/source identity',()=>{
  const links=modelLinks('<a href="https://go.whitetrafsa.com/?path=/signup/model&amp;p2=hero" data-avcams-path="/signup/model" data-affiliate-source="hero" rel="sponsored">Model</a><a href="/girls" data-avcams-path="/girls">Viewer</a>');
  assert.equal(links.length,1);assert.equal(links[0].source,'hero');assert.equal(new URL(links[0].href).searchParams.get('p2'),'hero');assert.equal(links[0].rel,'sponsored');
  assert(!JSON.stringify(urlEvidence('https://avcams.online/signup/model?userId=public-id','public-id')).includes('public-id'));
});
