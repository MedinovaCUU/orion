import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext();const page=await context.newPage();
 const token='a'.repeat(64);let answered=false,authRequests=0,submits=0;
 await page.route('**/auth/v1/**',route=>{authRequests++;return route.abort();});
 await page.route('**/rest/v1/rpc/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1);
  const body=route.request().postDataJSON();assert.equal(body.p_token,token);
  const authorization=route.request().headers().authorization||'';
  const jwt=authorization.replace(/^Bearer /,'');
  assert.equal(JSON.parse(Buffer.from(jwt.split('.')[1],'base64url').toString()).role,'anon');
  if(name==='get_ticket_satisfaction')await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({case_number:'OR-TEST',specialist_name:'Especialista de prueba',answered,is_test:true})});
  else {assert.equal(name,'submit_ticket_satisfaction');submits++;answered=true;await route.fulfill({status:200,contentType:'application/json',body:'null'});}
 });
 await page.goto(`http://127.0.0.1:5200/orion/encuesta#${token}`);
 await page.getByText('No necesitas una cuenta',{exact:false}).waitFor();
 await page.locator('input[name=satisfaction][value="5"]').check();await page.locator('input[name=speed][value="4"]').check();await page.locator('input[name=resolution][value=total]').check();await page.locator('input[name=clarity][value="5"]').check();await page.locator('input[name=improvement][value=none]').check();
 await page.getByRole('button',{name:'Enviar evaluación'}).click();await page.getByRole('heading',{name:'Gracias por tu evaluación'}).waitFor();
 await page.reload();await page.getByRole('heading',{name:'Gracias por tu evaluación'}).waitFor();
 assert.equal(submits,1);assert.equal(authRequests,0);
 await page.goto('http://127.0.0.1:5200/orion/encuesta#invalid');await page.getByRole('alert').filter({hasText:'no es válido'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Enviar evaluación'}).count(),0);
 console.log('PASS: clean browser without account, anonymous read/submit, answered reload, invalid links and zero login requests.');
}finally{await browser.close();}
