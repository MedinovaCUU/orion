import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:5200/orion/tests/fixtures/guard-swap.html');
 const card=page.locator('.planning-guards__weekend-card').first();
 const original=await card.locator('.planning-guards__slot--ingenieria strong').innerText();
 await card.getByRole('button',{name:'Editar guardia'}).click();
 const select=card.locator('select').nth(1);
 await select.waitFor();
 const values=await select.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value));
 await select.selectOption(values.find(v=>v!==original));
 const incoming=await select.inputValue();
 const target=card.locator('select').nth(2);
 await target.waitFor();
 const targetDate=await target.inputValue();
 assert.ok(targetDate);
 await card.getByText('Ambas guardias se guardarán juntas.',{exact:false}).waitFor();
 await card.getByRole('button',{name:'Guardar permuta'}).click();
 const saved=JSON.parse(await page.getByTestId('saved').innerText());
 assert.equal(Object.keys(saved).length,2);
 assert.equal(saved[targetDate].ingenieria,original);
 assert.ok(Object.values(saved).some(v=>v.ingenieria===incoming));
 console.log('PASS: single save updates both guard assignments in browser.');
}finally{await browser.close();}
