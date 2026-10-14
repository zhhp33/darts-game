import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const require=createRequire(path.join(process.argv[2],'package.json'));
const {chromium}=require('playwright');
const baseUrl=process.argv[3]||'http://127.0.0.1:4173/';
const output=process.argv[4]||'/tmp/slingshot-audio-qa';
const beforeSource=process.argv[5]||null;
const before=!!beforeSource;
const originalGame=before?readFileSync(beforeSource,'utf8'):null;
const beforeMode=process.argv[6]||'touch-release';
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=user-gesture-required']});
const checks=[],errors=[];

async function open(mode='normal',muted=false){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(({mode,muted})=>{
    if(muted)localStorage.setItem('slingshot-sound','off');
    window.__audio={contexts:[],starts:[],resumes:[],event:'',released:false,forced:null,outputEnabled:false};
    const stats=window.__audio,Native=window.AudioContext||window.webkitAudioContext;
    for(const type of ['pointerdown','pointerup','touchstart','touchmove','touchend','click','keydown'])document.addEventListener(type,()=>{
      stats.event=type;if(type==='pointerup'||type==='touchend')stats.released=true;
    },{capture:true});
    window.AudioContext=class extends Native{
      constructor(...args){super(...args);stats.contexts.push(this);this.waiters=[];this.delayed=false;this.unlocked=false;}
      get state(){
        if(stats.forced)return stats.forced;
        if(mode==='safari-drag'&&!this.unlocked)return 'suspended';
        if(mode==='touch-release'&&!this.unlocked)return 'suspended';
        if(mode==='delayed'&&!this.delayed)return 'suspended';
        if(mode==='pending'&&!this.delayed)return 'suspended';
        return super.state;
      }
      resume(){
        stats.resumes.push(stats.event);
        if(mode==='safari-drag'&&!stats.outputEnabled&&stats.event!=='click')return new Promise(resolve=>this.waiters.push(resolve));
        if(mode==='touch-release'&&!stats.released)return new Promise(resolve=>this.waiters.push(resolve));
        const run=()=>{stats.forced=null;return super.resume().then(()=>{this.delayed=true;this.unlocked=true;for(const resolve of this.waiters)resolve();this.waiters=[];});};
        if(mode==='pending'&&!this.delayed){
          stats.completeResume=run;
          return new Promise(resolve=>this.waiters.push(resolve));
        }
        return mode==='delayed'&&!this.delayed?new Promise(resolve=>setTimeout(()=>resolve(run()),120)):run();
      }
    };
    for(const [method,kind] of [['createOscillator','oscillator'],['createBufferSource','buffer']]){
      const original=Native.prototype[method];Native.prototype[method]=function(...args){
        const src=original.apply(this,args),start=src.start;
        src.start=(...a)=>{
          const silent=kind==='buffer'&&src.buffer?.length===1;
          if(silent&&stats.event==='touchstart')stats.outputEnabled=true;
          stats.starts.push({kind,state:this.state,when:a[0],duration:src.buffer?.duration,silent,event:stats.event,at:performance.now()});return start.apply(src,a);
        };return src;
      };
    }
  },{mode,muted});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  if(before)await page.route('**/game.js*',route=>route.fulfill({contentType:'text/javascript',body:originalGame}));
  return {context,page};
}
async function ready(page){await page.goto(baseUrl,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#loading').classList.contains('done'));}
async function touchShot(page,force=.65){
  await page.waitForFunction(()=>!document.querySelector('#replace').disabled);
  const b=await page.locator('#game').boundingBox(),r=Math.min(b.height*.232,b.width*.348),cy=b.width<340?b.height*.42:b.width<600?b.height*.375:b.height*.351;
  const sy=cy+1.15*r*1.5,max=Math.min(156,b.height*.23,b.width*.30,b.height-sy-42),x=b.x+b.width*.5,y=b.y+sy;
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+max*force*(force===1?1.08:1)}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
}
async function starts(page){return page.evaluate(()=>window.__audio.starts.filter(s=>!s.silent));}
async function waitShot(page,n){await page.waitForFunction(n=>Number(document.querySelector('#shots').textContent)===n,n);}
async function check(name,fn){await fn();checks.push(name);console.log(name);}

try{
  await check(before?'Original mobile startup: first throw is silent, later throw plays':'Mobile audio requiring finger release: first throw plays release and impact',async()=>{
    const {context,page}=await open(before?beforeMode:'touch-release');await ready(page);await touchShot(page);await waitShot(page,1);
    const sounds=await starts(page);
    if(before){
      assert.equal(sounds.length,0);
      if(beforeMode==='safari-drag'){await page.locator('#sound').tap();await page.locator('#sound').tap();}
      await touchShot(page);await waitShot(page,2);assert.equal((await starts(page)).length,2);
      checks.push(beforeMode==='safari-drag'?'Previous release reproduced: dragging stays silent; toggling the sound button enables audio':'Original code reproduced: ALL first-touch sounds are missing; later touch restores audio');
    }
    else{assert.equal(sounds.length,2);assert.ok(sounds.every(s=>s.state==='running'));assert.ok((await page.evaluate(()=>window.__audio.resumes)).some(e=>e==='pointerup'||e==='touchend'));}
    await context.close();
  });
  if(before){writeFileSync(path.join(output,'results.json'),JSON.stringify({baseUrl,checks,errors},null,2));process.exitCode=0;}
  else{
    await check('Safari drag restriction: first drag enables output on touchstart without toggling sound',async()=>{
      const {context,page}=await open('safari-drag');await ready(page);
      assert.equal(await page.evaluate(()=>window.__audio.contexts.length),0);
      assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'true');
      await touchShot(page);await waitShot(page,1);assert.equal((await starts(page)).length,2);
      assert.ok(await page.evaluate(()=>window.__audio.starts.some(s=>s.silent&&s.event==='touchstart')));
      assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'true');await context.close();
    });
    await check('Slow resume: first keyboard release waits instead of being dropped',async()=>{
      const {context,page}=await open('delayed');await ready(page);await page.locator('#game').focus();await page.keyboard.press('Space');await waitShot(page,1);
      assert.equal((await starts(page)).length,2);await context.close();
    });
    await check('Interrupted mobile audio resumes on the next touch',async()=>{
      const {context,page}=await open();await ready(page);await touchShot(page);await waitShot(page,1);
      await page.evaluate(async()=>{await window.__audio.contexts[0].suspend();window.__audio.forced='interrupted';window.__audio.starts=[];});
      await touchShot(page);await waitShot(page,2);assert.equal((await starts(page)).length,2);await context.close();
    });
    await check('Slow recording download: playable board waits; first shatter plays the approved three-slap clip once',async()=>{
      const {context,page}=await open();let release;const gate=new Promise(resolve=>release=resolve);
      await page.route('**/shatter-slap.wav*',async route=>{await gate;await route.continue();});
      await page.goto(baseUrl,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>performance.getEntriesByType('resource').filter(e=>/portrait-(classic-square|interview|caricature)\.png/.test(e.name)).length===3);
      assert.equal(await page.locator('#loading').evaluate(el=>el.classList.contains('done')),false);
      assert.equal(await page.locator('#replace').isDisabled(),true);release();await page.waitForFunction(()=>document.querySelector('#loading').classList.contains('done'));
      for(let i=1;i<=4;i++){await touchShot(page,1);await waitShot(page,i);}
      const slaps=(await starts(page)).filter(s=>s.kind==='buffer'&&Math.abs(s.duration-.906333)<.005);
      assert.equal(slaps.length,1);assert.equal(slaps[0].state,'running');await context.close();
    });
    await check('Failed recording request retries on a later interaction',async()=>{
      const {context,page}=await open();let requests=0;
      await page.route('**/shatter-slap.wav*',route=>++requests===1?route.fulfill({status:503,body:'unavailable'}):route.continue());
      await ready(page);for(let i=1;i<=4;i++){await touchShot(page,1);await waitShot(page,i);}
      assert.equal(requests,2);assert.equal((await starts(page)).filter(s=>Math.abs(s.duration-.906333)<.005).length,1);await context.close();
    });
    await check('Saved mute stays silent; re-enabling sound restores the next shot',async()=>{
      const {context,page}=await open('normal',true);await ready(page);await touchShot(page);await waitShot(page,1);assert.equal((await starts(page)).length,0);
      await page.locator('#sound').tap();await touchShot(page);await waitShot(page,2);assert.equal((await starts(page)).length,2);await context.close();
    });
    await check('Muting or restarting during resume cancels pending sounds',async()=>{
      for(const action of ['sound','restart']){
        // Hold resume until after cancellation; a 120ms timer can finish before
        // Playwright's real touch/click, which would test an already-played sound.
        const {context,page}=await open('pending');await ready(page);await page.locator('#game').focus();await page.keyboard.press('Space');
        assert.equal((await starts(page)).length,0);await page.locator('#'+action).tap();
        await page.evaluate(()=>window.__audio.completeResume());
        await page.waitForTimeout(200);assert.equal((await starts(page)).length,0);await context.close();
      }
    });
    assert.deepEqual(errors,[]);writeFileSync(path.join(output,'results.json'),JSON.stringify({baseUrl,checks,errors},null,2));
  }
}finally{await browser.close();}
