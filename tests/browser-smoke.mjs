import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Use an available Playwright installation and an isolated temporary browser profile.
const require=createRequire(path.join(process.argv[2],'package.json'));
const {chromium}=require('playwright');
const baseUrl=process.argv[3]||'http://127.0.0.1:4173/';
const output=process.argv[4]||'/tmp/slingshot-qa';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],checks=[];
async function ready(page){
  page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(baseUrl);assert.equal(response.status(),200);
  await page.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('done'));
  assert.equal(await page.locator('.loading').textContent(),'正在挂上靶盘…');
  const img=await page.request.get(new URL('assets/portrait.png',baseUrl).href);assert.equal(img.status(),200);
}
async function origin(page){
  const box=await page.locator('#game').boundingBox();
  const radius=Math.min(box.height*.232,box.width*.348),cy=box.width<340?box.height*.42:box.width<600?box.height*.375:box.height*.351;
  const sy=cy+1.15*radius*1.5;
  return {x:box.x+box.width*.5,y:box.y+sy,max:Math.min(116,box.height*.173,box.width*.28,box.height-sy-40)};
}
async function shoot(page,force=.65,x=0){
  await page.waitForFunction(()=>!document.querySelector('#replace').disabled);
  const o=await origin(page);await page.mouse.move(o.x,o.y);await page.mouse.down();await page.mouse.move(o.x+o.max*x,o.y+o.max*force,{steps:10});await page.mouse.up();
}
async function waitShots(page,n){await page.waitForFunction(n=>Number(document.querySelector('#shots').textContent)===n,n);}
try{
  const context=await browser.newContext({viewport:{width:1440,height:1050}});
  const page=await context.newPage();await ready(page);await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
  checks.push('Desktop and portrait load without login');
  const initial=await origin(page);await page.mouse.click(initial.x+30,initial.y+20);await page.waitForTimeout(120);assert.equal(await page.locator('#shots').textContent(),'0');checks.push('Clicking the sling without dragging does not fire');
  await shoot(page);await waitShots(page,1);assert.equal(await page.locator('#score').textContent(),'50');assert.equal(await page.locator('#darts').textContent(),'1');checks.push('Mouse pull lands in portrait bullseye');
  await page.locator('#replace').click();await page.waitForFunction(()=>!document.querySelector('#replace').disabled);assert.equal(await page.locator('#score').textContent(),'50');assert.equal(await page.locator('#darts').textContent(),'0');checks.push('Manual board replacement preserves score');
  await page.locator('#restart').click();await page.waitForFunction(()=>!document.querySelector('#replace').disabled);assert.equal(await page.locator('#score').textContent(),'0');
  await shoot(page,.1);await waitShots(page,1);assert.equal(await page.locator('#score').textContent(),'0');assert.equal(await page.locator('#darts').textContent(),'0');checks.push('Weak shot misses');
  await shoot(page,.93);await waitShots(page,2);assert.ok((await page.locator('#feedback').textContent()).includes('打碎'));await page.screenshot({path:path.join(output,'shattered.png')});
  assert.equal(await page.locator('#replace').isDisabled(),true);await page.waitForFunction(()=>!document.querySelector('#replace').disabled);assert.equal(await page.locator('#darts').textContent(),'0');assert.equal(await page.locator('#score').textContent(),'10');checks.push('Strong shot shatters and auto-replaces board');
  await shoot(page,.6,.8);await waitShots(page,3);assert.equal(await page.locator('#darts').textContent(),'0');assert.equal(await page.locator('#score').textContent(),'10');checks.push('Full-force off-board miss does not shatter');
  await page.locator('#restart').click();
  for(let i=1;i<=12;i++){await shoot(page,.65);await waitShots(page,i);if(i===11){assert.equal(await page.locator('#darts').textContent(),'11');assert.equal(await page.locator('#replace').isDisabled(),false);await page.screenshot({path:path.join(output,'eleven-darts.png')});}}
  assert.ok((await page.locator('#feedback').textContent()).includes('12支'));await page.screenshot({path:path.join(output,'dropped.png')});await page.waitForFunction(()=>!document.querySelector('#replace').disabled);assert.equal(await page.locator('#darts').textContent(),'0');assert.equal(await page.locator('#score').textContent(),'600');checks.push('12th normal shot drops board; score survives automatic replacement');
  // Cancellation and restart during flight must not add a stale result.
  const o=await origin(page);await page.mouse.move(o.x,o.y);await page.mouse.down();await page.mouse.move(o.x,o.y+o.max*.6);await page.locator('#game').dispatchEvent('pointercancel',{pointerId:1,isPrimary:true});await page.mouse.up();assert.equal(await page.locator('#shots').textContent(),'12');
  await shoot(page);await page.locator('#restart').click();await page.waitForTimeout(900);assert.equal(await page.locator('#shots').textContent(),'0');assert.equal(await page.locator('#score').textContent(),'0');checks.push('Cancellation and restart clear active flight safely');
  await page.locator('#game').focus();await page.keyboard.press('Space');await waitShots(page,1);assert.equal(await page.locator('#score').textContent(),'50');checks.push('Keyboard input works');
  await page.keyboard.press('Space');await page.keyboard.press('Space');await page.keyboard.press('Space');await waitShots(page,2);await page.waitForTimeout(200);assert.equal(await page.locator('#shots').textContent(),'2');checks.push('Repeated input during flight does not duplicate shots');
  await page.locator('#sound').click();assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'false');await page.reload();await page.waitForFunction(()=>document.querySelector('#loading').classList.contains('done'));assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'false');checks.push('Sound preference survives reload');
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});const mp=await mobile.newPage();await ready(mp);await mp.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
  assert.equal(await mp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const mo=await origin(mp),cdp=await mobile.newCDPSession(mp);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:mo.x,y:mo.y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mo.x,y:mo.y+mo.max*.65}]});
  assert.ok(Number(await mp.locator('#power-value').textContent().then(t=>t.replace('%','')))>=64);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await waitShots(mp,1);assert.equal(await mp.locator('#score').textContent(),'50');assert.equal(await mp.evaluate(()=>scrollY),0);checks.push('Mobile touch drag hits and does not scroll');
  const o2=await origin(mp);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:o2.x,y:o2.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:o2.x,y:o2.y+60}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await mp.locator('#power-value').textContent(),'0%');assert.equal(await mp.locator('#shots').textContent(),'1');checks.push('Touch cancellation does not shoot');
  await mp.setViewportSize({width:320,height:640});assert.equal(await mp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await mp.screenshot({path:path.join(output,'mobile-small.png'),fullPage:true});checks.push('320px mobile layout fits');
  const small=await origin(mp);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:small.x,y:small.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:small.x,y:small.y+small.max*.93}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await waitShots(mp,2);assert.ok((await mp.locator('#feedback').textContent()).includes('打碎'));await mp.waitForFunction(()=>!document.querySelector('#replace').disabled);checks.push('Small mobile full-power pull shatters and resets normally');
  assert.deepEqual(errors,[]);checks.push('No JavaScript errors');
  writeFileSync(path.join(output,'results.json'),JSON.stringify({url:baseUrl,checks,errors},null,2));console.log(JSON.stringify({url:baseUrl,checks,errors,output},null,2));
}finally{await browser.close();}
