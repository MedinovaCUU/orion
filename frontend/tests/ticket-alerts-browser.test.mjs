import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const FIXTURE_URL = process.env.TICKET_ALERTS_URL || 'http://127.0.0.1:5198/orion/tests/fixtures/ticket-alerts.html';
const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console', message => { if (message.type()==='error' && /Maximum update depth/.test(message.text())) errors.push(message.text()); });
let assigned=true;let reads=0;
const countPlays=()=>{
 window.__played=0;window.__sources=[];
 HTMLMediaElement.prototype.play=function(){if(!this.muted&&this.volume>0){window.__played++;window.__sources.push(this.src.split('/').pop());}return Promise.resolve();};
 HTMLMediaElement.prototype.pause=function(){};
};
const fulfillAssignments=async route=>{
 reads++;
 const own = new URL(route.request().url()).searchParams.get('assigned_to')==='eq.alfredo';
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(own&&assigned?[{ticket_id:'alfredo-ticket'}]:[])});
};
await page.addInitScript(countPlays);
await page.route('**/rest/v1/ticket_assignments*',fulfillAssignments);
try{
 await page.goto(FIXTURE_URL);
 await page.waitForResponse(r=>r.url().includes('/ticket_assignments'));
 assert.equal(await page.getByRole('alertdialog').count(),0);
 assert.equal(await page.evaluate(()=>window.__played),0,'Francisco gets no alarm for another owner');
 await page.getByRole('button',{name:'Sesión Alfredo'}).click();
 await page.getByRole('alertdialog').waitFor();
 assert.match(await page.getByRole('alertdialog').innerText(),/alfredo-ticket/);
 assert.doesNotMatch(await page.getByRole('alertdialog').innerText(),/unassigned-ticket/);
 // The countdown re-renders the parent every second; the clip must not be restarted on each tick.
 await page.waitForTimeout(2600);
 assert.deepEqual(await page.evaluate(()=>window.__sources),['alarm.mp3'],'alarm clip plays once while the countdown ticks');
 // Supabase re-emits SIGNED_IN / TOKEN_REFRESHED for the same user; the open alarm must survive it.
 await page.getByRole('button',{name:'Refrescar sesión'}).evaluate(button=>button.click());
 await page.waitForResponse(r=>r.url().includes('/ticket_assignments'));
 await page.waitForTimeout(500);
 assert.equal(await page.getByRole('alertdialog').count(),1,'same-user auth event keeps the overlay');
 assert.deepEqual(await page.evaluate(()=>window.__sources),['alarm.mp3'],'same-user auth event does not replay the clip');
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
 // Safari gets the same recorded MP3 clips, not a separate synthetic-beep path.
 assigned=true;
 const safari=await browser.newContext({userAgent:SAFARI_UA});
 const safariPage=await safari.newPage();
 safariPage.on('pageerror',e=>errors.push(e.message));
 await safariPage.addInitScript(()=>{Object.defineProperty(navigator,'vendor',{get:()=>'Apple Computer, Inc.'});});
 await safariPage.addInitScript(countPlays);
 await safariPage.route('**/rest/v1/ticket_assignments*',fulfillAssignments);
 await safariPage.goto(FIXTURE_URL);
 await safariPage.getByRole('button',{name:'Sesión Alfredo'}).click();
 await safariPage.getByRole('alertdialog').waitFor();
 await safariPage.waitForTimeout(2600);
 assert.deepEqual(await safariPage.evaluate(()=>window.__sources),['alarm.mp3'],'Safari plays the MP3 clip once');
 await safari.close();
 assert.deepEqual(errors,[]);
 console.log('PASS: unassigned Francisco receives no alarm, assignee receives own alarm once despite countdown ticks and same-user auth events, session switch clears overlay/audio, thresholds isolated per user, revoked assignment silent, Safari plays MP3');
}finally{await browser.close();}
