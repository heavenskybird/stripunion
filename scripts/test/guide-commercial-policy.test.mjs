import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {guideCommercialOffer,webmasterPilot,viewerPilot} from '../../src/config/guide-commercial-policy.mjs';
test('exact five-guide pilot uses only existing approved products',()=>{
 const offers=JSON.parse(fs.readFileSync('ops/growth/offers/direct-offers.json')).offers;
 assert.equal(webmasterPilot.size,3);assert.equal(viewerPilot.size,2);
 for(const slug of webmasterPilot)assert.equal(guideCommercialOffer({slug,categorySlug:'webmaster-affiliate'}),'stripcash-affiliate-referral');
 for(const slug of viewerPilot)assert.equal(guideCommercialOffer({slug,categorySlug:'live-cams'}),'avcams');
 for(const id of ['avcams','stripcash-affiliate-referral'])assert.equal(offers.find(o=>o.id===id).approval_status,'approved_active');
});
test('games/anime/safety and mismatched category never receive cam or webmaster offers',()=>{
 for(const categorySlug of ['adult-games','hentai-anime','privacy-safety-payment','adult-shops','dating-hookups'])for(const slug of [...viewerPilot,...webmasterPilot])assert.equal(guideCommercialOffer({slug,categorySlug}),null);
 assert.equal(guideCommercialOffer({slug:'unknown-popular-stripchat-page',categorySlug:'live-cams'}),null);
});
test('targets and non-cash rewards never become approved commercial products',()=>{
 const offers=JSON.parse(fs.readFileSync('ops/growth/offers/direct-offers.json')).offers;
 for(const id of ['lovense','lovehoney','dlsite','nutaku','fakku','erolabs'])assert.notEqual(offers.find(o=>o.id===id).approval_status,'approved_active');
 assert.equal(offers.find(o=>o.id==='erolabs').status,'ineligible_non_cash');
});
