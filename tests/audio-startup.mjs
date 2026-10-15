import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(path.join(process.argv[2],'package.json'));
const backend=process.argv[5]||'chromium';
const api=require(backend==='webkit'?'playwright-core':'playwright');
const baseUrl=process.argv[3]||'http://127.0.0.1:4174/';
const output=process.argv[4]||'/tmp/slingshot-start';mkdirSync(output,{recursive:true});
const browser=await api[backend].launch(backend==='webkit'?{headless:true}:{channel:'chrome',headless:true,args:['--autoplay-policy=user-gesture-required']});
const checks=[],errors=[];
async function open({mobile=true,muted=false,mode='native',reduced=false}={}){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1050},isMobile:mobile,hasTouch:mobile,reducedMotion:reduced?'reduce':'no-preference'});
  await context.addInitScript(({muted,mode})=>{
    if(muted)localStorage.setItem('slingshot-sound','off');
    window.__audio={contexts:[],starts:[],resumes:[],offsets:[]};
    const stats=window.__audio,Native=window.AudioContext||window.webkitAudioContext,resume=Native.prototype.resume;
    window.AudioContext=class extends Native{constructor(...args){super(...args);stats.contexts.push(this);}};
    Native.prototype.resume=function(...args){
      const e=window.event;stats.resumes.push({event:e?.type,target:e?.target?.id,trusted:e?.isTrusted});
      if(mode==='reject'&&!stats.allowResume)return Promise.reject(new Error('Test resume rejection'));
      if(mode==='pending'&&!stats.allowResume)return new Promise(resolve=>{stats.completeResume=()=>{stats.allowResume=true;return resume.apply(this,args).then(resolve);};});
      return resume.apply(this,args);
    };
    for(const [method,kind] of [['createOscillator','oscillator'],['createBufferSource','buffer']]){
      const create=Native.prototype[method];Native.prototype[method]=function(...args){
        const src=create.apply(this,args),start=src.start;src.start=(...args)=>{
          if(src.buffer?.length!==1)stats.starts.push({kind,state:this.state,duration:src.buffer?.duration,when:args[0]});return start.apply(src,args);
        };return src;
      };
    }
    const translate=CanvasRenderingContext2D.prototype.translate;
    CanvasRenderingContext2D.prototype.translate=function(x,y){
      if(this.canvas.id==='game'&&x===0)stats.offsets.push({stage:this.canvas.dataset.intro,y});return translate.call(this,x,y);
    };
  },{muted,mode});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  return {context,page,mobile};
}
async function load({page}){await page.goto(baseUrl);await page.waitForFunction(()=>document.querySelector('#loading').classList.contains('done'));}
async function start({page,mobile}){if(mobile)await page.locator('#start').tap();else await page.locator('#start').click();}
async function entered(page){await page.waitForFunction(()=>document.querySelector('#game').dataset.intro==='playing');}
async function shoot({page,mobile},force=.65){
  await page.waitForFunction(()=>!document.querySelector('#replace').disabled);
  if(!mobile||backend==='webkit'){await page.locator('#game').focus();await page.keyboard.press('Space');return;}
  const b=await page.locator('#game').boundingBox(),r=Math.min(b.height*.232,b.width*.348),cy=b.width<340?b.height*.42:b.width<600?b.height*.375:b.height*.351;
  const sy=cy+1.15*r*1.5,max=Math.min(156,b.height*.23,b.width*.30,b.height-sy-42),x=b.x+b.width*.5,y=b.y+sy;
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+max*force*(force===1?1.08:1)}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
}
async function sounds(page){return page.evaluate(()=>window.__audio.starts);}
async function shot(page,n){await page.waitForFunction(n=>Number(document.querySelector('#shots').textContent)===n,n);}
async function check(name,run){await run();checks.push(name);console.log(name);}
try{
  for(const mobile of [true,false])await check(`${mobile?'Mobile':'Desktop'}: first action is 开始, audio resumes in its trusted click, sling rises before first shot`,async()=>{
    const s=await open({mobile});await load(s);const {page}=s;
    assert.equal(await page.locator('#start').textContent(),'开始');assert.equal(await page.evaluate(()=>window.__audio.contexts.length),0);
    assert.equal(await page.locator('#game').getAttribute('data-intro'),'waiting');assert.equal(await page.locator('#restart').isDisabled(),true);
    await page.locator('#game').dispatchEvent('keydown',{key:'Enter',code:'Enter'});assert.equal(await page.locator('#shots').textContent(),'0');
    await page.screenshot({path:path.join(output,mobile?'mobile-before.png':'desktop-before.png')});
    // No preparatory tap, focus click, or keyboard input before the actual Start tap.
    await start(s);await page.waitForFunction(()=>document.querySelector('#game').dataset.intro==='entering');
    await page.locator('#game').dispatchEvent('keydown',{key:'Enter',code:'Enter'});assert.equal(await page.locator('#shots').textContent(),'0');
    await page.screenshot({path:path.join(output,mobile?'mobile-entering.png':'desktop-entering.png')});
    await entered(page);assert.equal(await page.locator('#start-screen').isHidden(),true);assert.equal(await page.locator('#shots').textContent(),'0');
    assert.ok(await page.evaluate(()=>window.__audio.resumes.some(r=>r.event==='click'&&r.target==='start'&&r.trusted)));
    const offsets=await page.evaluate(()=>window.__audio.offsets.filter(o=>o.stage==='entering').map(o=>o.y));
    assert.ok(offsets.length>=3);assert.ok(offsets[0]>offsets.at(-1));assert.ok(offsets.every((n,i)=>i===0||n<=offsets[i-1]));
    await page.screenshot({path:path.join(output,mobile?'mobile-ready.png':'desktop-ready.png')});
    await shoot(s);await shot(page,1);assert.equal((await sounds(page)).length,2);assert.ok((await sounds(page)).every(s=>s.state==='running'));
    await page.locator('#restart').click();await page.waitForFunction(()=>!document.querySelector('#replace').disabled);assert.equal(await page.locator('#start-screen').isHidden(),true);
    await page.reload();await page.waitForFunction(()=>document.querySelector('#loading').classList.contains('done'));assert.equal(await page.locator('#start').isVisible(),true);await s.context.close();
  });
  await check('Saved mute starts without creating audio; the sound switch restores the next shot',async()=>{
    const s=await open({muted:true});await load(s);await start(s);await entered(s.page);assert.equal(await s.page.evaluate(()=>window.__audio.contexts.length),0);
    await shoot(s);await shot(s.page,1);assert.equal((await sounds(s.page)).length,0);await s.page.locator('#sound').tap();await shoot(s);await shot(s.page,2);assert.equal((await sounds(s.page)).length,2);await s.context.close();
  });
  await check('Pending audio keeps Start visible and blocks play; muting permits silent entry without stale callbacks',async()=>{
    const s=await open({mode:'pending'});await load(s);await start(s);assert.equal(await s.page.locator('#game').getAttribute('data-intro'),'waiting');assert.equal(await s.page.locator('#start').isDisabled(),true);
    await s.page.locator('#start').dispatchEvent('click');assert.equal(await s.page.evaluate(()=>window.__audio.contexts.length),1);await s.page.locator('#game').dispatchEvent('keydown',{key:'Enter',code:'Enter'});assert.equal(await s.page.locator('#shots').textContent(),'0');
    await s.page.locator('#sound').tap();await entered(s.page);await s.page.evaluate(()=>window.__audio.completeResume());assert.equal(await s.page.locator('#game').getAttribute('data-intro'),'playing');assert.equal((await sounds(s.page)).length,0);await s.context.close();
  });
  await check('Rejected audio leaves a retryable Start; retrying its real click enters once',async()=>{
    const s=await open({mode:'reject'});await load(s);await start(s);await s.page.waitForFunction(()=>!document.querySelector('#start').disabled);
    assert.equal(await s.page.locator('#game').getAttribute('data-intro'),'waiting');assert.equal(await s.page.locator('#feedback strong').textContent(),'请再点一次开始');
    await s.page.evaluate(()=>window.__audio.allowResume=true);await start(s);await entered(s.page);assert.equal(await s.page.evaluate(()=>window.__audio.contexts.length),1);await s.context.close();
  });
  await check('Reduced motion uses a short fade without vertical travel',async()=>{
    const s=await open({reduced:true,muted:true});await load(s);await start(s);await entered(s.page);assert.ok(await s.page.evaluate(()=>window.__audio.offsets.filter(o=>o.stage==='entering').every(o=>o.y===0)));await s.context.close();
  });
  if(backend==='chromium')await check('Recording download waits before Start; the first shatter plays the approved clip',async()=>{
    const s=await open();let release;const gate=new Promise(resolve=>release=resolve);await s.page.route('**/shatter-slap.wav*',async route=>{await gate;await route.continue();});
    await s.page.goto(baseUrl);assert.equal(await s.page.locator('#start').isDisabled(),true);release();await s.page.waitForFunction(()=>document.querySelector('#loading').classList.contains('done'));await start(s);await entered(s.page);
    for(let n=1;n<=4;n++){await shoot(s,1);await shot(s.page,n);}assert.equal((await sounds(s.page)).filter(s=>Math.abs(s.duration-.906333)<.005).length,1);await s.context.close();
  });
  assert.deepEqual(errors,[]);writeFileSync(path.join(output,'results.json'),JSON.stringify({backend,url:baseUrl,checks,errors},null,2));
}finally{await browser.close();}
