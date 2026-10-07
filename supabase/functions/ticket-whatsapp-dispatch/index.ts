import {createClient} from 'npm:@supabase/supabase-js@2';
import {metaErrorMessage} from '../ticket-whatsapp/core.ts';
import {autoPhone} from './phone.ts';
export {autoPhone} from './phone.ts';
export async function dispatch(req:Request){
 const env=(s:string)=>Deno.env.get(s)||'';const secret=env('TICKET_WA_WORKER_SECRET');
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!secret||req.headers.get('x-worker-token')!==secret)return new Response('Unauthorized',{status:401});
 const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
 const token=env('TICKET_WA_ACCESS_TOKEN'),phone=env('TICKET_WA_PHONE_NUMBER_ID'),waba=env('TICKET_WA_WABA_ID'),version=env('TICKET_WA_GRAPH_VERSION')||'v23.0';
 if(!token||!/^\d+$/.test(phone)||!/^\d+$/.test(waba)||!/^v\d+\.\d+$/.test(version))return new Response('Configuration unavailable',{status:503});
 const graph=async(path:string,body?:unknown)=>{const r=await fetch(`https://graph.facebook.com/${version}/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});return{ok:r.ok,status:r.status,data:await r.json()};};
 // Do not claim work unless template status can be checked. No customer message is sent by this GET.
 let templates;try{templates=await graph(`${waba}/message_templates?fields=name,status,language&limit=100`);if(!templates.ok)throw new Error();}catch{return new Response('Meta configuration unavailable',{status:503});}
 const {data:jobs,error}=await db.rpc('claim_ticket_whatsapp');if(error)return new Response('Queue unavailable',{status:503});
 const results:Array<{id:string;status:string}>=[];
 const eventOrder:Record<string,number>={received:0,response:1,closed:2,survey:3};
 for(const job of (jobs||[]).sort((a:any,b:any)=>String(a.created_at||'').localeCompare(String(b.created_at||''))||(eventOrder[a.event]??4)-(eventOrder[b.event]??4))){
 const finish=async(status:string,error_message:string|null=null,provider_message_id:string|null=null)=>{const {error}=await db.from('ticket_whatsapp_outbox').update({status,error_message,provider_message_id,updated_at:new Date().toISOString(),next_attempt_at:new Date(Date.now()+900000).toISOString()}).eq('id',job.id).eq('status','processing');results.push({id:job.id,status:safeStatus(status,error)});};
 let recipient;try{recipient=autoPhone(job.recipient,job.equipment_country);}catch(error){await finish('needs_phone',(error as Error).message);continue;}
 // Resolve after routing has committed, immediately before choosing the approved template.
 if(job.event==='received'){
  const {data:assignment,error:assignmentError}=await db.from('ticket_assignments').select('assigned_to').eq('ticket_id',job.ticket_id).maybeSingle();
  if(assignmentError){await finish('waiting','No se pudo consultar el responsable. Se reintentará sin enviar un mensaje incompleto.');continue;}
  if(assignment?.assigned_to){
   const {data:person,error:personError}=await db.from('profiles').select('nombre_completo').eq('id',assignment.assigned_to).maybeSingle();
   if(personError||!person?.nombre_completo?.trim()){await finish('waiting','No se pudo confirmar el nombre del responsable.');continue;}
   job.template='orion_ticket_asignado_v1';
   job.parameters=[job.parameters[0],person.nombre_completo.trim()];
  }else{
   const {data:ticket,error:ticketError}=await db.from('tickets').select('numero_caso,numero_serie_equipo').eq('id',job.ticket_id).maybeSingle();
   if(ticketError||!ticket){await finish('waiting','No se pudo confirmar el ticket.');continue;}
   job.template='orion_ticket_recibido_v1';
   job.parameters=[ticket.numero_caso||job.ticket_id,ticket.numero_serie_equipo||'Sin serie registrada'];
  }
  const {error:auditError}=await db.from('ticket_whatsapp_outbox').update({template:job.template,parameters:job.parameters}).eq('id',job.id).eq('status','processing');
  if(auditError){await finish('waiting','No se pudo registrar el responsable para el mensaje.');continue;}
 }
 const approved=templates.data.data?.some((t:{name:string;language:string;status:string})=>t.name===job.template&&t.language==='es_MX'&&t.status==='APPROVED');
 if(!approved){await finish('waiting','Plantilla pendiente de aprobación o no disponible. Se revisará de nuevo en 15 minutos.');continue;}
 if(job.survey_id){const {data:s,error}=await db.from('ticket_satisfaction').update({send_status:'sending',sent_at:new Date().toISOString()}).eq('id',job.survey_id).eq('send_status','ready').is('answered_at',null).gt('expires_at',new Date().toISOString()).select('id').maybeSingle();if(error){await finish('failed','No se pudo reservar la encuesta; no se envió.');continue;}if(!s){await finish('skipped','La encuesta ya fue enviada, respondida, reservada o venció.');continue;}}
 let status='unknown',message:string|null=null,provider:string|null=null;
 try{const r=await graph(`${phone}/messages`,{messaging_product:'whatsapp',to:recipient,type:'template',template:{name:job.template,language:{code:'es_MX'},components:[{type:'body',parameters:job.parameters.map((text:string)=>({type:'text',text}))}]}});
 if(r.ok&&r.data.messages?.[0]?.id){status='accepted';provider=r.data.messages[0].id;}else if(!r.ok&&r.status<500){status='failed';message=metaErrorMessage(r.data.error?.code);}else message='Meta no confirmó el resultado. No se repetirá automáticamente.';
 }catch{message='Se perdió la confirmación de Meta. No se repetirá automáticamente.';}
 if(job.survey_id)await db.from('ticket_satisfaction').update({send_status:status,send_error:message,provider_message_id:provider}).eq('id',job.survey_id).eq('send_status','sending');
 await finish(status,message,provider);
 }
 return Response.json({results});
}
function safeStatus(status:string,error:unknown){return error?'audit_error':status;}
if(import.meta.main)Deno.serve(dispatch);
