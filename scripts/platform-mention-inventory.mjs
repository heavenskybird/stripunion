import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviews } from '../src/data/reviews.js';
import { vrReviews } from '../src/data/reviews-vr.js';
import { pendingReviews } from '../src/data/legacy.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const library=path.join(root,'src/data/guides');
const categorySeeds = {
 'live-cams': 'Stripchat|Chaturbate|LiveJasmin|BongaCams|CamSoda|MyFreeCams|CAM4|Streamate|Flirt4Free|Cams.com|Jerkmate|XLoveCam|ImLive|CamContacts|Camster|AVCams|Cameraboys|CamsLust|JoYourself',
 'vr-ar': 'VRPorn|SexLikeReal|CzechVR|VRBangers|BaDoinkVR|WankzVR|POVR|VRConk|VRCosplayX|VRHush|HoloGirlsVR|SLR|DeoVR',
 'adult-games': 'Nutaku|LewdGames|F95Zone|EROLABS|DLsite|Steam|itch.io|Patreon|FapCEO|JAST USA|MangaGamer|GameJolt',
 'hentai-anime': 'FAKKU|nHentai|Hentai Haven|DLsite|Hanime|HentaiFox|Hentai2Read|Hentai Foundry|Hentai Heroes|MangaGamer|JAST USA|E-Hentai|ExHentai|Hitomi.la|Tsumino',
 'dating-hookups': 'AdultFriendFinder|Ashley Madison|FriendFinder-X|BeNaughty|Feeld|Grindr|Tinder|Pure|HUD|Victoria Milan|Passion.com|XMatch',
 'premium-videos': 'Brazzers|Reality Kings|Naughty America|BangBros|Digital Playground|Vixen|Blacked|Tushy|Evil Angel|Team Skeet|Mofos|Bellesa|Adult Time|OnlyFans|ManyVids|PornPros|Pornhub Premium',
 'free-videos': 'Pornhub|XVideos|xHamster|RedTube|YouPorn|SpankBang|Tube8|XNXX|TNAFlix|Eporner|Beeg|XTube',
 'adult-shops': 'Lovense|Lovehoney|Adam & Eve|PinkCherry|Kiiroo|LELO|We-Vibe|Fleshlight|Bondara|Womanizer|Satisfyer|Doc Johnson|Fun Factory|Svakom|Tenga',
 'creator-platforms': 'OnlyFans|Fansly|ManyVids|FanCentro|JustForFans|LoyalFans|Clips4Sale|AVN Stars|Patreon|Modelhub|Fanvue',
 'webmaster-affiliate': 'StripCash|BongaCash|A.W. Empire|CamBuilder|CrakRevenue|FapHouse|AdultForce|Adsterra|ExoClick|TrafficJunky|JuicyAds|PlugRush|TrafficStars|Adnium|EroAdvertising|Affil4You',
 'ai-adult': 'Candy.ai|DreamGF|CrushOn.AI|SpicyChat|JanitorAI|Muah AI|SoulGen|Pornpen|Promptchan|Seduced AI|GirlfriendGPT|FantasyGF',
 'short-drama-adjacent': 'ReelShort|DramaBox|GoodShort|ShortMax|MyDrama|FlexTV|FlareFlow|MyMuse'
};
const extraAliases={'A.W. Empire':['AW Empire','AWEmpire'], 'FriendFinder-X':['FriendFinderX'], 'F95Zone':['F95 Zone'], 'AVCams':['avcams.online']};
const normalize=v=>String(v).toLowerCase().trim().replace(/[^a-z0-9]+/g,'');
const explicit=new Map();
function add(name,category,source){
 const id=normalize(name);if(!id||name.length<3)return;
 let v=explicit.get(id);
 if(!v){v={name,category,origins:new Set(),aliases:new Set([name])};explicit.set(id,v);}
 v.origins.add(source);
 if(!v.category||v.category==='unknown')v.category=category;
 for(const a of extraAliases[name]||[])v.aliases.add(a);
}
for(const [cat,names] of Object.entries(categorySeeds))for(const n of names.split('|'))add(n,cat,'curated_probe');
for(const data of Object.values({...reviews,...vrReviews}))add(data.name,data.categorySlug,'review_source');
for(const [slug,data] of Object.entries(pendingReviews))add(data[0],data[2],'legacy_review_source');
const registry=JSON.parse(await fs.readFile(path.join(root,'ops/growth/offers/direct-offers.json'),'utf8'));
for(const x of registry.offers||[])add(x.brand,x.category,'offer_registry');
const entities=[...explicit.values()].map(x=>({...x, matcher:[...x.aliases].filter(a=>a.length>=3).map(a=>new RegExp('(?<![a-z0-9])'+a.replace(/[^\w]/g,'\\$&')+'(?![a-z0-9])','i'))}));
const files=(await fs.readdir(library)).filter(f=>f.endsWith('.js'));
const mentions=new Map(entities.map(x=>[normalize(x.name),{guideCount:0,categoryCounts:new Map(),sampleSlugs:[]}]));
for(const file of files){
 const content=await fs.readFile(path.join(library,file),'utf8');
 const category=content.match(/["']categorySlug["']\s*:\s*["']([^"']+)["']/)?.[1]||'unknown';
 const slug=content.match(/["']slug["']\s*:\s*["']([^"']+)["']/)?.[1]||file.replace(/\.js$/,'');
 for(const entity of entities){
   if(!entity.matcher.some(re=>re.test(content)))continue;
   const row=mentions.get(normalize(entity.name));row.guideCount++;
   row.categoryCounts.set(category,(row.categoryCounts.get(category)||0)+1);
   if(row.sampleSlugs.length<2)row.sampleSlugs.push(slug);
 }
}
const result=entities.map(x=>{
 const m=mentions.get(normalize(x.name));
 return {brand:x.name,category:x.category,guideCount:m.guideCount,
   reviewOrOfferSource:[...x.origins].some(z=>z!=='curated_probe'),
   topMentionCategory:[...m.categoryCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,2).map(z=>z.join(':')).join('|'),
   examples:m.sampleSlugs};
}).filter(x=>x.guideCount>0||x.reviewOrOfferSource).sort((a,b)=>b.guideCount-a.guideCount||a.brand.localeCompare(b.brand));
console.log('PLATFORM_MENTION_INVENTORY '+JSON.stringify({schema:1,source:'source_guides_and_review_registry_seeded',sourceGuides:files.length,totalSeedBrands:entities.length,foundPlatforms:result.length,mentionedByGuides:result.filter(x=>x.guideCount>0).length,rows:result,disclaimer:'Seed-identified brand mention counts in guide JS content, not live traffic, outbound links or commission eligibility. No userId or tracking URLs exported.'}));
