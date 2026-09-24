import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
let assigned=true;let reads=0;
await page.addInitScript(()=>{
 window.__played=0;
 HTMLMediaElement.prototype.play=function(){if(!this.muted&&this.volume>0)window.__played++;return Promise.resolve();};
 HTMLMediaElement.prototype.pause=function(){};
});
await page.route('**/rest/v1/ticket_assignments*',async route=>{
 reads++;
 const own = new URL(route.request().url()).searchParams.get('assigned_to')==='eq.alfredo';
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(own&&assigned?[{ticket_id:'alfredo-ticket'}]:[])});
});
try{
 await page.goto('http://127.0.0.1:5198/orion/tests/fixtures/ticket-alerts.html');
 await page.waitForResponse(r=>r.url().includes('/ticket_assignments'));
 assert.equal(await page.getByRole('alertdialog').count(),0);
 assert.equal(await page.evaluate(()=>window.__played),0,'Francisco gets no alarm for another owner');
 await page.getByRole('button',{name:'Sesión Alfredo'}).click();
 await page.getByRole('alertdialog').waitFor();
 assert.match(await page.getByRole('alertdialog').innerText(),/alfredo-ticket/);
 assert.doesNotMatch(await page.getByRole('alertdialog').innerText(),/unassigned-ticket/);
 // Use DOM click to simulate a session change while the critical overlay is open.
 await page.getByRole('button',{name:'Sesión Francisco'}).evaluate(button=>button.click());
 await page.getByRole('alertdialog').waitFor({state:'detached'});
 const count=await page.evaluate(()=>window.__played);
 await page.getByRole('button',{name:'Actualizar asignación'}).click();
 await page.waitForResponse(r=>r.url().includes('/ticket_assignments'));
 assert.equal(await page.evaluate(()=>window.__played),count);
 assert.ok(await page.evaluate(()=>Object.keys(sessionStorage).some(k=>k==='orion-falcon-sla-thresholds-v1:alfredo')));
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('orion-falcon-sla-thresholds-v1:francisco')),null);
 assigned=false;
 await page.getByRole('button',{name:'Sesión Alfredo'}).click();
 await page.waitForResponse(r=>r.url().includes('/ticket_assignments'));
 assert.equal(await page.getByRole('alertdialog').count(),0);
 assert.ok(reads>=4);
 assert.deepEqual(errors,[]);
 console.log('PASS: unassigned Francisco receives no alarm, assignee receives own alarm, session switch clears overlay/audio, thresholds isolated per user, revoked assignment silent');
}finally{await browser.close();}
