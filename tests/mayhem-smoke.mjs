import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(path.join(process.argv[2],'package.json')),{chromium,webkit}=require('playwright');
const baseUrl=process.argv[3]||'http://127.0.0.1:4185/',output=process.argv[4]||'/tmp/slingshot-mayhem',backend=process.argv[5]||'chromium';mkdirSync(output,{recursive:true});
const browser=await (backend==='webkit'?webkit:chromium).launch(backend==='webkit'?{headless:true,...(process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH}:{})}:{channel:'chrome',headless:true,args:['--autoplay-policy=user-gesture-required']}),errors=[],checks=[];
async function open({mobile=false,reduced=false,width=mobile?390:1440,height=mobile?844:1050,muted=false}={}){
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,reducedMotion:reduced?'reduce':'no-preference'});
  await context.addInitScript(muted=>{
    if(muted)localStorage.setItem('slingshot-sound','off');
    window.__qa={vibrations:[],starts:0,stops:0};Object.defineProperty(navigator,'vibrate',{value:value=>{window.__qa.vibrations.push(value);return true;},configurable:true});
    const Native=window.AudioContext||window.webkitAudioContext;
    for(const method of ['createBufferSource','createOscillator']){const create=Native.prototype[method];Native.prototype[method]=function(...args){const source=create.apply(this,args),start=source.start,stop=source.stop;source.start=(...args)=>{if(source.buffer?.length!==1)window.__qa.starts++;return start.apply(source,args);};source.stop=(...args)=>{window.__qa.stops++;return stop.apply(source,args);};return source;};}
  },muted);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(baseUrl);await page.waitForFunction(()=>document.querySelector('#loading').classList.contains('done'));
  await page.locator('#start').click();await page.waitForFunction(()=>document.querySelector('#game').dataset.intro==='playing');return {context,page,mobile};
}
async function idle(page){await page.waitForFunction(()=>document.querySelector('#game').dataset.phase==='ready');}
async function geometry(page){return page.evaluate(()=>{
  const c=document.querySelector('#game'),b=c.getBoundingClientRect(),r=Math.min(b.height*.232,b.width*.348),cy=b.width<340?b.height*.42:b.width<600?b.height*.375:b.height*.351,sy=cy+1.15*r*1.5;
  return {left:b.x,top:b.y,width:b.width,height:b.height,r,scale:Number(c.dataset.boardScale),x:b.x+Number(c.dataset.boardX),y:b.y+Number(c.dataset.boardY),rotation:Number(c.dataset.boardRotation),s:Math.min(1,Math.max(.72,b.width/650)),sx:b.x+b.width/2,sy:b.y+sy,max:Math.min(156,b.height*.23,b.width*.30,b.height-sy-42),ropeX:b.x+b.width/2,ropeY:b.y+cy-r-22};
});}
async function pointFor(page,id){
  const selector={sound:'#sound',score:'.scoreboard',restart:'#restart',replace:'#replace',brand:'.brand',logo:'.brand-mark',title:'.brand h1',power:'.power-panel'}[id];
  if(selector){const b=await page.locator(selector).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};}
  if(id==='board'&&await page.locator('#game').getAttribute('data-board-state')==='whole'){
    await page.waitForFunction(()=>document.querySelector('#game').dataset.boardLanded==='true');await snapshot(page,`whole-board-width-${page.viewportSize().width}`);
  }
  const g=await geometry(page);
  if(id==='rope')return {x:g.ropeX,y:g.ropeY};
  if(id==='sling')return {x:g.sx,y:g.sy+60*g.s};
  // Use the exposed upper-right face; on narrow screens the sling covers the lower-left.
  if(id==='board')return {x:g.x+(.6*Math.cos(g.rotation)+.25*Math.sin(g.rotation))*g.r*g.scale,y:g.y+(.6*Math.sin(g.rotation)-.25*Math.cos(g.rotation))*g.r*g.scale};
  return {x:g.left+18,y:g.top+g.height*.49};
}
async function tap(session,p){if(session.mobile)await session.page.touchscreen.tap(p.x,p.y);else await session.page.mouse.click(p.x,p.y);}
async function strike(session,id){const p=await pointFor(session.page,id);await tap(session,p);await session.page.waitForTimeout(25);if(id==='sling'){await tap(session,p);await session.page.waitForTimeout(25);}return p;}
async function snapshot(page,name){await page.screenshot({path:path.join(output,`${backend}-${name}.png`),fullPage:true});}
async function unlock(s){const g=await geometry(s.page);await tap(s,{x:g.x,y:g.y});try{await s.page.locator('#hammer-reward').waitFor({state:'visible',timeout:3000});}catch(error){console.error(await s.page.locator('#game').evaluate(el=>({...el.dataset,active:document.activeElement?.id})));await snapshot(s.page,'unlock-failed');throw error;}await s.page.waitForTimeout(80);assert.equal(await s.page.locator('#game').getAttribute('data-mode'),'normal');await s.page.locator('#hammer-reward').click();await s.page.waitForFunction(()=>document.querySelector('#game').dataset.mode==='hammer');await s.page.waitForTimeout(350);}
async function shoot(page,force=1){await idle(page);const n=Number(await page.locator('#shots').textContent())+1,g=await geometry(page);await page.mouse.move(g.sx,g.sy);await page.mouse.down();await page.mouse.move(g.sx,g.sy+g.max*force*(force===1?1.08:1),{steps:4});await page.mouse.up();await page.waitForFunction(n=>Number(document.querySelector('#shots').textContent)===n,n);}
async function fling(page){
  await idle(page);const g=await geometry(page);
  if(backend==='chromium'){
    // Explicit input timestamps keep a fast gesture fast even on a busy test host.
    const input=await page.context().newCDPSession(page),time=Date.now()/1000;
    await input.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:g.x,y:g.y,timestamp:time});
    await input.send('Input.dispatchMouseEvent',{type:'mousePressed',x:g.x,y:g.y,button:'left',buttons:1,clickCount:1,timestamp:time+.001});
    await input.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:g.x+g.r*.8,y:g.y,buttons:1,timestamp:time+.021});
    await input.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:g.x+g.r*.8,y:g.y,button:'left',buttons:0,clickCount:1,timestamp:time+.025});await input.detach();
  }else{await page.mouse.move(g.x,g.y);await page.mouse.down();await page.mouse.move(g.x+g.r*.8,g.y);await page.mouse.up();}
  await page.waitForFunction(()=>document.querySelector('#game').dataset.phase==='destroying',{},{timeout:5000});await idle(page);
}
async function check(name,fn){if(process.argv[6]&&!new RegExp(process.argv[6]).test(name))return;await fn();checks.push(name);console.log(name);}
try{
  await check('100% holds one short vibration; render jitter never changes the shot; reduced motion disables haptics',async()=>{
    for(const reduced of [false,true]){
      const s=await open({reduced}),{page}=s,g=await geometry(page);await page.mouse.move(g.sx,g.sy);await page.mouse.down();await page.mouse.move(g.sx,g.sy+g.max*.99);assert.equal(await page.locator('#power-value').textContent(),'99%');assert.deepEqual(await page.evaluate(()=>window.__qa.vibrations),[]);
      await page.mouse.move(g.sx,g.sy+g.max*1.1);assert.equal(await page.locator('#power-value').textContent(),'100%');
      const before=await page.evaluate(async()=>{window.__game=await import(document.querySelector('script[type=module]').src);return window.__game.currentShot();});await page.waitForTimeout(200);assert.deepEqual(await page.evaluate(()=>window.__game.currentShot()),before);assert.deepEqual(await page.evaluate(()=>window.__qa.vibrations),reduced?[]:[18]);if(!reduced)await snapshot(page,'full-power');await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await page.locator('#shots').textContent(),'0');await s.context.close();
    }
  });
  await check('Manual swinging lasts three round trips; the fourth board waits for six valid hits instead of a timer',async()=>{
    const s=await open(),{page}=s;let g=await geometry(page);await page.mouse.move(g.x,g.y);await page.mouse.down();for(let i=1;i<=5;i++){await page.mouse.move(g.x+i*5,g.y);await page.waitForTimeout(55);}await page.mouse.up();assert.equal(await page.locator('#hammer-reward').isHidden(),true);assert.equal(await page.locator('#game').getAttribute('data-swing-tier'),'0');assert.equal(await page.locator('#shots').textContent(),'0');
    await page.waitForTimeout(5400);const manualPositions=[];for(let i=0;i<7;i++){manualPositions.push((await geometry(page)).x);await page.waitForTimeout(120);}assert.ok(Math.max(...manualPositions)-Math.min(...manualPositions)>1,'Manual motion must still be visible after three round trips');
    await page.locator('#restart').click();await idle(page);
    for(let tier=1;tier<=3;tier++){await fling(page);assert.equal(await page.locator('#game').getAttribute('data-swing-tier'),String(tier));if(tier===1){await page.locator('#replace').click();await idle(page);assert.equal(await page.locator('#game').getAttribute('data-swing-tier'),'1');}}
    await snapshot(page,'swing-fourth');await page.waitForTimeout(6500);assert.equal(await page.locator('#game').getAttribute('data-swing-tier'),'3');assert.equal(await page.locator('#game').getAttribute('data-phase'),'ready');assert.equal(await page.locator('#score').textContent(),'0');
    await shoot(page,.2);assert.equal(await page.locator('#darts').textContent(),'0');
    for(let hit=1;hit<=5;hit++){await shoot(page,.65);assert.equal(await page.locator('#darts').textContent(),String(hit));assert.equal(await page.locator('#game').getAttribute('data-swing-tier'),'3');assert.equal(await page.locator('#game').getAttribute('data-phase'),'ready');}
    const before=Number(await page.locator('#score').textContent());await shoot(page,.65);assert.equal(await page.locator('#game').getAttribute('data-swing-tier'),'0');assert.equal(await page.locator('#game').getAttribute('data-phase'),'destroying');assert.ok(Number(await page.locator('#score').textContent())>before);assert.doesNotMatch(await page.locator('body').textContent(),/靶盘溜了|瞄准，发射！|往后拉出力度/);
    await idle(page);assert.equal(await page.locator('#darts').textContent(),'0');const a=await geometry(page);await page.waitForTimeout(150);const b=await geometry(page);assert.ok(Math.abs(a.x-b.x)<.01);await s.context.close();
  });
  await check('A moving target can dodge a dart already in flight; cancelling the board drag never unlocks or flings',async()=>{
    const s=await open(),{page}=s,g=await geometry(page);
    await page.mouse.move(g.sx,g.sy);await page.mouse.down();await page.mouse.move(g.sx,g.sy+g.max*.65);await page.mouse.up();assert.equal(await page.locator('#game').getAttribute('data-phase'),'flying');
    await page.mouse.move(g.x,g.y);await page.mouse.down();await page.mouse.move(g.x+g.r*3,g.y);
    await page.waitForFunction(()=>document.querySelector('#shots').textContent==='1');assert.equal(await page.locator('#score').textContent(),'0');assert.equal(await page.locator('#feedback strong').textContent(),'差一点');assert.equal(await page.locator('#replace').getAttribute('data-damage'),'0');
    await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await page.locator('#game').getAttribute('data-swing-tier'),'0');assert.equal(await page.locator('#hammer-reward').isHidden(),true);
    await page.locator('#restart').click();await idle(page);await shoot(page,.65);assert.equal(await page.locator('#score').textContent(),'50');await s.context.close();
  });
  for(const config of [{name:'desktop',mobile:false,order:['board','rope','brand','sound','score','power','restart','replace','sling']},{name:'mobile',mobile:true,order:['brand','restart','score','rope','sound','sling','power','replace','board']},{name:'small-reduced',mobile:true,width:320,height:640,reduced:true,muted:true,order:['rope','board','sling','replace','restart','power','score','brand','sound']}]){
    await check(`${config.name}: whole-board drop, combined branding, nine objects and full restoration`,async()=>{
      const s=await open(config),{page}=s;
      assert.equal(await page.locator('.guide').count(),0);const soundBefore=await page.locator('#sound').getAttribute('aria-pressed');await unlock(s);await snapshot(page,`${config.name}-hammer`);
      assert.equal(await page.locator('#hammer-cursor').isVisible(),true);
      let expected=0,frozen=false,startsAfterMute=null;
      for(let i=0;i<config.order.length;i++){
        const id=config.order[i];if(frozen)await page.waitForTimeout(20);await strike(s,id);
        if(!frozen)expected+=id==='board'||id==='sling'?80:['rope','sound','brand'].includes(id)?666:40;
        assert.equal(await page.locator('#score').textContent(),String(expected),`${config.name}: ${id}`);assert.ok((await page.locator('#game').getAttribute('data-broken')).split(',').includes(id),`Missing ${id}`);
        if(id==='score'){frozen=true;assert.equal(await page.locator('#game').getAttribute('data-score-frozen'),'true');}
        if(id==='power')assert.equal(await page.locator('#power-value').textContent(),'100%');
        if(id==='sound'){startsAfterMute=await page.evaluate(()=>window.__qa.starts);assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'false');}
        if(['sound','restart'].includes(id)){const bounds=await page.locator(`#${id}>.surface-cracks`).last().boundingBox();assert.ok(bounds.width<200&&bounds.height<100,'Cracks must stay anchored to the small control, not scale across the page');}
        if(startsAfterMute!==null)assert.equal(await page.evaluate(()=>window.__qa.starts),startsAfterMute);
        if(['rope','brand','restart','replace'].includes(id))await page.waitForTimeout(id==='brand'?(config.reduced?250:1250):config.reduced?150:580);
        if(id==='rope'){assert.equal(await page.locator('#game').getAttribute('data-board-state'),'whole');assert.equal(await page.locator('#game').getAttribute('data-fragment-count'),'0');}
        if(id==='brand'){assert.equal(await page.locator('.brand').evaluate(el=>el.classList.contains('object-fallen')),false);const r=await page.locator('.brand h1').boundingBox();assert.ok(r.y<120);assert.ok(await page.locator('.brand-mark').evaluate(el=>Math.min(innerHeight,document.querySelector('.arena').getBoundingClientRect().bottom)-el.getBoundingClientRect().bottom<50));}
        if(id==='brand')assert.equal(await page.locator('.brand h1').evaluate(el=>el.classList.contains('title-hanging')),true);
        if(['restart','replace'].includes(id)&&!config.mobile){await page.mouse.move(5,5);const off=await page.locator('#'+id).evaluate(el=>getComputedStyle(el).backgroundColor);await page.locator('#'+id).hover();assert.equal(await page.locator('#'+id).evaluate(el=>getComputedStyle(el).backgroundColor),off);}
        if(id==='restart')await snapshot(page,`${config.name}-damaged`);
        if(i===0&&config.name==='desktop'){await strike(s,'background');expected+=40;assert.equal(await page.locator('#score').textContent(),String(expected));assert.equal((await page.locator('#game').getAttribute('data-broken')).split(',').length,1);}
        if(id==='rope'&&config.name==='desktop'){await strike(s,'board');expected+=80;assert.equal(await page.locator('#score').textContent(),String(expected));}
        if(frozen&&i<config.order.length-1){await strike(s,'background');assert.equal(await page.locator('#score').textContent(),String(expected));}
      }
      if(config.name==='desktop')await snapshot(page,'hammer-breaking');
      assert.equal(await page.locator('#hammer-cursor').isHidden(),true);await page.locator('#coffee-screen').waitFor({state:'visible'});await snapshot(page,`${config.name}-coffee`);assert.equal(await page.locator('.guide').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.locator('#coffee-reset').click();await idle(page);assert.equal(await page.locator('#game').getAttribute('data-mode'),'normal');assert.equal(await page.locator('#score').textContent(),'0');assert.equal(await page.locator('#game').getAttribute('data-swing-tier'),'0');assert.equal(await page.locator('#game').getAttribute('data-broken'),'');assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),soundBefore);assert.equal(await page.locator('.is-broken').count(),0);assert.equal(await page.locator('.surface-cracks').count(),0);assert.equal(await page.locator('.guide').count(),0);
      assert.equal(await page.locator('#game').getAttribute('data-fragment-count'),'0');assert.equal(await page.locator('#game').getAttribute('data-board-strikes'),'0');assert.equal(await page.locator('.title-hanging').count(),0);assert.equal(await page.locator('.logo-falling').count(),0);
      await page.locator('#game').focus();await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('#shots').textContent==='1');assert.equal(await page.locator('#score').textContent(),'50');await s.context.close();
    });
  }
  await check('Original full-power shatter still works and starts the first moving board',async()=>{
    const s=await open();for(let i=1;i<=4;i++){await shoot(s.page);assert.equal(await s.page.locator('#shots').textContent(),String(i));}assert.equal(await s.page.locator('#feedback strong').textContent(),'罗老师，别这样');await idle(s.page);assert.equal(await s.page.locator('#game').getAttribute('data-swing-tier'),'1');await s.context.close();
  });
  await check('Fourth-stage full-power hits still shatter early before the six-hit escape',async()=>{
    const s=await open(),{page}=s;for(let i=0;i<3;i++)await fling(page);
    let shattered=false;
    for(let attempt=0;attempt<16;attempt++){
      const before=Number(await page.locator('#score').textContent());await shoot(page,1);
      if(Number(await page.locator('#replace').getAttribute('data-damage'))===4){
        assert.equal(await page.locator('#darts').textContent(),'4');assert.equal(await page.locator('#feedback strong').textContent(),'罗老师，别这样');assert.equal(Number(await page.locator('#score').textContent()),before+100);assert.equal(await page.locator('#game').getAttribute('data-swing-tier'),'0');shattered=true;break;
      }
      assert.equal(await page.locator('#game').getAttribute('data-swing-tier'),'3');
    }
    assert.equal(shattered,true);await s.context.close();
  });
  await check('Ten hammer hits leave the hanging board intact; rope rules and coffee reset still work with frozen scoring',async()=>{
    for(const config of [{name:'desktop'},{name:'mobile',mobile:true},{name:'small-frozen',mobile:true,width:320,height:640,reduced:true,frozen:true}]){
      const s=await open(config),{page}=s;await unlock(s);if(config.frozen)await strike(s,'score');
      for(let i=1;i<=10;i++){
        await strike(s,'board');assert.equal(await page.locator('#game').getAttribute('data-board-strikes'),String(i));
        assert.equal(await page.locator('#score').textContent(),String(config.frozen?40:i*80));
        assert.equal(await page.locator('#game').getAttribute('data-board-state'),'hanging');
      }
      await page.waitForTimeout(150);assert.equal(await page.locator('#game').getAttribute('data-board-state'),'hanging');await snapshot(page,`ten-hits-${config.name}`);
      await strike(s,'rope');
      await page.waitForFunction(()=>document.querySelector('#game').dataset.boardState==='shattered');
      await page.waitForFunction(()=>document.querySelector('#game').dataset.fragmentCount==='0');
      const before=Number(await page.locator('#score').textContent()),g=await geometry(page);await tap(s,{x:g.x,y:g.y});
      assert.equal(await page.locator('#score').textContent(),String(before+(config.frozen?0:40)));assert.equal(await page.locator('#game').getAttribute('data-board-strikes'),'10');
      for(const id of ['sound','score','restart','replace','brand','power','sling']){
        if(config.frozen&&id==='score')continue;
        await strike(s,id);if(id==='brand')await page.waitForTimeout(config.reduced?250:1250);
      }
      await page.locator('#coffee-screen').waitFor({state:'visible'});await page.locator('#coffee-reset').click();await idle(page);
      assert.equal(await page.locator('#game').getAttribute('data-board-strikes'),'0');assert.equal(await page.locator('#game').getAttribute('data-board-state'),'hanging');
      await s.context.close();
    }
  });
  await check('Rope and nail use actual hammer counts; whole boards survive the fall, then shatter once; landed fragments are removed',async()=>{
    for(const config of [{hits:0,nail:true},{hits:4},{hits:9},{hits:10,nail:true},{hits:11,mobile:true},{hits:10,frozen:true,reduced:true}]){
      const s=await open(config),{page}=s;await unlock(s);const g=await geometry(page),portrait=await page.locator('#replace').getAttribute('data-portrait');
      if(config.frozen)await strike(s,'score');
      for(let i=0;i<config.hits;i++)await strike(s,'board');
      assert.equal(await page.locator('#game').getAttribute('data-board-strikes'),String(config.hits));
      await tap(s,{x:g.ropeX,y:g.ropeY-(config.nail?18:0)});
      await page.waitForFunction(()=>document.querySelector('#game').dataset.broken.split(',').includes('rope'));
      await page.waitForFunction(expected=>document.querySelector('#game').dataset.boardState===expected,config.hits>=10?'shattered':'whole');
      assert.equal(await page.locator('#game').getAttribute('data-board-state'),config.hits>=10?'shattered':'whole');
      if(config.hits<10){
        await page.waitForFunction(()=>document.querySelector('#game').dataset.boardLanded==='true');await page.waitForTimeout(250);
        assert.equal(await page.locator('#game').getAttribute('data-board-state'),'whole');assert.equal(await page.locator('#game').getAttribute('data-fragment-count'),'0');
        await snapshot(page,`whole-board-${config.hits}`);
        const before=Number(await page.locator('#score').textContent());await strike(s,'board');
        assert.equal(await page.locator('#game').getAttribute('data-board-strikes'),String(config.hits+1));assert.equal(Number(await page.locator('#score').textContent()),before+80);
      }
      await page.waitForFunction(()=>{const d=document.querySelector('#game').dataset;return d.boardState==='shattered'&&d.fragmentCount==='0';});
      await page.waitForTimeout(300);assert.equal(await page.locator('#game').getAttribute('data-fragment-count'),'0');
      const before=Number(await page.locator('#score').textContent()),hits=await page.locator('#game').getAttribute('data-board-strikes');
      await tap(s,{x:g.x,y:g.y});assert.equal(Number(await page.locator('#score').textContent()),before+(config.frozen?0:40));assert.equal(await page.locator('#game').getAttribute('data-board-strikes'),hits);
      assert.equal(await page.locator('#replace').getAttribute('data-portrait'),portrait);assert.equal(await page.locator('#game').getAttribute('data-mode'),'hammer');
      await snapshot(page,`cleared-fragments-${config.hits}${config.frozen?'-frozen':''}`);await s.context.close();
    }
  });
  await check('Either part of the brand triggers the logo fall and hanging title together',async()=>{
    const s=await open(),{page}=s;await unlock(s);await strike(s,'logo');
    const samples=await page.locator('.brand-mark').evaluate(async el=>{
      const animation=el.getAnimations()[0];animation.pause();
      const duration=animation.effect.getTiming().duration,at=async fraction=>{animation.currentTime=duration*fraction;await new Promise(requestAnimationFrame);const m=new DOMMatrix(getComputedStyle(el).transform);return {x:m.e,y:m.f};};
      const samples=[];for(const t of [.02,.195,.39,.585,.78,.89,1])samples.push(await at(t));animation.finish();return samples;
    });
    assert.ok(samples[0].y<0,'The initial impact lifts the icon');
    const [a,b,c]=samples.slice(1,4);assert.ok(c.y-b.y>b.y-a.y+10,'Gravity accelerates the fall');assert.ok(Math.abs((c.x-b.x)-(b.x-a.x))<1,'Horizontal speed stays constant');
    assert.ok(samples[5].y<samples[4].y-10,'The icon bounces upward after reaching the floor');assert.ok(Math.abs(samples[6].y-samples[4].y)<1,'The bounce lands at the same floor');
    assert.ok(await page.locator('.brand-mark').evaluate(el=>Math.min(innerHeight,document.querySelector('.arena').getBoundingClientRect().bottom)-el.getBoundingClientRect().bottom<50));
    assert.equal(await page.locator('.brand h1').evaluate(el=>el.classList.contains('title-hanging')),true);assert.deepEqual((await page.locator('#game').getAttribute('data-broken')).split(','),['brand']);
    await snapshot(page,'logo-hit-breaks-both');await s.context.close();
    const titleSession=await open();await unlock(titleSession);await strike(titleSession,'title');assert.equal(await titleSession.page.locator('.brand-mark').evaluate(el=>el.classList.contains('logo-falling')),true);assert.equal(await titleSession.page.locator('.brand h1').evaluate(el=>el.classList.contains('title-hanging')),true);await snapshot(titleSession.page,'title-hit-breaks-both');await titleSession.context.close();
  });
  assert.deepEqual(errors,[]);writeFileSync(path.join(output,`${backend}-results.json`),JSON.stringify({checks,errors},null,2));
}catch(error){console.error(JSON.stringify({checks,errors}));throw error;}finally{await browser.close();}
