import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import path from 'node:path';
const require=createRequire(path.join(process.argv[2],'package.json'));
const {chromium}=require('playwright');
const baseUrl=process.argv[3]||'http://127.0.0.1:4179/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=user-gesture-required']});
const errors=[];
async function open(mobile=false,muted=false){
  const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:1050}});
  await context.addInitScript(muted=>{
    if(muted)localStorage.setItem('slingshot-sound','off');
    window.__cheer={starts:[],stops:0,ended:0};
    const Native=window.AudioContext||window.webkitAudioContext,create=Native.prototype.createBufferSource;
    Native.prototype.createBufferSource=function(...args){
      const source=create.apply(this,args),start=source.start,stop=source.stop;
      const isCheer=()=>source.buffer?.duration>=1&&source.buffer?.duration<=2;
      source.start=(...args)=>{if(isCheer())window.__cheer.starts.push({duration:source.buffer.duration,feedback:document.querySelector('#feedback strong')?.textContent,state:this.state});return start.apply(source,args);};
      source.stop=(...args)=>{if(isCheer())window.__cheer.stops++;return stop.apply(source,args);};
      source.addEventListener('ended',()=>{if(isCheer())window.__cheer.ended++;});return source;
    };
  },muted);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(baseUrl);
  await page.waitForFunction(()=>document.querySelector('#loading').classList.contains('done'));
  assert.equal((await page.request.get(new URL('assets/human-cheer.wav',baseUrl).href)).status(),200);
  return {context,page,mobile};
}
async function shoot({page,mobile},n){
  await page.waitForFunction(()=>!document.querySelector('#replace').disabled);
  const b=await page.locator('#game').boundingBox(),r=Math.min(b.height*.232,b.width*.348),cy=b.width<340?b.height*.42:b.width<600?b.height*.375:b.height*.351;
  const sy=cy+1.15*r*1.5,max=Math.min(156,b.height*.23,b.width*.30,b.height-sy-42),x=b.x+b.width*.5,y=b.y+sy;
  if(mobile){
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+max*.65}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  }else{
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+max*.65);await page.mouse.up();
  }
  await page.waitForFunction(n=>Number(document.querySelector('#shots').textContent)===n,n);
  if(n<12)assert.equal(await page.evaluate(()=>window.__cheer.starts.length),0);
}
async function fillBoard(session){for(let n=1;n<=12;n++)await shoot(session,n);}
try{
  for(const scenario of [
    {name:'Desktop cheer ends naturally within two seconds',mobile:false,muted:false},
    {name:'Mobile cheer stops when sound is turned off',mobile:true,muted:false,action:'sound'},
    {name:'Restart stops the active cheer',mobile:false,muted:false,action:'restart'},
    {name:'Saved mute shows the message without playing a cheer',mobile:true,muted:true}
  ].filter(scenario=>!process.argv[4]||new RegExp(process.argv[4]).test(scenario.name))){
    const session=await open(scenario.mobile,scenario.muted);await fillBoard(session);
    // Act before inspecting: the short cheer can finish during inspection calls.
    if(scenario.action)await session.page.locator('#'+scenario.action).click();
    const starts=await session.page.evaluate(()=>window.__cheer.starts);
    if(!scenario.action)assert.equal(await session.page.locator('#feedback strong').textContent(),'理解万岁！');
    if(scenario.muted)assert.deepEqual(starts,[]);
    else{
      assert.equal(starts.length,1);assert.equal(starts[0].feedback,'理解万岁！');assert.equal(starts[0].state,'running');assert.ok(starts[0].duration>=1&&starts[0].duration<=2);
      if(scenario.action)assert.equal(await session.page.evaluate(()=>window.__cheer.stops),1);
      else{await session.page.waitForFunction(()=>window.__cheer.ended===1);assert.equal(await session.page.evaluate(()=>window.__cheer.stops),0);}
    }
    console.log(scenario.name);await session.context.close();
  }
  assert.deepEqual(errors,[]);console.log('No JavaScript errors');
}finally{await browser.close();}
