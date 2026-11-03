import {dashboard,months} from './dashboard-adapter.mjs';
const url='https://zxfulnrhbfnybgcbsssz.supabase.co', key='sb_publishable_AouAPH-l8Frz73NMl9_zCw_TwxltZwL', admin='ekoprabowojob@gmail.com';
let session=null;
const pending=new Map();
async function auth(path,body){
 const r=await fetch(url+'/auth/v1/'+path,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const d=await r.json();if(!r.ok)throw new Error(d.msg||d.error_description||d.message||'Autentikasi gagal');return d;
}
export async function register(email,password){
 if(email.trim().toLowerCase()!==admin)throw Error('Gunakan email admin uji yang ditentukan.');
 if(password.length<8)throw Error('Gunakan password baru minimal 8 karakter.');
 const d=await auth('signup',{email:admin,password});
 return d.access_token?'Akun dibuat. Klik Masuk untuk melanjutkan.':'Periksa email verifikasi, lalu kembali ke halaman ini dan masuk. Jika akun sudah ada, gunakan Masuk.';
}
export async function api(action,body={}){
 if(action==='login'){
  if(body.username.trim().toLowerCase()!==admin)throw Error('Akun ini tidak berhak mengakses salinan uji.');
  const d=await auth('token?grant_type=password',{email:admin,password:body.password});
  session=d;pending.clear();
  // Authorization must succeed before the UI treats this as a usable admin login.
  try{await api('dashboard',{});}catch(e){session=null;throw e;}
  return {token:d.access_token};
 }
 if(!session?.access_token)throw Object.assign(Error('Silakan login.'),{status:401});
 let request=body, cacheKey;
 if(action==='update'){
  const month=months.indexOf(body.month)+1;
  request={customer_id:body.row,month,status:body.status==='FALSE'?'UNPAID':body.status,version:body.version};
 }
 if(['update','addCustomer'].includes(action)){
  cacheKey=JSON.stringify({action,body:request});
  if(!pending.has(cacheKey))pending.set(cacheKey,crypto.randomUUID());
  request={...request,request_id:pending.get(cacheKey)};
 }
 try{
  const r=await fetch(url+'/functions/v1/sibil-test-api',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action,body:request}),signal:AbortSignal.timeout(25000)});
  const d=await r.json();
  if(!r.ok||!d.ok){if(r.status===401)session=null;throw Object.assign(Error(d.error||d.message||'Permintaan gagal'),{status:r.status});}
  if(cacheKey)pending.delete(cacheKey);
  if(action!=='dashboard')return d.data;
  const month=months.includes(body.month)?body.month:months[Number(new Intl.DateTimeFormat('en',{month:'numeric',timeZone:'Asia/Jakarta'}).format(new Date()))-1];
  const result=dashboard(d.data,month);
  const index=new Map(d.data.customers.map(c=>[c.source_row,c]));
  result.customers=result.customers.map(c=>{const customer=index.get(c.row);const status=d.data.statuses.find(s=>s.customer_id===customer.id&&s.month===months.indexOf(month)+1);return {...c,row:customer.id,version:status.version};});
  return result;
 }finally{if(action==='logout'){session=null;pending.clear();}}
}


