import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
const token=process.env.TELEGRAM_BOT_TOKEN,raw=String(process.env.TELEGRAM_CHANNEL_ID||'').trim();
const report={checkedAt:new Date().toISOString(),providerRequests:0,sends:0,sendEnabled:false,methods:[],ready:false};
try{
 if(!token||!raw)throw Error('TELEGRAM_CREDENTIAL_OR_CHANNEL_NOT_CONFIGURED');
 const chatId=/^-?\d+$/.test(raw)||raw.startsWith('@')?raw:'@'+raw;
 async function read(method,payload={}){if(!['getMe','getChat','getChatMember'].includes(method))throw Error('READ_ONLY_METHOD_REQUIRED');report.providerRequests++;report.methods.push(method);const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('TELEGRAM_HTTP'+r.status);const d=await r.json();if(!d.ok)throw Error('TELEGRAM_PROVIDER_REFUSED');return d.result;}
 const bot=await read('getMe'),chat=await read('getChat',{chat_id:chatId}),member=await read('getChatMember',{chat_id:chatId,user_id:bot.id});
 report.channelIdFormat=/^-?\d+$/.test(chatId)?'numeric':'username';report.channelIdSha256=createHash('sha256').update(String(chat.id)).digest('hex');report.chatType=chat.type;report.hasPublicUsername=!!chat.username;report.memberStatus=member.status;report.canPostMessages=member.status==='creator'||member.status==='administrator'&&member.can_post_messages===true;report.channelUsername=chat.username||null;report.channelId=chat.id;report.botId=bot.id;report.botUsername=bot.username||null;report.ready=report.chatType==='channel'&&report.canPostMessages&&String(chat.username||'').toLowerCase()==='stripunion'&&bot.is_bot===true;report.numericAdapterDeployed=true;report.authorizationScope='Standing operator authorization for @StripUnion only';
}catch(e){report.error=/^TELEGRAM_|^READ_ONLY_/.test(e.message)?e.message:'TELEGRAM_READ_TRANSPORT_FAILURE';}
await fs.mkdir('artifacts/telegram-readiness',{recursive:true});await fs.writeFile('artifacts/telegram-readiness/report.json',JSON.stringify(report,null,2)+'\n');console.log('TELEGRAM_READ_ONLY_ACCEPTANCE '+JSON.stringify(report));

if(!report.ready)process.exitCode=1;
