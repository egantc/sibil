// Dedicated test endpoint. No production configuration points here.
const ADMIN='ekoprabowojob@gmail.com';
const URL=Deno.env.get('SUPABASE_URL')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const origins=new Set(['http://127.0.0.1:8766','http://localhost:8766','https://sibil-supabase-test-ekoprabowo.ekokominfo00.chatgpt.site']);
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin');
 const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 if(origin && origins.has(origin)) Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'});
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
 if(origin && !origins.has(origin))return reply(403,{ok:false,error:'Origin not allowed'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{ok:false,error:'POST required'});
 try {
  const authorization=req.headers.get('Authorization')||'';
  if(!authorization.startsWith('Bearer '))return reply(401,{ok:false,error:'Login required'});
  const userResponse=await fetch(URL+'/auth/v1/user',{headers:{apikey:ANON,Authorization:authorization},signal:AbortSignal.timeout(10000)});
  if(!userResponse.ok)return reply(401,{ok:false,error:'Session invalid'});
  const user=await userResponse.json();
  if(user.email?.toLowerCase()!==ADMIN || !user.email_confirmed_at || user.is_anonymous)return reply(403,{ok:false,error:'Verified Sibil test administrator required'});
  // Read claims only after Auth has validated this exact token.
  const part=authorization.slice(7).split('.')[1];
  const claims=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(part.length/4)*4,'=')));
  if(!claims.session_id || claims.sub!==user.id)return reply(401,{ok:false,error:'Session required'});
  const raw=await req.text();
  if(raw.length>10000)return reply(413,{ok:false,error:'Request too large'});
  const input=JSON.parse(raw);
  if(!['dashboard','update','addCustomer','logout'].includes(input.action))return reply(400,{ok:false,error:'Unknown action'});
  const response=await fetch(URL+'/rest/v1/rpc/sibil_test_api',{
   method:'POST',headers:{apikey:SERVICE,Authorization:'Bearer '+SERVICE,'Content-Type':'application/json'},
   body:JSON.stringify({p_actor:user.id,p_session:claims.session_id,p_email:ADMIN,p_action:input.action,p_body:input.body||{}}),signal:AbortSignal.timeout(15000)
  });
  const data=await response.json();
  if(!response.ok){const status=data.code==='40001'||data.code==='23505'?409:data.code==='42501'?401:data.code?.startsWith('22')?400:500;return reply(status,{ok:false,status,error:status===500?'Database operation failed':data.message});}
  if(input.action==='logout')await fetch(URL+'/auth/v1/logout',{method:'POST',headers:{apikey:ANON,Authorization:authorization},signal:AbortSignal.timeout(10000)}).catch(()=>{});
  return reply(200,{ok:true,data});
 }catch{return reply(400,{ok:false,error:'Request failed; reload before retrying a write'});}
});

