export function collectionPolicy({enabled=false,now=Date.now(),cooldownUntil=null,lastCollectedAt=null,maxPages=2,lookbackDays=7}={}){
 if(!enabled)return{allowed:false,reason:'BUFFER_ANALYTICS_PAUSED',providerRequests:0};
 if(cooldownUntil&&(!Number.isFinite(Date.parse(cooldownUntil))||Date.parse(cooldownUntil)>now))return{allowed:false,reason:'BUFFER_PROVIDER_COOLDOWN',providerRequests:0};
 if(lastCollectedAt&&(!Number.isFinite(Date.parse(lastCollectedAt))||Date.parse(lastCollectedAt)>now||now-Date.parse(lastCollectedAt)<7*86400000))return{allowed:false,reason:'BUFFER_COLLECTION_CACHE_HOLD',providerRequests:0};
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>2||!Number.isInteger(lookbackDays)||lookbackDays<1||lookbackDays>7)throw Error('BUFFER_COLLECTION_BOUNDS');
 return{allowed:true,maxPages,lookbackDays,maximumRequests:2+2*maxPages,metrics:false};
}
