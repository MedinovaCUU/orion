import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
 for (const [width,height] of [[1920,1080],[1366,768],[1280,720],[1024,768],[390,844]]) {
  const page = await browser.newPage({viewport:{width,height}});
  await page.goto('http://127.0.0.1:5200/orion/tests/fixtures/live-planning.html');
  await page.getByRole('button',{name:'Pantalla completa',exact:true}).click();
  await page.waitForFunction(()=>{const grid=document.querySelector('.engineer-wall__grid');return grid && getComputedStyle(grid).getPropertyValue('--wall-columns').trim()!=='';});
  await page.waitForTimeout(150);
  const dimensions=await page.locator('.engineer-wall').evaluate(root=>({width:root.clientWidth,height:root.clientHeight,scrollWidth:root.scrollWidth,scrollHeight:root.scrollHeight, cards:[...root.querySelectorAll('.engineer-wall__card')].map(card=>({height:card.clientHeight,scrollHeight:card.scrollHeight,bottom:card.getBoundingClientRect().bottom})),footer:root.querySelector('footer').getBoundingClientRect().bottom}));
  assert.ok(dimensions.scrollHeight<=dimensions.height+1,`${width}x${height} vertical overflow`);
  assert.ok(dimensions.scrollWidth<=dimensions.width+1,`${width}x${height} horizontal overflow`);
  assert.ok(dimensions.footer<=height,`${width}x${height} footer outside viewport`);
  for(const card of dimensions.cards) assert.ok(card.scrollHeight<=card.height+1,`${width}x${height} clipped card: ${JSON.stringify(card)}`);
  const seen=new Set();
  for(let i=0;i<10;i++){
   for(const name of await page.locator('.engineer-wall__card h3').allTextContents()) seen.add(name);
   const next=page.getByRole('button',{name:'Siguiente',exact:true});
   if(await next.isDisabled()) break;
   await next.click();
  }
  assert.equal(seen.size,9,`${width}x${height}: all engineers and chemists reachable`);
  if(width===1366) await page.screenshot({path:'/tmp/planning-wall-fit-1366.png'});
  console.log(`PASS ${width}x${height}: no scrolling or clipped cards; entire roster reachable`);
  await page.close();
 }
} finally {await browser.close();}
