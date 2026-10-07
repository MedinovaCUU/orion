import {dispatch,autoPhone} from './index.ts';
function assert(x:unknown){if(!x)throw new Error('Assertion failed');}
Deno.test('worker authentication, approved-only templates, normalized destination and no retries after uncertainty',async()=>{
 for(const[k,v]of Object.entries({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',TICKET_WA_WORKER_SECRET:'worker-test',TICKET_WA_ACCESS_TOKEN:'test',TICKET_WA_PHONE_NUMBER_ID:'123',TICKET_WA_WABA_ID:'456'}))Deno.env.set(k,v);
 assert(autoPhone('6141772897','México')==='526141772897');assert(autoPhone('+52 1 6141772897')==='526141772897');
 const original=globalThis.fetch;let sends=0,approved=false,timeout=false;let job={id:'1',status:'queued',recipient:'6141772897',equipment_country:'MEXICO',template:'test_template',parameters:['OR-1'],survey_id:null};
 const reply=(body:unknown)=>new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
 globalThis.fetch=(async(input:RequestInfo|URL,options?:RequestInit)=>{const url=new URL(String(input)),body=options?.body?JSON.parse(String(options.body)):{};
 if(url.pathname.endsWith('/message_templates'))return reply({data:[{name:'test_template',status:approved?'APPROVED':'PENDING',language:'es_MX'}]});
 if(url.pathname.endsWith('/claim_ticket_whatsapp')){if(job.status!=='queued')return reply([]);job.status='processing';return reply([job]);}
 if(url.pathname.endsWith('/ticket_whatsapp_outbox')){job={...job,...body};return reply(null);}
 if(url.pathname.endsWith('/messages')){sends++;assert(body.to==='526141772897');if(timeout)throw new Error('Timeout');return reply({messages:[{id:'wamid.test'}]});}throw new Error(url.pathname);
 })as typeof fetch;
 const call=(secret='worker-test')=>dispatch(new Request('https://test/worker',{method:'POST',headers:{'x-worker-token':secret}}));
 try{assert((await call('bad')).status===401);await call();assert(job.status==='waiting'&&sends===0);approved=true;job.status='queued';await call();assert(job.status==='accepted'&&Number(sends)===1);await call();assert(Number(sends)===1);timeout=true;job.status='queued';await call();assert(job.status==='unknown');await call();assert(Number(sends)===2);}finally{globalThis.fetch=original;}
});
Deno.test('receipt uses current assignee, waits for approval and restores receipt after unassignment',async()=>{
 for(const[k,v]of Object.entries({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',TICKET_WA_WORKER_SECRET:'worker-test',TICKET_WA_ACCESS_TOKEN:'test',TICKET_WA_PHONE_NUMBER_ID:'123',TICKET_WA_WABA_ID:'456'}))Deno.env.set(k,v);
 const original=globalThis.fetch;let assigned=true,approved=true;const sent:any[]=[];
 let job:any={id:'2',ticket_id:'ticket',event:'received',status:'queued',recipient:'6141772897',equipment_country:'MEXICO',template:'orion_ticket_recibido_v1',parameters:['OR-2','NS-1']};
 const reply=(body:unknown)=>new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
 globalThis.fetch=(async(input:RequestInfo|URL,options?:RequestInit)=>{
 const url=new URL(String(input)),body=options?.body?JSON.parse(String(options.body)):{};
 if(url.pathname.endsWith('/message_templates'))return reply({data:[{name:'orion_ticket_asignado_v1',status:approved?'APPROVED':'PENDING',language:'es_MX'},{name:'orion_ticket_recibido_v1',status:'APPROVED',language:'es_MX'}]});
 if(url.pathname.endsWith('/claim_ticket_whatsapp')){job.status='processing';return reply([job]);}
 if(url.pathname.endsWith('/ticket_assignments'))return reply(assigned?{assigned_to:'person'}:null);
 if(url.pathname.endsWith('/profiles'))return reply({nombre_completo:'Martha Carbajal'});
 if(url.pathname.endsWith('/tickets'))return reply({numero_caso:'OR-2',numero_serie_equipo:'NS-1'});
 if(url.pathname.endsWith('/ticket_whatsapp_outbox')){job={...job,...body};return reply(null);}
 if(url.pathname.endsWith('/messages')){sent.push(body);return reply({messages:[{id:'wamid.mock'}]});}
 throw new Error(url.pathname);
 })as typeof fetch;
 const call=()=>dispatch(new Request('https://test/worker',{method:'POST',headers:{'x-worker-token':'worker-test'}}));
 try{
 await call();assert(sent[0].template.name==='orion_ticket_asignado_v1');assert(sent[0].template.components[0].parameters[1].text==='Martha Carbajal');assert(job.parameters[1]==='Martha Carbajal');
 approved=false;await call();assert(job.status==='waiting'&&sent.length===1);
 assigned=false;await call();assert(sent[1].template.name==='orion_ticket_recibido_v1');assert(sent[1].template.components[0].parameters[1].text==='NS-1');
 }finally{globalThis.fetch=original;}
});
