export const improvements: Record<string,string> = {speed:'Rapidez',solution:'Solución del problema',clarity:'Claridad de las explicaciones',care:'Trato recibido',followup:'Seguimiento',none:'Nada por mejorar',other:'Otro'};
export interface Survey { id:string; ticket_id:string; token:string; specialist_id:string|null; specialist_name:string|null; area:string; case_number:string; recipient:string|null; created_at:string; expires_at:string; answered_at:string|null; sent_at:string|null; send_status:string; send_error:string|null; satisfaction:number|null; speed:number|null; resolution:string|null; clarity:number|null; improvement:string|null; comment:string|null }
export const areaNames:Record<string,string>={ingenieria:'Ingeniería',quimica:'Aplicaciones químicas',sin_clasificar:'Sin clasificar'};
export function metrics(rows:Survey[]) {
 const answers=rows.filter(s=>s.answered_at);
 const average=(key:'satisfaction'|'speed'|'clarity')=>{const values=answers.map(s=>s[key]).filter((v):v is number=>v!==null);return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;};
 return {count:answers.length,invited:rows.length,csat:answers.length?100*answers.filter(s=>s.satisfaction!>=4).length/answers.length:null,
 satisfaction:average('satisfaction'),speed:average('speed'),clarity:average('clarity'),clarityCount:answers.filter(s=>s.clarity!==null).length,
 resolution:answers.length?100*answers.filter(s=>s.resolution==='total').length/answers.length:null,
 followup:answers.filter(s=>s.resolution!=='total').length,
 participation:rows.length?100*answers.length/rows.length:null};
}
export function specialists(rows:Survey[]) {
 const ids=[...new Set(rows.filter(s=>s.specialist_id).map(s=>`${s.specialist_id}:${s.area}`))];
 return ids.map(key=>{const group=rows.filter(s=>`${s.specialist_id}:${s.area}`===key);return {key,name:group[0].specialist_name||'Especialista sin nombre',area:group[0].area,...metrics(group)};})
 .sort((a,b)=>(b.csat??-1)-(a.csat??-1)||b.count-a.count||a.name.localeCompare(b.name));
}
export function surveyUrl(token:string){return `${window.location.origin}${import.meta.env.BASE_URL}encuesta#${token}`;}
