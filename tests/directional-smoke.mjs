import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(path.join(process.argv[2],'package.json'));
const {chromium}=require('playwright');
const baseUrl=process.argv[3]||'http://127.0.0.1:4173/';
const output=process.argv[4]||'/tmp/slingshot-directions';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
async function ready(page){
  page.on('pageerror',e=>errors.push(e.message));await page.goto(baseUrl);
  await page.waitForFunction(()=>document.querySelector('#loading').classList.contains('done'));await page.waitForTimeout(280);
  await page.locator('#start').click();await page.waitForFunction(()=>document.querySelector('#game').dataset.intro==='playing');
  await page.evaluate(async()=>{
    const script=document.querySelector('script[type=module]').src;
    window.__game=await import(script);window.__physics=await import(new URL('physics.js?v=direction-1',script).href);
  });
}
async function origin(page){
  const b=await page.locator('#game').boundingBox(),r=Math.min(b.height*.232,b.width*.348),cy=b.width<340?b.height*.42:b.width<600?b.height*.375:b.height*.351,sy=cy+1.15*r*1.5;
  return {x:b.x+b.width*.5,y:b.y+sy,max:Math.min(156,b.height*.23,b.width*.30,b.height-sy-42)};
}
async function idle(page){await page.waitForFunction(()=>!document.querySelector('#replace').disabled);}
async function armHit(page,n){
  await page.evaluate(n=>{
    window.__hit=null;const el=document.querySelector('#shots'),observer=new MutationObserver(()=>{
      if(Number(el.textContent)!==n)return;observer.disconnect();const c=document.querySelector('#game');
      window.__hit={x:Number(c.dataset.hitX),y:Number(c.dataset.hitY),score:Number(document.querySelector('#score').textContent),damage:Number(document.querySelector('#replace').dataset.damage),text:document.querySelector('#feedback').textContent};
    });observer.observe(el,{childList:true,subtree:true,characterData:true});
  },n);
}
async function aim(page,cdp,dx,dy){
  await idle(page);const o=await origin(page),factor=Math.hypot(dx,dy)>=1?1.12:1;
  const end={x:o.x+dx*o.max*factor,y:o.y+dy*o.max*factor};
  if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:o.x,y:o.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[end]});}
  else{await page.mouse.move(o.x,o.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});}
  await page.evaluate(()=>window.__trajectoryDots=0);await page.waitForTimeout(130);
  return page.evaluate(()=>{const shot=window.__game.currentShot();return {shot,result:window.__physics.resolveFlight(shot),dots:window.__trajectoryDots};});
}
async function release(page,cdp,n){
  if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();
  await page.waitForFunction(()=>window.__hit!==null);assert.equal(Number(await page.locator('#shots').textContent()),n);
  return page.evaluate(()=>window.__hit);
}
async function screenshot(page,name){await page.screenshot({path:path.join(output,name+'.jpg'),type:'jpeg',quality:82});}
try{
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
    await context.addInitScript(()=>{
      window.__trajectoryDots=0;const arc=CanvasRenderingContext2D.prototype.arc;
      CanvasRenderingContext2D.prototype.arc=function(...a){if(this.canvas.id==='game'&&new Error().stack?.includes('drawTrajectory'))window.__trajectoryDots++;return arc.apply(this,a);};
    });
    const page=await context.newPage();await ready(page);const cdp=mobile?await context.newCDPSession(page):null;
    let shots=0,total=0;
    for(const force of [.65,.7]){
      await armHit(page,++shots);const a=await aim(page,cdp,0,force);assert.equal(a.result.zone,'bull');assert.ok(a.dots>0);
      const hit=await release(page,cdp,shots);total+=50;assert.equal(hit.score,total);assert.equal(hit.text,'特大杯+50');
    }
    checks.push(`${mobile?'Mobile':'Desktop'}: 65–70% hits the bull and keeps the trajectory`);
    for(let sector=0;sector<8;sector++){
      const angle=sector*Math.PI/4,dx=-Math.cos(angle),dy=Math.sin(angle);
      await armHit(page,++shots);const a=await aim(page,cdp,dx,dy);assert.equal(await page.locator('#power-value').textContent(),'100%');assert.equal(a.shot.sector,sector);assert.equal(a.dots,0);assert.equal(a.result.hit,true);
      await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>window.__game.currentShot()),a.shot);assert.equal(await page.evaluate(()=>window.__trajectoryDots),0);
      if(sector===2)await screenshot(page,`${mobile?'mobile':'desktop'}-full-without-trajectory`);
      const hit=await release(page,cdp,shots);assert.ok(Math.abs(hit.x-a.result.position.x)<1e-8&&Math.abs(hit.y-(a.result.position.y-2.6))<1e-8);
      const hitAngle=Math.atan2(hit.y,hit.x),delta=Math.atan2(Math.sin(hitAngle-angle),Math.cos(hitAngle-angle));assert.ok(Math.abs(delta)<=Math.PI/8+1e-8);assert.ok(Math.hypot(hit.x,hit.y)<=.98+1e-8);
      const breaking=sector%4===3,points=breaking?100:a.result.zone==='bull'?50:a.result.zone==='rim'?5:10;total+=points;assert.equal(hit.score,total);assert.equal(hit.damage,sector%4+1);
      if(breaking){assert.equal(hit.text,'罗老师，别这样+100');await idle(page);assert.equal(await page.locator('#replace').getAttribute('data-portrait'),String(Math.floor(sector/4)+1));}
      else{await page.waitForTimeout(180);await screenshot(page,`${mobile?'mobile':'desktop'}-direction-${sector}`);}
    }
    checks.push(`${mobile?'Mobile':'Desktop'}: eight aimed sectors land on their real seeded trajectories, hide the guide, score correctly and shatter on the fourth hit`);
    await armHit(page,++shots);const miss=await aim(page,cdp,.54,.72);assert.equal(miss.result.hit,false);const missed=await release(page,cdp,shots);assert.equal(missed.score,total);assert.equal(await page.locator('#game').getAttribute('data-wall-holes'),'1');
    if(mobile){
      await page.setViewportSize({width:320,height:640});await page.waitForTimeout(100);await armHit(page,++shots);const a=await aim(page,cdp,-Math.SQRT1_2,-Math.SQRT1_2);assert.equal(a.shot.sector,7);assert.equal(a.dots,0);const hit=await release(page,cdp,shots);assert.ok(Math.abs(hit.x-a.result.position.x)<1e-8);assert.equal(await page.evaluate(()=>scrollY),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await screenshot(page,'mobile-small-diagonal');
      checks.push('320px phone: full-power lower-right aiming works without scrolling or overflow');
    }
    await context.close();
  }
  assert.deepEqual(errors,[]);writeFileSync(path.join(output,'results.json'),JSON.stringify({url:baseUrl,checks,errors},null,2));console.log(JSON.stringify({url:baseUrl,checks,errors,output},null,2));
}finally{await browser.close();}
