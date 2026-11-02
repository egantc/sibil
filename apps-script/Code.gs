// Configure Script Properties: SPREADSHEET_ID, ADMIN_USERNAME, ADMIN_PASSWORD.
// Public web app: all data operations require a server-validated session token.
var SIBIL_COLUMNS = {customers:['id','name','phone','plan','rate','active'],invoices:['id','customerId','period','amount','dueDate'],payments:['id','invoiceId','amount','method','paidAt','createdAt'],history:['id','actor','at','action','before','after']};
var SIBIL_SHEETS = {customers:'Sibil_Pelanggan',invoices:'Sibil_Tagihan',payments:'Sibil_Pembayaran',history:'Sibil_Riwayat'};
function config_(){var p=PropertiesService.getScriptProperties().getProperties();if(!p.SPREADSHEET_ID || !p.ADMIN_USERNAME || !p.ADMIN_PASSWORD || p.ADMIN_PASSWORD.length<12)throw Error('Konfigurasi Script Properties belum lengkap');return p;}
function randomUUID(){return Utilities.getUuid();}
function json_(v){return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON);}
function digest_(v){return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,v,Utilities.Charset.UTF_8));}
function equal_(a,b){var x=digest_(a),y=digest_(b),diff=0;for(var i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);return diff===0;}
function spreadsheet_(){return SpreadsheetApp.openById(config_().SPREADSHEET_ID);}
// Run once in editor, after configuring properties. Existing tabs are not overwritten.
function setupSibil(){config_();var lock=LockService.getScriptLock();lock.waitLock(30000);try{var ss=spreadsheet_();Object.keys(SIBIL_COLUMNS).forEach(function(k){var sh=ss.getSheetByName(SIBIL_SHEETS[k]);if(!sh){sh=ss.insertSheet(SIBIL_SHEETS[k]);sh.getRange(1,1,1,SIBIL_COLUMNS[k].length).setValues([SIBIL_COLUMNS[k]]);sh.setFrozenRows(1);}});}finally{lock.releaseLock();}}
function load_(){var ss=spreadsheet_(),db={};Object.keys(SIBIL_COLUMNS).forEach(function(k){var sh=ss.getSheetByName(SIBIL_SHEETS[k]);if(!sh)throw Error('Jalankan setupSibil terlebih dahulu');var rows=sh.getDataRange().getValues(),cols=SIBIL_COLUMNS[k];if(JSON.stringify(rows[0])!==JSON.stringify(cols))throw Error('Header tab tidak sesuai: '+SIBIL_SHEETS[k]);db[k]=rows.slice(1).filter(function(r){return r[0];}).map(function(r){var o={};cols.forEach(function(c,i){o[c]=r[i]===undefined?'':r[i];if(o[c] instanceof Date)o[c]=Utilities.formatDate(o[c],'Asia/Jakarta','yyyy-MM-dd');});return o;});});return db;}
function save_(db){var ss=spreadsheet_();Object.keys(SIBIL_COLUMNS).forEach(function(k){var cols=SIBIL_COLUMNS[k],rows=db[k].map(function(o){return cols.map(function(c){var v=o[c]===undefined?'':o[c];return typeof v==='string'&&/^[=+@-]/.test(v)?"'"+v:v;});});if(rows.length)ss.getSheetByName(SIBIL_SHEETS[k]).getRange(2,1,rows.length,cols.length).setValues(rows);});SpreadsheetApp.flush();}
function doGet(){return json_({ok:true,service:'Sibil API',message:'Gunakan website Sibil untuk login.'});}
function doPost(e){var lock=LockService.getScriptLock(),locked=false;try{
 if(!e||!e.postData||e.postData.contents.length>100000)bad('Request tidak valid');
 var request=JSON.parse(e.postData.contents),action=request.action,b=request.body||{},cfg=config_();
 if(typeof action!=='string')bad('Action tidak valid');
 lock.waitLock(30000);locked=true;
 var cache=CacheService.getScriptCache();
 if(action==='login'){
  // Apps Script does not expose a reliable client IP. Limit globally to protect the endpoint.
  var rate=JSON.parse(cache.get('login-rate')||'{"count":0,"until":0}');
  if(rate.until<Date.now())rate={count:0,until:Date.now()+900000};
  if(rate.count>=20)bad('Terlalu banyak percobaan. Tunggu 15 menit.',429);
  if(typeof b.password!=='string'||b.password.length>512||typeof b.username!=='string')bad('Input login tidak valid');
  if(!equal_(b.password,cfg.ADMIN_PASSWORD)||b.username!==cfg.ADMIN_USERNAME){rate.count++;cache.put('login-rate',JSON.stringify(rate),900);bad('Username atau password salah',401);}
  var token=randomUUID()+randomUUID();cache.put('session:'+digest_(token),cfg.ADMIN_USERNAME,21600);return json_({ok:true,data:{ok:true,token:token}});
 }
 if(typeof request.token!=='string'||request.token.length>200||!cache.get('session:'+digest_(request.token)))bad('Silakan login',401);
 if(action==='logout'){cache.remove('session:'+digest_(request.token));return json_({ok:true,data:{ok:true}});}
 var db=load_();if(action==='data'){db.mode='sheets';return json_({ok:true,data:db});}
 var result=mutate_(action,db,b,cfg.ADMIN_USERNAME);save_(db);return json_({ok:true,data:result});
 }catch(err){return json_({ok:false,status:err.status||500,error:err.status?err.message:'Operasi gagal. Periksa Script Properties, izin, header spreadsheet, dan log Apps Script. Jangan langsung mengulang pembayaran sebelum memeriksa data.'});}
 finally{if(locked)lock.releaseLock();}}

function bad(message,status=400){throw Object.assign(Error(message),{status});}
function text(v,label,max=150){if(typeof v!=='string'||!v.trim()||v.length>max)bad(`${label} tidak valid`);return v.trim();}
function money(v){if(!Number.isSafeInteger(v)||v<=0||v>1e10)bad('Nominal harus bilangan bulat positif');return v;}
function date(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)bad('Tanggal tidak valid');return v;}
function period(v){if(typeof v!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(v))bad('Periode tidak valid');return v;}
function audit(db,action,before,after){db.history.push({id:randomUUID(),actor:PropertiesService.getScriptProperties().getProperty('ADMIN_USERNAME'),at:new Date().toISOString(),action,before:JSON.stringify(before),after:JSON.stringify(after)});}

function mutate_(action,db,b,username){
if(action==='customers'){const old=b.id?db.customers.find(c=>c.id===b.id):null;if(b.id&&!old)bad('Pelanggan tidak ditemukan',404);const row={id:old?.id||randomUUID(),name:text(b.name,'Nama'),phone:text(b.phone,'WhatsApp',25),plan:text(b.plan,'Paket'),rate:money(b.rate),active:b.active===true};if(!/^\+?[0-9]{8,15}$/.test(row.phone))bad('Nomor WhatsApp tidak valid');const before=old?{...old}:null;if(old)Object.assign(old,row);else db.customers.push(row);audit(db,'customer.save',before,row);return row;}
if(action==='invoices'){const c=db.customers.find(c=>c.id===b.customerId);if(!c||String(c.active)!=='true')bad('Pelanggan tidak aktif/tidak ditemukan');const p=period(b.period);if(db.invoices.some(i=>i.customerId===c.id&&i.period===p))bad('Tagihan periode ini sudah ada',409);const row={id:randomUUID(),customerId:c.id,period:p,amount:money(b.amount),dueDate:date(b.dueDate)};db.invoices.push(row);audit(db,'invoice.create',null,row);return row;}
if(action==='payments'){const i=db.invoices.find(i=>i.id===b.invoiceId);if(!i)bad('Tagihan tidak ditemukan');const amount=money(b.amount),paid=db.payments.filter(p=>p.invoiceId===i.id).reduce((a,p)=>a+Number(p.amount),0);if(amount>Number(i.amount)-paid)bad('Pembayaran melebihi sisa tagihan');if(!['CASH','TRANSFER'].includes(b.method))bad('Metode tidak valid');const row={id:randomUUID(),invoiceId:i.id,amount,method:b.method,paidAt:date(b.paidAt),createdAt:new Date().toISOString()};db.payments.push(row);audit(db,'payment.create',null,row);return row;}
bad('Action tidak dikenal',404);
}
