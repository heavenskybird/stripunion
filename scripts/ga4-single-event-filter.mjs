export function diagnosticRequest(url, body='') {
 const u=new URL(url),q=u.searchParams;
 if(!/(^|\.)google-analytics\.com$|(^|\.)analytics\.google\.com$/.test(u.hostname)||u.protocol!=='https:'||u.pathname!=='/g/collect'||q.get('tid')!=='G-K57BRX69X1')return null;
 const lines=body.split(/\r?\n/).filter(Boolean);
 const event=q.get('en');
 if(event==='recovery_consent_check'&&lines.every(l=>!new URLSearchParams(l).get('en')||new URLSearchParams(l).get('en')===event)&&lines.length<=1)return{postData:body,eventCount:1};
 // A common-query GA4 batch consists of independent event parameter lines.
 // Never reinterpret a query-level event or manufacture diagnostic parameters.
 if(event)return null;
 const selected=lines.filter(l=>new URLSearchParams(l).get('en')==='recovery_consent_check');
 if(selected.length!==1)return null;
 return{postData:selected[0],eventCount:1};
}
