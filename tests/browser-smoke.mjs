import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
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
  assert.doesNotMatch(await page.locator('#feedback').textContent(),/未加载/);
  for(const asset of ['portrait.png','portrait-interview.png','portrait-caricature.png']){const img=await page.request.get(new URL('assets/'+asset,baseUrl).href);assert.equal(img.status(),200);}
  assert.doesNotMatch(await page.locator('.board-counter').textContent(),/12|\//);
  assert.equal(await page.locator('.counter-ticks').count(),0);
}
async function origin(page){
  const box=await page.locator('#game').boundingBox(),radius=Math.min(box.height*.232,box.width*.348),cy=box.width<340?box.height*.42:box.width<600?box.height*.375:box.height*.351,sy=cy+1.15*radius*1.5;
  return {x:box.x+box.width*.5,y:box.y+sy,max:Math.min(156,box.height*.23,box.width*.30,box.height-sy-42)};
}
async function shoot(page,force=.65,x=0){
  await page.waitForFunction(()=>!document.querySelector('#replace').disabled);const o=await origin(page);await page.mouse.move(o.x,o.y);await page.mouse.down();await page.mouse.move(o.x+o.max*x,o.y+o.max*force/3,{steps:10});await page.mouse.up();
}
async function snap(page,name,fullPage=false){await page.screenshot({path:path.join(output,name.replace(/\.png$/,'.jpg')),type:'jpeg',quality:82,fullPage,timeout:60000});}
async function armImpactCapture(page){await page.evaluate(()=>{window.__impactFrames=[];const feedback=document.querySelector('#feedback'),observer=new MutationObserver(()=>{if(!feedback.textContent.includes('啪！'))return;observer.disconnect();let frames=0;const capture=()=>{frames++;if([6,18,30].includes(frames))window.__impactFrames.push(document.querySelector('#game').toDataURL('image/jpeg',.86));if(frames<30)requestAnimationFrame(capture);};requestAnimationFrame(capture);});observer.observe(feedback,{childList:true,subtree:true});});}
async function saveImpactCapture(page){await page.waitForFunction(()=>window.__impactFrames?.length===3);const frames=await page.evaluate(()=>window.__impactFrames);for(let i=0;i<frames.length;i++)writeFileSync(path.join(output,['shattered-start.jpg','shattered.jpg','shattered-late.jpg'][i]),Buffer.from(frames[i].split(',')[1],'base64'));}
async function waitShots(page,n){await page.waitForFunction(n=>Number(document.querySelector('#shots').textContent)===n,n);}
async function reset(page){await page.locator('#restart').click();await page.waitForFunction(()=>!document.querySelector('#replace').disabled);}
try{
  const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage();await ready(page);await snap(page,'desktop.png',true);checks.push('All portrait assets load anonymously; counter only shows current count');
  const initial=await origin(page);await page.mouse.click(initial.x+30,initial.y+20);await page.waitForTimeout(120);assert.equal(await page.locator('#shots').textContent(),'0');
  await shoot(page);await waitShots(page,1);assert.equal(await page.locator('#score').textContent(),'50');assert.match(await page.locator('#feedback').textContent(),/特大杯！/);checks.push('Bullseye scores 50 and says 特大杯！');
  for(let i=1;i<=3;i++){await page.locator('#replace').click();await page.waitForFunction(()=>!document.querySelector('#replace').disabled);assert.equal(await page.locator('#replace').getAttribute('data-portrait'),String(i%3));assert.equal(await page.locator('#score').textContent(),'50');assert.equal(await page.locator('#darts').textContent(),'0');await snap(page,'portrait-'+(i%3)+'.png',true);}checks.push('Change board cycles three portrait styles and preserves score');
  await reset(page);await shoot(page,.2);await waitShots(page,1);assert.equal(await page.locator('#score').textContent(),'0');checks.push('Weak shot still lands short');
  await shoot(page,.5);await waitShots(page,2);assert.equal(await page.locator('#score').textContent(),'10');assert.match(await page.locator('#feedback').textContent(),/大杯！/);await snap(page,'weak-dart.png');checks.push('Inner face scores 10 and says 大杯！; weak dart droops');
  await shoot(page,.65,.25);await waitShots(page,3);assert.equal(await page.locator('#score').textContent(),'15');assert.match(await page.locator('#feedback').textContent(),/中杯！/);checks.push('Red outer frame scores 5 and says 中杯！');
  await shoot(page);await waitShots(page,4);assert.equal(await page.locator('#score').textContent(),'65');await snap(page,'firm-dart.png');checks.push('Over 60% dart inserts rigidly');
  await reset(page);await shoot(page,2.99);await waitShots(page,1);assert.equal(await page.locator('#replace').isDisabled(),false);assert.equal(await page.locator('#darts').textContent(),'1');assert.doesNotMatch(await page.locator('#feedback').textContent(),/啪！/);checks.push('299% does not shatter');
  await armImpactCapture(page);const full=await origin(page);await page.mouse.move(full.x,full.y);await page.mouse.down();await page.mouse.move(full.x,full.y+full.max*2,{steps:10});assert.equal(await page.locator('#power-value').textContent(),'300%');await snap(page,'full-pull.png',true);await page.mouse.up();await waitShots(page,2);
  assert.match(await page.locator('#feedback').textContent(),/啪！别这样，罗老师/);assert.doesNotMatch(await page.locator('#feedback').textContent(),/轰|这一发/);assert.equal(await page.locator('#replace').isDisabled(),true);await saveImpactCapture(page);await page.waitForFunction(()=>!document.querySelector('#replace').disabled);assert.equal(await page.locator('#darts').textContent(),'0');assert.equal(await page.locator('#score').textContent(),'100');checks.push('300% and captured overdrag stay bounded; impact shatters, bounces and resets');
  await shoot(page,2.4,.6);await waitShots(page,3);assert.equal(await page.locator('#darts').textContent(),'0');assert.equal(await page.locator('#score').textContent(),'100');checks.push('Maximum power off-board miss does not shatter');
  await reset(page);for(let i=1;i<=12;i++){await shoot(page);await waitShots(page,i);if(i===11){assert.equal(await page.locator('#darts').textContent(),'11');await snap(page,'eleven-darts.png');}}
  assert.doesNotMatch(await page.locator('#feedback').textContent(),/挂不住|12支|12枝|掉落/);await page.waitForFunction(()=>!document.querySelector('#replace').disabled);assert.equal(await page.locator('#score').textContent(),'600');assert.equal(await page.locator('#darts').textContent(),'0');checks.push('Accumulated darts still drop; old drop messages removed');
  const o=await origin(page);await page.mouse.move(o.x,o.y);await page.mouse.down();await page.mouse.move(o.x,o.y+o.max*.2);await page.locator('#game').dispatchEvent('pointercancel',{pointerId:1,isPrimary:true});await page.mouse.up();assert.equal(await page.locator('#shots').textContent(),'12');
  await shoot(page);await page.locator('#restart').click();await page.waitForTimeout(900);assert.equal(await page.locator('#shots').textContent(),'0');checks.push('Cancellation and restart do not add stale shots');
  await page.locator('#game').focus();await page.keyboard.press('Space');await waitShots(page,1);assert.equal(await page.locator('#score').textContent(),'50');await page.keyboard.press('Space');await page.keyboard.press('Space');await page.keyboard.press('Space');await waitShots(page,2);await page.waitForTimeout(200);assert.equal(await page.locator('#shots').textContent(),'2');checks.push('Keyboard works and repeated firing is blocked');
  await page.locator('#sound').click();await page.reload();await page.waitForFunction(()=>document.querySelector('#loading').classList.contains('done'));assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'false');checks.push('Sound setting persists');
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}),mp=await mobile.newPage();await ready(mp);await snap(mp,'mobile.png',true);assert.equal(await mp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const mo=await origin(mp),cdp=await mobile.newCDPSession(mp);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:mo.x,y:mo.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mo.x,y:mo.y+mo.max*.65/3}]});assert.ok(parseInt(await mp.locator('#power-value').textContent(),10)>=64);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await waitShots(mp,1);assert.equal(await mp.locator('#score').textContent(),'50');assert.equal(await mp.evaluate(()=>scrollY),0);checks.push('Mobile touch fires at 65% without scrolling');
  const o2=await origin(mp);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:o2.x,y:o2.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:o2.x,y:o2.y+30}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await mp.locator('#power-value').textContent(),'0%');assert.equal(await mp.locator('#shots').textContent(),'1');checks.push('Touch cancel does not shoot');
  await mp.setViewportSize({width:320,height:640});await mp.waitForTimeout(100);assert.equal(await mp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await snap(mp,'mobile-small.png',true);
  const small=await origin(mp);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:small.x,y:small.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:small.x,y:small.y+small.max}]});assert.equal(await mp.locator('#power-value').textContent(),'300%');await snap(mp,'mobile-full-pull.png');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await waitShots(mp,2);assert.match(await mp.locator('#feedback').textContent(),/啪！别这样，罗老师/);await mp.waitForFunction(()=>!document.querySelector('#replace').disabled);checks.push('320px screen fits and supports 300% within the green scene');
  assert.deepEqual(errors,[]);checks.push('No JavaScript errors');writeFileSync(path.join(output,'results.json'),JSON.stringify({url:baseUrl,checks,errors},null,2));console.log(JSON.stringify({url:baseUrl,checks,errors,output},null,2));
}catch(error){console.error(JSON.stringify({checks,errors}));throw error;}finally{await browser.close();}
