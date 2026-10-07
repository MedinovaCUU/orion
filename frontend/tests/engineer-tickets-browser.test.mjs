import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 await page.clock.install({time:new Date('2026-10-07T18:00:00Z')});
 let fail=false;let reads=0;
 const t={id:'case-a',asunto:'Falla de lectura BA200',estado:'abierto',creado_en:'2026-10-05T08:00:00Z',descripcion:'Reporte operativo',numero_caso:'CASO-123',numero_serie_equipo:'832000706',user_id:'c'};
 await page.route('**/rest/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  let data=[];
  if(path.endsWith('/ticket_assignments')) {reads++;if(fail) {await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Unavailable'})});return;}data=[{ticket_id:'case-a',assigned_to:'a'}];}
  if(path.endsWith('/tickets')) data=[t];
  if(path.endsWith('/ticket_service_events')) data=[{id:'event-1',ticket_id:'case-a',kind:'respuesta',detail:'Diagnóstico registrado; esperando refacción.',actor_id:'a',occurred_at:'2026-10-06T18:00:00Z'}];
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('http://127.0.0.1:5200/orion/tests/fixtures/live-planning.html');
 await page.getByRole('button',{name:'Pantalla completa',exact:true}).click();
 const card=page.locator('article').filter({has:page.getByRole('heading',{name:'Alfredo Acevedo',exact:true})});
 await card.getByText('Falla de lectura BA200',{exact:true}).waitFor();
 await card.getByLabel('Asignado, respuesta registrada, cierre pendiente').waitFor();
 await card.getByText('Diagnóstico registrado; esperando refacción.',{exact:true}).waitFor();
 assert.equal(await page.locator('article').filter({has:page.getByRole('heading',{name:'Hector Cortes',exact:true})}).getByText('Falla de lectura BA200',{exact:true}).count(),0);
 await page.screenshot({path:'/tmp/intelligent-board-tickets.png',animations:'disabled'});
 await page.clock.runFor(7100);
 await card.locator('.engineer-wall__destination').filter({hasText:'Atoyac'}).waitFor();
 await page.screenshot({path:'/tmp/intelligent-board.png',animations:'disabled'});
 fail=true;
 await page.clock.runFor(31000);
 await page.getByText('Tickets sin actualizar',{exact:false}).waitFor();
 assert.ok(reads>=2);
 await page.getByLabel('Área del equipo').selectOption('Ingeniería');
 await card.waitFor();
 // Stored ticket data remains available during a failed refresh.
 assert.ok(await page.locator('.engineer-wall__workload').getByText('1 tickets',{exact:true}).count());
 console.log('PASS: assignment by profile ID, recorded progress, automatic ticket/visit alternation, refresh failure preserves last data.');
} finally {await browser.close();}
