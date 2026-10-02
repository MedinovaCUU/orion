import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 await page.clock.install({time:new Date('2026-10-02T18:00:00Z')});
 await page.goto('http://127.0.0.1:5200/orion/tests/fixtures/live-planning.html?carousel');
 await page.getByRole('button',{name:'Pantalla completa',exact:true}).click();
 const alfredo=page.locator('article').filter({has:page.getByRole('heading',{name:'Alfredo Acevedo',exact:true})});
 await alfredo.getByText('PRÓXIMO SERVICIO',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:/Ver agenda/}).count(),0);
 assert.equal(await page.getByText('Laboratorio del Norte',{exact:true}).count(),0);
 assert.equal(await page.getByText('Semana terminada',{exact:true}).count(),0);
 assert.equal(await alfredo.getByText('Agenda 1 / 1',{exact:true}).count(),1);
 await page.getByLabel('Área del equipo').selectOption('Química / Aplicaciones');
 const ivonne=page.locator('article').filter({has:page.getByRole('heading',{name:'Ivonne Jaramillo',exact:true})});
 const seen=new Set();
 for(let i=0;i<12;i++) {
  seen.add(await ivonne.locator('.engineer-wall__destination').innerText());
  await page.clock.runFor(7100);
 }
 assert.equal(seen.size,12,'All twelve pending services display without clicking or scrolling');
 const background=await page.locator('.engineer-wall').evaluate(el=>getComputedStyle(el).backgroundColor);
 assert.equal(background,'rgb(234, 241, 246)');
 await page.screenshot({path:'/tmp/orion-agenda-carousel.png',animations:'disabled'});
 console.log('PASS: next-service fallback, twelve automatic agenda slides, ORION theme, no agenda click required');
} finally {await browser.close();}
