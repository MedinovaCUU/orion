import {handleSurveySend} from './index.ts';
function assert(v:unknown,m='Assertion failed'):asserts v{if(!v)throw new Error(m);}
Deno.test('survey send: admin, consent, approval, expiry, atomic reservation and no duplicate on timeout',async()=>{
 for(const[k,v]of Object.entries({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',TICKET_WA_ACCESS_TOKEN:'test',TICKET_WA_PHONE_NUMBER_ID:'123',TICKET_WA_WABA_ID:'456'}))Deno.env.set(k,v);
 const original=globalThis.fetch;let role='admin',approved=false,sends=0,timeout=false;let payload:Record<string,unknown>={};
 const id='10000000-0000-4000-8000-000000000001';let row:Record<string,unknown>={id,token:'a'.repeat(64),case_number:'OR-1',expires_at:'2099-01-01',answered_at:null,send_status:'ready'};
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 globalThis.fetch=(async(input:RequestInfo|URL,options?:RequestInit)=>{const url=new URL(String(input)),body=options?.body?JSON.parse(String(options.body)):{};
 if(url.pathname==='/auth/v1/user')return reply({id:'actor',aud:'authenticated'});
 if(url.pathname.endsWith('/profiles'))return reply({rol:role});
 if(url.pathname.endsWith('/message_templates'))return reply({data:[{name:'orion_encuesta_servicio_v1',language:'es_MX',status:approved?'APPROVED':'PENDING'}]});
 if(url.pathname.endsWith('/ticket_satisfaction')){if(options?.method==='PATCH'){if(url.searchParams.has('send_status')&&row.send_status!=='ready')return reply(null);row={...row,...body};return reply(url.searchParams.has('select')?row:null);}return reply(row);}
 if(url.pathname.endsWith('/messages')){sends++;payload=body;if(timeout)throw new Error('Timeout');return reply({messages:[{id:'wamid.test'}]});}
 throw new Error(url.pathname);
 })as typeof fetch;
 const base={action:'send',id,recipient:'+52 6141772897',consent:true};const call=(body=base,authorization='Bearer test')=>handleSurveySend(new Request('https://test/send',{method:'POST',headers:{Authorization:authorization},body:JSON.stringify(body)}));
 try{assert((await call(base,'')).status===401);role='tecnico';assert((await call()).status===403);role='admin';assert((await call({...base,consent:false})).status===400);assert((await call()).status===409);assert(sends===0);approved=true;
 const results=await Promise.all([call(),call()]);assert(results.filter(r=>r.status===200).length===1);assert(Number(sends)===1);assert(payload.to==='526141772897');assert(row.sent_by==='actor');assert(row.consented_at);assert((await call()).status===409);
 row={...row,send_status:'ready'};timeout=true;assert((await(await call()).json()).status==='unknown');assert((await call()).status===409);assert(Number(sends)===2);
 row={...row,send_status:'ready',expires_at:'2000-01-01'};assert((await call()).status===409);assert(Number(sends)===2);
 }finally{globalThis.fetch=original;}
});
