import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import ExcelJS from 'exceljs';
const output = new URL('../../outputs/ticket-control-verification/', import.meta.url);
await fs.mkdir(output, {recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true});
const context = await browser.newContext({viewport:{width:1600,height:1100}});
const page = await context.newPage();
const errors=[]; page.on('pageerror',error=>errors.push(error.message));
const start=Date.parse('2026-09-01T12:00:00Z');
const timestamp=h=>new Date(start+h*3600000).toISOString();
const event=(id,kind,hours,extra={})=>({id:`${id}-${kind}`,ticket_id:`case-${id}`,kind,detail:'Evidencia del servicio revisada y documentada.',actor_id:id%2?'ana':'diego',occurred_at:timestamp(hours),profiles:{nombre_completo:id%2?'Ana Martínez':'Diego Navarro'},...extra});
const events=[];
for(let id=1;id<=22;id++){
 if(id!==6&&id!==22)events.push(event(id,'respuesta',2));
 if(id<=20&&id!==6)events.push(event(id,'cierre',id===2||id===3?72:20,{closure_reason:id===4?'visita_programada':id===5?null:'solucionado'}));
}
events.push(event(3,'justificacion',74));
let reviewWrites=0; let movementWrites=0; let allowApproval=true; let failEvents=false; let allowControl=true; let bulkReads=0; let assignmentWrites=0; const assignments=new Map();
await context.route('**/rest/v1/**',async route=>{
 const url=new URL(route.request().url());
 let data=[];
 if(url.pathname.endsWith('/rpc/is_admin')) data=allowControl;
 if(url.pathname.endsWith('/rpc/get_ticket_control_events')) {data=events; bulkReads++;}
 if(url.pathname.endsWith('/ticket_assignments')) { const id=url.searchParams.get('ticket_id')?.replace('eq.',''); data=assignments.has(id)?{assigned_to:assignments.get(id)}:null; }
 if(url.pathname.endsWith('/profiles')) data=[{id:'ana',nombre_completo:'Ana Martínez'},{id:'diego',nombre_completo:'Diego Navarro'}];
 if(url.pathname.endsWith('/rpc/assign_support_ticket')) { const payload=route.request().postDataJSON(); assignments.set(payload.p_ticket_id,payload.p_assigned_to); assignmentWrites++; data=null; }
 if((url.pathname.endsWith('/ticket_service_events') || url.pathname.endsWith('/rpc/get_ticket_control_events')) && failEvents) { await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Servicio temporalmente no disponible'})}); return; }
 if(url.pathname.endsWith('/ticket_service_events')) { const id=url.searchParams.get('ticket_id')?.replace('eq.',''); data=id?events.filter(e=>e.ticket_id===id):events; }
 if(url.pathname.endsWith('/rpc/can_approve_ticket_delay')) data=allowApproval;
 if(url.pathname.endsWith('/rpc/register_ticket_movement')) {
  const payload=route.request().postDataJSON(); movementWrites++;
  const id=Number(payload.p_ticket_id.split('-')[1]);
  if(payload.p_action==='revision_cierre') {reviewWrites++; events.push(event(id,'revision_cierre',100,{detail:payload.p_detail}));}
  if(payload.p_action==='respuesta' && !events.some(e=>e.ticket_id===payload.p_ticket_id&&e.kind==='respuesta')) events.push(event(id,'respuesta',24,{detail:payload.p_detail}));
  data=null;
 }
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
try {
 await page.goto(process.env.TICKET_CONTROL_URL||'http://127.0.0.1:5198/orion/tests/fixtures/ticket-control.html');
 await page.getByText('20 casos encontrados',{exact:false}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Ver expediente',exact:true}).count(),15);
 await page.screenshot({path:fileURLToPath(new URL('desktop.png',output)),fullPage:true});
 await page.getByRole('button',{name:'Siguiente',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Ver expediente',exact:true}).count(),5);
 await page.getByRole('button',{name:'Anterior',exact:true}).click();
 await page.getByLabel('Buscar en el expediente').fill('OR-0002');
 await page.getByText('1 casos encontrados',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Ver expediente',exact:true}).click();
 await page.getByLabel('Movimiento',{exact:true}).waitFor();
 assert.equal(await page.locator('textarea').count(),1,'One capture field replaces the duplicated forms');
 await page.getByLabel('Movimiento',{exact:true}).selectOption('revision_cierre');
 await page.getByLabel('Detalle del movimiento').fill('Gerencia validó la evidencia del cierre. La demora sigue sin justificar.');
 await page.getByRole('button',{name:'Guardar movimiento',exact:true}).click();
 await page.getByText('✓ Revisado',{exact:true}).waitFor();
 assert.equal(reviewWrites,1);
 assert.match(await page.locator('.tc-table').first().innerText(),/Fuera de plazo/);
 await page.screenshot({path:fileURLToPath(new URL('expediente.png',output)),fullPage:true});
 await page.getByRole('button',{name:'Limpiar filtros',exact:true}).first().click();
 await page.getByLabel('Resultado',{exact:true}).selectOption('visita_programada');
 await page.getByText('1 casos encontrados',{exact:false}).waitFor();
 assert.match(await page.locator('.tc-kpi-good').innerText(),/0 soluciones evaluables/);
 await page.getByRole('button',{name:'Limpiar filtros',exact:true}).first().click();
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'Exportar Excel'}).click();
 const download=await downloadPromise; const path=fileURLToPath(new URL('control.xlsx',output)); await download.saveAs(path);
 const book=new ExcelJS.Workbook(); await book.xlsx.readFile(path);
 assert.equal(book.worksheets[0].rowCount,21,'Export includes all 20 rows, not only current page');
 assert.equal(book.worksheets[0].getCell('A2').type,ExcelJS.ValueType.String);
 await page.getByLabel('Desde',{exact:true}).fill('2026-09-02');
 await page.getByText('No hay casos con estos filtros',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Limpiar filtros',exact:true}).first().click();
 // Intercept print instead of opening a native dialog; confirm all filtered records.
 await context.addInitScript(()=>{window.print=()=>{window.__printed=true};});
 const popupPromise=page.waitForEvent('popup');
 await page.getByRole('button',{name:'Imprimir / PDF'}).click();
 const popup=await popupPromise; await popup.waitForLoadState();
 assert.equal(await popup.locator('tbody tr').count(),20);
 await popup.close();
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:fileURLToPath(new URL('mobile.png',output)),fullPage:true});
 const layout = await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth, offenders:[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right,position:getComputedStyle(e).position,overflow:getComputedStyle(e).overflow})).slice(0,16)}));
 if(layout.scroll>layout.width) console.log(JSON.stringify(layout));
 assert.equal(layout.scroll<=layout.width,true,'No page-level horizontal overflow');
 await page.setViewportSize({width:1600,height:1100});
 await page.getByRole('button',{name:/En atención/}).first().click();
 await page.getByLabel('Buscar en el expediente').fill('OR-0022');
 await page.getByRole('button',{name:'Ver expediente',exact:true}).click();
 await page.getByLabel('Movimiento',{exact:true}).waitFor();
 assert.equal(await page.locator('textarea').count(),1);
 await page.getByLabel('Movimiento',{exact:true}).selectOption('respuesta');
 await page.getByLabel('Detalle del movimiento').fill('Contacto con el cliente y orientación inicial.');
 await page.getByRole('button',{name:'Guardar movimiento',exact:true}).click();
 await page.getByLabel('Detalle del movimiento').waitFor();
 await page.waitForFunction(()=>document.querySelector('textarea')?.value==='');
 await page.getByLabel('Movimiento',{exact:true}).selectOption('respuesta');
 await page.getByLabel('Detalle del movimiento').fill('Segundo contacto sin cambiar la primera respuesta.');
 await page.getByRole('button',{name:'Guardar movimiento',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('textarea')?.value==='');
 assert.equal(events.filter(e=>e.ticket_id==='case-22'&&e.kind==='respuesta').length,1);
 assert.equal(movementWrites,3);
 await page.getByLabel('Responsable del caso',{exact:true}).selectOption('ana');
 await page.getByRole('button',{name:'Guardar asignación',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('select[aria-label="Responsable del caso"]')?.value==='ana');
 assert.equal(assignmentWrites,1);
 assert.equal(assignments.get('case-22'),'ana');
 await page.screenshot({path:fileURLToPath(new URL('captura-unificada.png',output)),fullPage:true});
 allowApproval=false;
 await page.reload();
 await page.getByText('20 casos encontrados',{exact:false}).waitFor();
 await page.getByLabel('Buscar en el expediente').fill('OR-0003');
 await page.getByRole('button',{name:'Ver expediente',exact:true}).click();
 await page.getByText('Pendiente de revisión',{exact:true}).last().waitFor();
 assert.equal(await page.getByLabel('Movimiento',{exact:true}).count(),0,'No review controls without approval permission');
 failEvents=true;
 await page.reload();
 await page.getByRole('alert').waitFor();
 assert.equal(await page.getByRole('button',{name:'Exportar Excel'}).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'Ver expediente',exact:true}).count(),0);
 failEvents=false; allowControl=false;
 const readsBefore = bulkReads;
 await page.reload();
 await page.getByText('El centro de control es exclusivo para administradores.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Exportar Excel'}).count(),0);
 assert.equal(bulkReads,readsBefore,'Non-admin never requests global control data');
 assert.deepEqual(errors,[]);
 console.log('PASS: dashboard, pagination, search, audited review, SLA preservation, outcome/date filters, full Excel and print exports, mobile layout');
} finally {await browser.close();}
