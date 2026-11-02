import express from 'express';
import {randomBytes,scryptSync,timingSafeEqual,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {google} from 'googleapis';
const app=express(), demo=process.env.DATA_MODE==='demo', port=Number(process.env.PORT||3000);
const secure=process.env.NODE_ENV==='production';
if(!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length<12) throw Error('Set ADMIN_PASSWORD (minimum 12 characters).');
const salt=randomBytes(32), passwordHash=scryptSync(process.env.ADMIN_PASSWORD,salt,64);
const username=process.env.ADMIN_USERNAME||'admin';
const sessions=new Map(), attempts=new Map();
const tabs={customers:['id','name','phone','plan','rate','active'],invoices:['id','customerId','period','amount','dueDate'],payments:['id','invoiceId','amount','method','paidAt','createdAt'],history:['id','actor','at','action','before','after']};
const sheetNames={customers:'Sibil_Pelanggan',invoices:'Sibil_Tagihan',payments:'Sibil_Pembayaran',history:'Sibil_Riwayat'};
let sheets;
const file=path.resolve(process.env.DATA_FILE||'.data/demo.json');
if(!demo){if(!process.env.SPREADSHEET_ID) throw Error('SPREADSHEET_ID required. Use DATA_MODE=demo for local simulation.'); sheets=google.sheets({version:'v4',auth:new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets']})});}
async function load(){
 if(demo){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return Object.fromEntries(Object.keys(tabs).map(k=>[k,[]]));}}
 const out={};for(const k of Object.keys(tabs)){const r=await sheets.spreadsheets.values.get({spreadsheetId:process.env.SPREADSHEET_ID,range:`'${sheetNames[k]}'!A:Z`});const rows=r.data.values||[];if(JSON.stringify(rows[0])!==JSON.stringify(tabs[k]))throw Error(`Header ${sheetNames[k]} tidak sesuai README`);out[k]=rows.slice(1).filter(r=>r[0]).map(r=>Object.fromEntries(tabs[k].map((h,i)=>[h,r[i]??''])));}
 return out;
}
async function save(db){if(demo){await mkdir(path.dirname(file),{recursive:true});await writeFile(file+'.tmp',JSON.stringify(db,null,2));await rename(file+'.tmp',file);return;}
 // Records are append-only; updates preserve row counts. Never clear legacy worksheets.
 await sheets.spreadsheets.values.batchUpdate({spreadsheetId:process.env.SPREADSHEET_ID,requestBody:{valueInputOption:'RAW',data:Object.entries(tabs).map(([k,cols])=>({range:`'${sheetNames[k]}'!A1`,values:[cols,...db[k].map(r=>cols.map(c=>r[c]??''))]}))}});
}
let queue=Promise.resolve();function exclusive(fn){const next=queue.then(fn);queue=next.catch(()=>{});return next;}
function bad(message,status=400){throw Object.assign(Error(message),{status});}
function text(v,label,max=150){if(typeof v!=='string'||!v.trim()||v.length>max)bad(`${label} tidak valid`);return v.trim();}
function money(v){if(!Number.isSafeInteger(v)||v<=0||v>1e10)bad('Nominal harus bilangan bulat positif');return v;}
function date(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)bad('Tanggal tidak valid');return v;}
function period(v){if(typeof v!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(v))bad('Periode tidak valid');return v;}
function audit(db,action,before,after){db.history.push({id:randomUUID(),actor:username,at:new Date().toISOString(),action,before:JSON.stringify(before),after:JSON.stringify(after)});}
app.disable('x-powered-by');app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"});next();});
app.use(express.json({limit:'100kb'}));
app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');if(!['GET','HEAD'].includes(req.method)){const origin=req.get('origin');if(origin&&origin!==`${req.protocol}://${req.get('host')}`)return res.status(403).json({error:'Origin ditolak'});}next();});
function cookie(req){return req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('sibil='))?.slice(6);}
app.post('/api/login',(req,res)=>{const key=req.ip,now=Date.now();let a=attempts.get(key);if(a&&now>a.until){attempts.delete(key);a=null;}if(a?.count>=5)return res.status(429).json({error:'Terlalu banyak percobaan. Tunggu 15 menit.'});const pw=typeof req.body.password==='string'?req.body.password:'';if(pw.length>512)return res.status(400).json({error:'Input terlalu panjang'});const valid=timingSafeEqual(scryptSync(pw,salt,64),passwordHash)&&req.body.username===username;if(!valid){attempts.set(key,{count:(a?.count||0)+1,until:a?.until||now+900000});return res.status(401).json({error:'Username atau password salah'});}attempts.delete(key);const token=randomBytes(32).toString('hex');sessions.set(token,now+8*3600000);res.cookie('sibil',token,{httpOnly:true,sameSite:'strict',secure,maxAge:8*3600000,path:'/'}).json({ok:true});});
app.use('/api',(req,res,next)=>{const token=cookie(req);if(!token||!(sessions.get(token)>Date.now()))return res.status(401).json({error:'Silakan login'});next();});
app.post('/api/logout',(req,res)=>{sessions.delete(cookie(req));res.clearCookie('sibil',{path:'/'}).json({ok:true});});
setInterval(()=>{const now=Date.now();for(const [k,t]of sessions)if(t<now)sessions.delete(k);for(const [k,v]of attempts)if(v.until<now)attempts.delete(k);},60000).unref();
app.get('/api/data',async(req,res)=>res.json(await exclusive(async()=>({...await load(),mode:demo?'demo':'sheets'}))));
function mutate(route,fn){app.post(route,async(req,res)=>res.json(await exclusive(async()=>{const db=await load();const result=fn(db,req.body);await save(db);return result;})));}
mutate('/api/customers',(db,b)=>{const old=b.id?db.customers.find(c=>c.id===b.id):null;if(b.id&&!old)bad('Pelanggan tidak ditemukan',404);const row={id:old?.id||randomUUID(),name:text(b.name,'Nama'),phone:text(b.phone,'WhatsApp',25),plan:text(b.plan,'Paket'),rate:money(b.rate),active:b.active===true};if(!/^\+?[0-9]{8,15}$/.test(row.phone))bad('Nomor WhatsApp tidak valid');const before=old?{...old}:null;if(old)Object.assign(old,row);else db.customers.push(row);audit(db,'customer.save',before,row);return row;});
mutate('/api/invoices',(db,b)=>{const c=db.customers.find(c=>c.id===b.customerId);if(!c||String(c.active)!=='true')bad('Pelanggan tidak aktif/tidak ditemukan');const p=period(b.period);if(db.invoices.some(i=>i.customerId===c.id&&i.period===p))bad('Tagihan periode ini sudah ada',409);const row={id:randomUUID(),customerId:c.id,period:p,amount:money(b.amount),dueDate:date(b.dueDate)};db.invoices.push(row);audit(db,'invoice.create',null,row);return row;});
mutate('/api/payments',(db,b)=>{const i=db.invoices.find(i=>i.id===b.invoiceId);if(!i)bad('Tagihan tidak ditemukan');const amount=money(b.amount),paid=db.payments.filter(p=>p.invoiceId===i.id).reduce((a,p)=>a+Number(p.amount),0);if(amount>Number(i.amount)-paid)bad('Pembayaran melebihi sisa tagihan');if(!['CASH','TRANSFER'].includes(b.method))bad('Metode tidak valid');const row={id:randomUUID(),invoiceId:i.id,amount,method:b.method,paidAt:date(b.paidAt),createdAt:new Date().toISOString()};db.payments.push(row);audit(db,'payment.create',null,row);return row;});
app.use(express.static('public'));
app.use((err,req,res,next)=>{if(!err.status)console.error('Request failed:',err.message);res.status(err.status||500).json({error:err.status?err.message:'Penyimpanan tidak tersedia. Periksa konfigurasi Google Sheets/log server.'});});
app.listen(port,'0.0.0.0',()=>console.log(`Sibil running on port ${port} (${demo?'DEMO — local data':'Google Sheets'})`));
