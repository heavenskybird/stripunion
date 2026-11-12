import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
const rows=[];let completePublicInventory=false,pagesExpected=null;
for(let page=1;page<=10;page++){
 const r=await fetch(`https://blog.stripunion.com/wp-json/wp/v2/posts?status=publish&context=view&per_page=100&page=${page}&_fields=id,slug,title,status,link,date_gmt`,{redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('BLOG_PUBLIC_REST_HTTP'+r.status);
 const pages=Number(r.headers.get('x-wp-totalpages'));if(!Number.isSafeInteger(pages)||pages<0||pages>10||(pagesExpected!==null&&pages!==pagesExpected))throw Error('BLOG_PUBLIC_PAGINATION_UNPROVEN');pagesExpected=pages;
 const batch=await r.json();if(!Array.isArray(batch))throw Error('BLOG_PUBLIC_INVENTORY_SCHEMA');
 rows.push(...batch.map(p=>({postId:p.id,slug:p.slug,title:p.title?.rendered,status:p.status,url:p.link,destination:'blog'})));
 if(page>=Math.max(pages,1)){completePublicInventory=true;break;}
}
const sitemap=await fetch('https://blog.stripunion.com/sitemap_index.xml',{redirect:'error',signal:AbortSignal.timeout(15000)});const xml=await sitemap.text();
const evidence={version:1,checkedAt:new Date().toISOString(),complete:false,completePublicInventory,privateDraftInventory:'NOT_OBSERVED; public REST never proves draft absence',rows,source:{type:'public-wordpress-rest-get',repository:process.env.GITHUB_REPOSITORY,commit:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,actor:process.env.GITHUB_ACTOR},rowsSha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex'),sitemap:{status:sitemap.status,isIndex:xml.includes('<sitemapindex'),urlCount:[...xml.matchAll(/<loc>/g)].length},publishEnabled:false};
await fs.mkdir('artifacts/blog-recovery',{recursive:true});await fs.writeFile('artifacts/blog-recovery/public-inventory.json',JSON.stringify(evidence,null,2)+'\n');console.log('BLOG_PUBLIC_INVENTORY '+JSON.stringify({posts:rows.length,completePublicInventory,sitemap:evidence.sitemap,privateDraftInventory:evidence.privateDraftInventory,runId:evidence.source.runId}));
