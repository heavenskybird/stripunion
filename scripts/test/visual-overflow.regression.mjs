import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

test('94px/30px/15px root pseudo-element overflow fails even without a DOM offender', async () => {
  const server = http.createServer((req,res) => {
    const width = Number(req.url.slice(1));
    res.setHeader('content-type','text/html');
    res.end(`<html><head><style>html{min-width:calc(100vw + ${width}px)}body{margin:0}</style></head><body></body></html>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'su-overflow-'));
  try {
    const child=spawn(process.execPath,['scripts/visual-regression.mjs'],{env:{...process.env,VISUAL_BASE_URL:`http://127.0.0.1:${server.address().port}`,VISUAL_OUTPUT_DIR:dir,VISUAL_TARGETS_JSON:'["/94","/30","/15"]'},stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
    const code=await new Promise((resolve,reject)=>{child.on('exit',resolve);child.on('error',reject);});
    assert.equal(code,1,output);
    const report=JSON.parse(await fs.readFile(path.join(dir,'visual-report.json'),'utf8'));
    const mobile=report.failures.filter(x=>x.viewport==='mobile-320'&&x.type==='HORIZONTAL_OVERFLOW');
    assert.deepEqual(mobile.map(x=>x.detail),['94px','30px','15px']);
    assert.ok(mobile.every(x=>x.offenders.length===0));
    if(process.env.VISUAL_FIXTURE_REPORT)await fs.copyFile(path.join(dir,'visual-report.json'),process.env.VISUAL_FIXTURE_REPORT);
  } finally {server.close();await fs.rm(dir,{recursive:true,force:true});}
});
