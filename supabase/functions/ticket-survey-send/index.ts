import {createClient} from 'npm:@supabase/supabase-js@2';
import {normalizePhone,metaErrorMessage} from '../ticket-whatsapp/core.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const json=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
const env=(key:string)=>Deno.env.get(key)||'';
export async function handleSurveySend(req:Request){
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return json(405,{error:'Método no permitido'});
 try{
 const authorization=req.headers.get('Authorization')||'';
 if(!authorization.startsWith('Bearer '))return json(401,{error:'Inicia sesión'});
 const userClient=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
 const {data:{user},error:authError}=await userClient.auth.getUser();if(authError||!user)return json(401,{error:'Sesión inválida'});
 const {data:profile}=await userClient.from('profiles').select('rol').eq('id',user.id).single();if(profile?.rol!=='admin')return json(403,{error:'Solo administración puede enviar encuestas'});
 const text=await req.text();if(text.length>2000)return json(413,{error:'Solicitud demasiado grande'});
 let raw;try{raw=JSON.parse(text);}catch{return json(400,{error:'Solicitud inválida'});}if(!raw||typeof raw!=='object')return json(400,{error:'Solicitud inválida'});
 const token=env('TICKET_WA_ACCESS_TOKEN'),phone=env('TICKET_WA_PHONE_NUMBER_ID'),waba=env('TICKET_WA_WABA_ID');
 if(!token||!/^\d+$/.test(phone)||!/^\d+$/.test(waba))return json(503,{error:'WhatsApp no está configurado'});
 const version=env('TICKET_WA_GRAPH_VERSION')||'v23.0';if(!/^v\d+\.\d+$/.test(version))return json(503,{error:'Versión de Meta inválida'});
 const graph=async(path:string,body?:unknown)=>{const r=await fetch(`https://graph.facebook.com/${version}/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});return {ok:r.ok,status:r.status,data:await r.json()};};
 const name='orion_encuesta_servicio_v1';
 if(!['config','send'].includes(raw.action))return json(400,{error:'Acción inválida'});
 const template=await graph(`${waba}/message_templates?name=${name}&fields=name,status,language&limit=100`);
 if(!template.ok)return json(502,{error:metaErrorMessage(template.data.error?.code)});
 const status=template.data.data?.find((t:{name:string;language:string})=>t.name===name&&t.language==='es_MX')?.status||'MISSING';
 if(raw.action==='config')return json(200,{name,status});
 if(raw.consent!==true)return json(400,{error:'Confirma la autorización del destinatario'});
 if(typeof raw.id!=='string'||!/^[a-f0-9-]{36}$/i.test(raw.id))return json(400,{error:'Encuesta inválida'});
 let recipient;try{recipient=normalizePhone(raw.recipient);}catch(e){return json(400,{error:(e as Error).message});}
 const admin=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
 const {data:survey,error}=await admin.from('ticket_satisfaction').select('*').eq('id',raw.id).single();
 if(error||!survey)return json(404,{error:'Encuesta no encontrada'});
 if(survey.answered_at||new Date(survey.expires_at)<=new Date())return json(409,{error:'La encuesta ya fue respondida o venció'});
 if(survey.send_status!=='ready')return json(409,{error:'Esta invitación ya tiene un intento de envío. Revisa el resultado; no se repetirá automáticamente.'});
 if(status!=='APPROVED')return json(409,{error:'Meta aún no aprueba la plantilla de encuesta. Puedes compartir el enlace directamente.'});
 const {data:reserved,error:reserveError}=await admin.from('ticket_satisfaction').update({send_status:'sending',recipient:'+'+recipient,sent_at:new Date().toISOString(),sent_by:user.id,consented_at:new Date().toISOString()}).eq('id',survey.id).eq('send_status','ready').is('answered_at',null).select('id').maybeSingle();
 if(reserveError||!reserved)return json(409,{error:'No se pudo reservar el envío o ya está en proceso'});
 let result:{send_status:string;provider_message_id?:string;send_error?:string};
 try{const response=await graph(`${phone}/messages`,{messaging_product:'whatsapp',to:recipient,type:'template',template:{name,language:{code:'es_MX'},components:[{type:'body',parameters:[{type:'text',text:survey.case_number},{type:'text',text:`https://medinovacuu.github.io/orion/encuesta#${survey.token}`}]}]}});
 result=response.ok&&response.data.messages?.[0]?.id?{send_status:'accepted',provider_message_id:response.data.messages[0].id}:response.status>=500||response.ok?{send_status:'unknown',send_error:'Meta no confirmó el envío. No lo repitas sin verificar con el destinatario.'}:{send_status:'failed',send_error:metaErrorMessage(response.data.error?.code)};
 }catch{result={send_status:'unknown',send_error:'Se perdió la confirmación del envío. No lo repitas sin verificar.'};}
 const {error:saveError}=await admin.from('ticket_satisfaction').update(result).eq('id',survey.id);
 return json(200,{status:result.send_status,error_message:result.send_error,warning:saveError?'No se pudo guardar el resultado. No repitas el envío.':undefined});
 }catch{return json(503,{error:'No se pudo confirmar la operación. Actualiza el historial antes de intentar de nuevo.'});}
}
if(import.meta.main)Deno.serve(handleSurveySend);
