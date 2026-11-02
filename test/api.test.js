import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('Authenticated billing workflow, partial payments, persistence and validation',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'sibil-test-'));const port=32000+Math.floor(Math.random()*10000),base=`http://127.0.0.1:${port}/api/`;let server;let cookie='';
 async function start(){server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),DATA_MODE:'demo',DATA_FILE:path.join(dir,'db.json'),ADMIN_PASSWORD:'test-password-123',NODE_ENV:'test',FRONTEND_ORIGIN:'https://egantc.github.io'}});await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('exit',()=>reject(Error('Server failed')));server.stderr.on('data',d=>process.stderr.write(d));});}
 async function stop(){await new Promise(r=>{server.once('exit',r);server.kill();});}
 async function call(url,body,status=200){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});assert.equal(r.status,status,await r.clone().text());if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r.json();}
 try{await start();await call('data',null,401);await call('login',{username:'admin',password:'wrong'},401);const login=await call('login',{username:'admin',password:'test-password-123'});
 const preflight=await fetch(base+'data',{method:'OPTIONS',headers:{Origin:'https://egantc.github.io','Access-Control-Request-Headers':'authorization'}});
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'https://egantc.github.io');
 const cross=await fetch(base+'data',{headers:{Origin:'https://egantc.github.io',Authorization:'Bearer '+login.token}});assert.equal(cross.status,200);
 const denied=await fetch(base+'data',{headers:{Origin:'https://untrusted.example',Authorization:'Bearer '+login.token}});assert.equal(denied.status,403);
 const unauthorized=await fetch(base+'data',{headers:{Origin:'https://egantc.github.io'}});assert.equal(unauthorized.status,401);
 const c=await call('customers',{name:'Pelanggan A',phone:'628123456789',plan:'20 Mbps',rate:150000,active:true});
 await call('invoices',{customerId:c.id,period:'2026-13',amount:150000,dueDate:'2026-11-10'},400);
 const i=await call('invoices',{customerId:c.id,period:'2026-11',amount:150000,dueDate:'2026-11-10'});
 await call('invoices',{customerId:c.id,period:'2026-11',amount:150000,dueDate:'2026-11-10'},409);
 await call('payments',{invoiceId:i.id,amount:50000,method:'CASH',paidAt:'2026-11-02'});
 await call('payments',{invoiceId:i.id,amount:100001,method:'TRANSFER',paidAt:'2026-11-02'},400);
 const results=await Promise.all([call('payments',{invoiceId:i.id,amount:100000,method:'TRANSFER',paidAt:'2026-11-02'}),]);assert.equal(results.length,1);
 const db=await call('data');assert.equal(db.payments.reduce((s,p)=>s+p.amount,0),150000);assert.equal(db.history.length,4);
 await stop();await start();cookie='';await call('data',null,401);await call('login',{username:'admin',password:'test-password-123'});assert.equal((await call('data')).payments.length,2);
 await call('logout',{});await call('data',null,401);
 }finally{if(server.exitCode===null)await stop();await rm(dir,{recursive:true,force:true});}
});
