import {CONFIG,clamp,makeShot,positionAt,resolveFlight,createGameState,applyResult,replaceBoard,constrainPull} from './physics.js?v=swing-six-hits-2';
import {makeFragments,makeImpactCracks,makeSurfaceCracks,fallingFragmentPose} from './fracture.js?v=varied-cracks-2';
import {SWING,createBoardMotion,sampleMotion,releaseBoard,boardPose,poseInWorld,localPoint,shouldFling,motionIsActive,advanceSwingTier} from './motion.js?v=2';
import {BREAKABLES,createMayhemState,strikeMayhem,ropeFallMode} from './mayhem.js?v=brand-ten-1';
import {createMayhemView} from './mayhem-view.js?v=brand-ten-1';
import {createDamageStamp,createDamageLayer} from './damage-view.js?v=4';
import {slingPartPoses} from './sling-motion.js?v=2';

const canvas=document.querySelector('#game');
const ctx=canvas.getContext('2d',{alpha:false});
const arena=canvas.closest('.arena');
const ui=Object.fromEntries(['score','shots','accuracy','darts','ticks','feedback','power-value','power-fill','power-hint','pull-hint','replace','restart','sound','loading','start','start-screen'].map(id=>[id,document.getElementById(id)]));
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const entranceDuration=reducedMotion?.12:.75;
let intro='waiting',entranceAt=0,startPending=false,startAttempt=0,startTimer=null;
let state=createGameState(),width=0,height=0,view=null,pull={dx:0,dy:0},pointerId=null,pointerStart=null;
let aimSeed=0;
const aimDirections=['右','右上','上','左上','左','左下','下','右下'];
let flight=null,effect=null,particles=[],clock=0,lastFrame=performance.now(),feedbackUntil=0,shakeUntil=0,replaceUntil=0,reboundAt=-10;
let loaded=false,soundEnabled=true,audio=null;
let slapBuffer=null,slapDecode=null,audioResume=null,soundEpoch=0,audioUnlocked=false;
let slapData=null;
let cheerBuffer=null,cheerDecode=null,cheerSource=null;
let needsRedraw=true,backgroundReady=false;
let motion=createBoardMotion(),boardPointer=null,fullBuzzed=false,mayhem=createMayhemState();
const boardHammerDamage=createDamageLayer();
let slingHammerCracks=[],hammerShatter=null,hammerFall=null,endingAt=0,hammerSeed=500,hammerLayoutUntil=0,slingBreak=null;
const activeSounds=new Set();let outputGain=null;
const mayhemView=createMayhemView({reducedMotion,onStrike:hammerStrike,onCollect:collectHammer,onReset:resetMayhem,onCancel:()=>{needsRedraw=true;}});
let wallHoles=[];
for(let i=0;i<CONFIG.dartLimit;i++)ui.ticks.append(document.createElement('i'));
try{soundEnabled=localStorage.getItem('slingshot-sound')!=='off';}catch{}
try{const saved=JSON.parse(localStorage.getItem('slingshot-wall-holes')||'[]');if(Array.isArray(saved))wallHoles=saved.filter(h=>Number.isFinite(h.x)&&Number.isFinite(h.y)&&Number.isFinite(h.seed)&&h.size>0&&h.size<.2);}catch{}
const portraitStyles=[
  {name:'经典头像',file:'portrait-classic-square.png'},
  {name:'访谈头像',file:'portrait-interview.png'},
  {name:'大头头像',file:'portrait-caricature.png'}
];
const portraits=portraitStyles.map(()=>new Image());
let portraitIndex=0;
const board=document.createElement('canvas');board.width=board.height=1024;
const grain=document.createElement('canvas');grain.width=grain.height=256;
const background=document.createElement('canvas');
let wallPattern;

function randomGenerator(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function circle(g,x,y,r,fill){g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fillStyle=fill;g.fill();}
function ring(g,inner,outer,a,b,fill){g.beginPath();g.arc(0,0,outer,a,b);g.arc(0,0,inner,b,a,true);g.closePath();g.fillStyle=fill;g.fill();}
function line(g,x1,y1,x2,y2,color,lineWidth){g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.strokeStyle=color;g.lineWidth=lineWidth;g.stroke();}

function buildTextures(){
  needsRedraw=true;
  const g=board.getContext('2d');g.clearRect(0,0,1024,1024);g.setTransform(480,0,0,480,512,512);
  circle(g,0,.022,1,'#8b3024');
  const rim=g.createRadialGradient(-.38,-.48,.05,.15,.25,1.35);
  rim.addColorStop(0,'#f4714c');rim.addColorStop(.52,'#e75837');rim.addColorStop(.86,'#c94029');rim.addColorStop(1,'#a83125');
  circle(g,0,0,1,rim);
  g.beginPath();g.arc(0,0,.974,Math.PI*.98,Math.PI*1.89);g.strokeStyle='#ffac7c88';g.lineWidth=.012;g.stroke();
  g.beginPath();g.arc(0,0,.987,0,Math.PI*.85);g.strokeStyle='#96301e66';g.lineWidth=.012;g.stroke();
  g.shadowColor='#6d2418';g.shadowBlur=10;circle(g,0,.009,.675,'#191d18');g.shadowBlur=0;
  const face=g.createRadialGradient(-.28,-.25,.03,.05,.15,.78);face.addColorStop(0,'#383b30');face.addColorStop(1,'#161c17');circle(g,0,0,.665,face);
  for(let i=0;i<20;i++){
    const a=-Math.PI/2-Math.PI/20+i*Math.PI/10,b=a+Math.PI/10;
    const cream=i%2===1;
    ring(g,.294,.567,a,b,cream?'#d5c59a':'#282d23');
    ring(g,.535,.563,a,b,cream?'#54764e':'#af4c37');
    ring(g,.287,.312,a,b,cream?'#598054':'#a14b38');
    line(g,Math.cos(a)*.286,Math.sin(a)*.286,Math.cos(a)*.569,Math.sin(a)*.569,'#c3bd9577',.002);
  }
  circle(g,0,0,.273,'#242a23');
  g.save();g.beginPath();g.arc(0,0,CONFIG.bullRadius,0,Math.PI*2);g.clip();
  const portrait=portraits[portraitIndex];
  if(portrait.complete&&portrait.naturalWidth){
    const scale=.49/Math.max(portrait.naturalWidth,portrait.naturalHeight),w=portrait.naturalWidth*scale,h=portrait.naturalHeight*scale;
    g.drawImage(portrait,-w/2,-h/2,w,h);g.fillStyle='#6b55210e';g.fillRect(-.26,-.26,.52,.52);
  }
  else{g.fillStyle='#4c5141';g.fillRect(-.25,-.25,.5,.5);}
  g.restore();g.beginPath();g.arc(0,0,.255,0,Math.PI*2);g.strokeStyle='#141911';g.lineWidth=.009;g.stroke();
  const rnd=randomGenerator(1957);
  for(let i=0;i<7500;i++){
    const x=rnd()*2-1,y=rnd()*2-1,d=Math.hypot(x,y);if(d>.987)continue;
    const alpha=d>.68?.025+rnd()*.05:.035+rnd()*.12;
    circle(g,x,y,.0008+rnd()*.003,`rgba(${rnd()>.5?'255,241,198':'15,25,16'},${alpha})`);
  }
  for(let i=0;i<150;i++){
    const x=rnd()*1.28-.64,y=rnd()*1.28-.64;if(Math.hypot(x,y)>.65)continue;
    line(g,x,y,x+(rnd()-.5)*.022,y+(rnd()-.5)*.025,'#d4d0ab23',.0012);
  }
  g.setTransform(1,0,0,1,0,0);
  const n=grain.getContext('2d'),data=n.createImageData(256,256);
  for(let i=0;i<data.data.length;i+=4){const tone=rnd()>.5?255:0;data.data[i]=data.data[i+1]=data.data[i+2]=tone;data.data[i+3]=Math.floor(rnd()*13);}
  n.putImageData(data,0,0);wallPattern=ctx.createPattern(grain,'repeat');
}

function resize(){
  needsRedraw=true;backgroundReady=false;
  if(state.phase==='aiming')cancelAim();
  cancelBoardPointer();
  const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;
  const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  const radius=Math.min(height*.232,width*.348);
  const cy=width<340?height*.42:width<600?height*.375:height*.351;
  view={cx:width*.5,cy,radius,maxPull:Math.min(156,height*.23,width*.30),slingScale:clamp(width/650,.72,1)};
  const origin=project({x:0,y:1.45,z:0});view.sx=origin.x;view.sy=origin.y;view.maxPull=Math.min(view.maxPull,height-view.sy-42);
  ui['start-screen'].style.setProperty('--start-y',`${view.sy}px`);
  ui.feedback.style.top=`${cy+radius*.96}px`;
}
function project(p){const scale=24/(16+p.z);return {x:view.cx+p.x*view.radius*scale,y:view.cy-(p.y-CONFIG.boardY)*view.radius*scale,scale};}

function drawBackground(){
  if(backgroundReady){ctx.drawImage(background,0,0,width,height);return;}
  const wash=ctx.createLinearGradient(0,0,width,height);wash.addColorStop(0,'#e3e5d9');wash.addColorStop(.55,'#d9dece');wash.addColorStop(1,'#c0cbb1');ctx.fillStyle=wash;ctx.fillRect(0,0,width,height);
  const light=ctx.createRadialGradient(width*.33,0,0,width*.5,height*.38,width*.8);light.addColorStop(0,'#faf9e660');light.addColorStop(1,'#75896c15');ctx.fillStyle=light;ctx.fillRect(0,0,width,height);
  const floorY=height*.826;
  const floor=ctx.createLinearGradient(0,floorY,0,height);floor.addColorStop(0,'#b2bea03b');floor.addColorStop(1,'#99aa8044');ctx.fillStyle=floor;ctx.fillRect(0,floorY,width,height-floorY);
  line(ctx,0,floorY,width,floorY,'#a3b19244',1);
  ctx.fillStyle=wallPattern||'#00000005';ctx.fillRect(0,0,width,height);
  const rnd=randomGenerator(401);
  for(let i=0;i<90;i++){const x=rnd()*width,y=rnd()*floorY;if(Math.hypot(x-view.cx,y-view.cy)<view.radius*1.2)continue;circle(ctx,x,y,rnd()*.9+.3,'#77856b16');line(ctx,x,y+.7,x+1.5,y+.7,'#fbffeb44',.6);}
  if(width>650){ctx.save();ctx.translate(width-31,height*.51);ctx.rotate(-Math.PI/2);ctx.font='8px sans-serif';ctx.letterSpacing='3px';ctx.fillStyle='#7e8e674c';ctx.textAlign='center';ctx.fillText('A LITTLE AIM. A LITTLE CHAOS.',0,0);ctx.restore();}
  drawWallHoles();
  background.width=canvas.width;background.height=canvas.height;background.getContext('2d').drawImage(canvas,0,0);backgroundReady=true;
}

function recordWallHole(result){
  if(result.hit||result.surface!=='wall')return;
  wallHoles.push({x:result.position.x,y:result.position.y,size:.023+.018*result.force,seed:Math.floor(Math.random()*2147483647)});
  try{localStorage.setItem('slingshot-wall-holes',JSON.stringify(wallHoles));}catch{}
  backgroundReady=false;needsRedraw=true;
}
function drawWallHoles(){
  for(const hole of wallHoles){
    const p=project({x:hole.x,y:hole.y,z:CONFIG.depth}),r=hole.size*view.radius;
    if(p.x+r<0||p.x-r>width||p.y+r<0||p.y-r>height)continue;
    const rnd=randomGenerator(hole.seed),polygon=Array.from({length:10},(_,i)=>{const a=i/10*Math.PI*2,d=r*(.8+rnd()*.4);return {x:p.x+Math.cos(a)*d,y:p.y+Math.sin(a)*d};});
    ctx.save();ctx.beginPath();polygon.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();
    ctx.shadowColor='#f6f3dc88';ctx.shadowBlur=1;ctx.shadowOffsetY=1.5;ctx.fillStyle='#91987e';ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    const pit=ctx.createRadialGradient(p.x-r*.2,p.y-r*.2,0,p.x,p.y,r*.8);pit.addColorStop(0,'#273022');pit.addColorStop(.45,'#4c5740');pit.addColorStop(1,'#939d80');
    circle(ctx,p.x,p.y,r*.76,pit);ctx.beginPath();ctx.arc(p.x,p.y,r*.85,Math.PI*.1,Math.PI*.85);ctx.strokeStyle='#edf0d4aa';ctx.lineWidth=Math.max(.7,r*.15);ctx.stroke();
    for(let j=0;j<4;j++){const a=rnd()*Math.PI*2;line(ctx,p.x+Math.cos(a)*r*.8,p.y+Math.sin(a)*r*.8,p.x+Math.cos(a+.07)*r*1.35,p.y+Math.sin(a+.07)*r*1.35,'#6e795b77',.7);}
    ctx.restore();
  }
}

function currentBoardPose(time=clock){
  const base=effect?.pose||boardPose(motion,view,time);
  if(hammerFall){
    const r=view.radius,start={x:view.cx+hammerFall.origin.x*r,y:view.cy+hammerFall.origin.y*r},end={x:clamp(width*.76,r+12,width-r-12),y:height-r-12};
    const gravity=height*2.4,vy=-height*.06,distance=Math.max(0,end.y-start.y),landTime=(-vy+Math.sqrt(vy*vy+2*gravity*distance))/gravity,t=Math.max(0,time-hammerFall.at)*(reducedMotion?4:1),progress=clamp(t/landTime,0,1),after=Math.max(0,t-landTime);
    return {x:start.x+(end.x-start.x)*progress,y:t<landTime?start.y+vy*t+.5*gravity*t*t:end.y-(after<.25?Math.sin(after/.25*Math.PI)*r*.035:0),rotation:hammerFall.rotation+.24*progress,scale:1,pivot:base.pivot,landed:t>=landTime+.25};
  }
  if(effect?.kind==='drop'){
    const t=effect.time*(reducedMotion?4:1);return {...base,x:base.x+Math.sin(t*2)*view.radius*.12,y:base.y+height*.7*t*t,rotation:base.rotation+t*.6};
  }
  if(effect?.kind==='escape'){
    const t=effect.time*(reducedMotion?4:1);return {...base,x:base.x+effect.vx*t,y:base.y+effect.vy*t+height*.55*t*t,rotation:base.rotation+effect.spin*t};
  }
  return {...base,scale:1};
}
function drawSurfaceCrack(x,y,size,seed,material='wall',g=ctx){
  g.save();g.translate(x,y);g.lineJoin='round';
  makeSurfaceCracks(seed,material).forEach(path=>{
    g.beginPath();path.forEach((p,i)=>i?g.lineTo(p.x*size,p.y*size):g.moveTo(p.x*size,p.y*size));g.strokeStyle='#f4dfad99';g.lineWidth=2.6;g.stroke();g.strokeStyle='#282d1ddd';g.lineWidth=1.15;g.stroke();
  });g.restore();
}
function collectHammer(){
  if(mayhem.mode!=='normal'||state.phase!=='ready'||effect||!mayhemView.rewardOpen)return;
  const pose=sampleMotion(motion,clock);cancelAim();cancelBoardPointer();
  mayhem.mode='hammer';mayhem.soundBefore=soundEnabled;motion.settle={angle:pose.angle,at:clock};
  mayhemView.setMode('hammer');feedbackUntil=0;ui.feedback.className='feedback';ui.feedback.replaceChildren();updateHud();
}
function hammerFragmentPoses(){
  if(!hammerShatter||hammerShatter.complete)return [];
  const origin={x:view.cx+hammerShatter.origin.x*view.radius,y:view.cy+hammerShatter.origin.y*view.radius};
  const scene={radius:view.radius,width,height,origin,rotation:hammerShatter.rotation},time=(clock-hammerShatter.at)*(reducedMotion?4:1);
  const pieces=hammerShatter.shards.map(shard=>({shard,...fallingFragmentPose(shard,scene,time)})).filter(p=>!p.landed);
  hammerShatter.shards=pieces.map(p=>p.shard);hammerShatter.complete=pieces.length===0;return pieces;
}
function shatterHammerBoard(impact={x:0,y:-.9}){
  const pose=currentBoardPose();
  const length=Math.hypot(impact.x,impact.y),center=length>.94?{x:impact.x*.94/length,y:impact.y*.94/length}:impact;
  hammerShatter={at:clock,origin:{x:(pose.x-view.cx)/view.radius,y:(pose.y-view.cy)/view.radius},rotation:pose.rotation,shards:makeFragments(center,++hammerSeed,reducedMotion?18:30),complete:false};hammerFall=null;
}
function dropWholeHammerBoard(){
  const pose=currentBoardPose();hammerFall={at:clock,origin:{x:(pose.x-view.cx)/view.radius,y:(pose.y-view.cy)/view.radius},rotation:pose.rotation};
}
function hammerTarget(point){
  // Page controls are painted above the arena; their visible rectangles win overlaps.
  const surfaces=mayhemView.hitElements.sort((a,b)=>Number(b[1].classList.contains('object-fallen'))-Number(a[1].classList.contains('object-fallen')));
  for(const [id,el] of surfaces){
    const r=el.getBoundingClientRect(),pad=id==='sound'?Math.max(0,(44-r.width)/2):0;
    if(point.clientX>=r.left-pad&&point.clientX<=r.right+pad&&point.clientY>=r.top-pad&&point.clientY<=r.bottom+pad)return id;
  }
  const p={x:point.x,y:point.y},pose=currentBoardPose(),pivot=pose.pivot;
  if(pivot){
    const end=mayhem.damaged.includes('rope')?{x:pivot.x,y:pivot.y+29}:{x:pose.x+Math.sin(pose.rotation)*view.radius,y:pose.y-Math.cos(pose.rotation)*view.radius};
    const dx=end.x-pivot.x,dy=end.y-pivot.y,t=clamp(((p.x-pivot.x)*dx+(p.y-pivot.y)*dy)/(dx*dx+dy*dy||1),0,1);
    if(Math.hypot(p.x-pivot.x-dx*t,p.y-pivot.y-dy*t)<=17)return 'rope';
  }
  const s=view.slingScale;
  if(slingBreak){
    for(const part of currentSlingParts().filter(p=>!p.landed)){
      const dx=(p.x-part.x)/s,dy=(p.y-part.y)/s,c=Math.cos(part.rotation),n=Math.sin(part.rotation),x=dx*c+dy*n+part.pivot.x,y=-dx*n+dy*c+part.pivot.y,b=part.bounds;
      if(x>=b.left&&x<=b.right&&y>=b.top&&y<=b.bottom)return 'sling';
    }
  }else if(Math.abs(p.x-view.sx)<=54*s&&p.y>=view.sy-44*s&&p.y<=view.sy+114*s)return 'sling';
  if(hammerShatter)return 'background';
  const local=localPoint(p,pose,view.radius*(pose.scale||1));
  if(Math.hypot(local.x,local.y)<=1)return 'board';
  return 'background';
}
function hammerStrike(point){
  if(mayhem.mode!=='hammer')return;
  const rect=canvas.getBoundingClientRect(),p={x:point.x-rect.x,y:point.y-rect.y,clientX:point.x,clientY:point.y};
  const target=hammerTarget(p),wasFrozen=mayhem.scoreFrozen,outcome=strikeMayhem(mayhem,target);
  if(outcome.first&&['brand','restart','replace'].includes(target))hammerLayoutUntil=clock+(target==='brand'?(reducedMotion?.25:1.3):reducedMotion?.2:.65);
  if(wasFrozen)mayhemView.clearScorePopups();
  state.score+=outcome.points;
  if(target==='board'){
    const hit=localPoint(p,currentBoardPose(),view.radius);boardHammerDamage.add(createDamageStamp(++hammerSeed,'board'),{x:512+hit.x*480-216,y:512+hit.y*480-216,size:432,width:1024,height:1024});
    if(hammerFall)shatterHammerBoard(hit);
  }else if(target==='sling'){
    if(mayhem.slingStrikes===1)slingHammerCracks.push({x:(p.x-view.sx)/view.slingScale,y:(p.y-view.sy)/view.slingScale,seed:++hammerSeed});
    if(mayhem.slingStrikes===2)breakSling();
  }else if(target==='rope'&&outcome.first){
    if(!hammerShatter){if(ropeFallMode(mayhem)==='shatter')shatterHammerBoard();else dropWholeHammerBoard();}
  }
  else if(target!=='background'){mayhemView.markDamage(target,point);}
  if(target==='sound'){
    soundEnabled=false;soundEpoch++;audioUnlocked=false;stopAllSounds();updateSoundButton();
  }else{unlockAudio();playSound(target==='sling'?'wood':'hammer');}
  mayhemView.strike(point,clock,{background:target==='background',points:outcome.showPoints?outcome.points:null});
  if(outcome.complete){endingAt=clock;mayhemView.setMode('ending');mayhemView.breakHammer(point,clock);}
  updateHud();
}
function resetMayhem(){
  const restoreSound=mayhem.soundBefore;soundEpoch++;stopAllSounds();
  mayhem=createMayhemState();mayhemView.restore();boardHammerDamage.clear();slingHammerCracks=[];hammerShatter=null;hammerFall=null;endingAt=0;hammerLayoutUntil=0;slingBreak=null;
  soundEnabled=restoreSound;audioUnlocked=false;updateSoundButton();freshBoard(true);if(soundEnabled)unlockAudio(true);canvas.focus({preventScroll:true});
}

function drawMount(){
  const pose=currentBoardPose(),x=view.cx,y=view.cy-view.radius-40;
  if(!effect&&!mayhem.damaged.includes('rope')){
    const r=view.radius*(pose.scale||1);line(ctx,x,y+2,pose.x+Math.sin(pose.rotation)*r,pose.y-Math.cos(pose.rotation)*r+10,'#4c5546',3);
  }else{
    line(ctx,x,y+2,x+2,y+22,'#4c5546',3);
    for(let i=0;i<5;i++)line(ctx,x+2,y+19,x-5+i*3,y+29+(i%2)*4,'#807d5d',.8);
  }
  if(mayhem.mode==='hammer'&&!mayhem.damaged.includes('rope')&&BREAKABLES.length-mayhem.damaged.length<=3){ctx.shadowColor='#fff0b3';ctx.shadowBlur=12;}
  circle(ctx,x,y,6,'#89927d');circle(ctx,x-.5,y-1,4,'#c3c9b5');circle(ctx,x,y,2.7,'#6c7563');line(ctx,x-2,y+1,x+2,y-1,'#444e3b',1);
  ctx.shadowBlur=0;
}
function drawDart(x,y,size=1,angle=0,alpha=1){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(size,size);ctx.globalAlpha=alpha;
  ctx.shadowColor='#25331f50';ctx.shadowBlur=3;ctx.shadowOffsetX=2;ctx.shadowOffsetY=3;
  const metal=ctx.createLinearGradient(-3,0,3,0);metal.addColorStop(0,'#626b65');metal.addColorStop(.4,'#e4e9df');metal.addColorStop(.7,'#a0aaa0');metal.addColorStop(1,'#435345');
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-1.3,15);ctx.lineTo(1.3,15);ctx.closePath();ctx.fillStyle='#859080';ctx.fill();
  ctx.fillStyle=metal;ctx.fillRect(-2.3,13,4.6,18);
  for(let i=0;i<5;i++)line(ctx,-2.3,17+i*2.4,2.3,17+i*2.4,'#4c564277',.7);
  ctx.fillStyle='#d1d7bc';ctx.fillRect(-1.2,31,2.4,21);
  ctx.shadowBlur=0;ctx.beginPath();ctx.moveTo(0,32);ctx.lineTo(-11,48);ctx.lineTo(-7,58);ctx.lineTo(0,52);ctx.lineTo(7,58);ctx.lineTo(11,48);ctx.closePath();
  const red=ctx.createLinearGradient(-10,35,10,55);red.addColorStop(0,'#f18b6b');red.addColorStop(.5,'#cc462e');red.addColorStop(1,'#8e2e23');ctx.fillStyle=red;ctx.fill();
  ctx.save();ctx.beginPath();ctx.moveTo(0,32);ctx.lineTo(-11,48);ctx.lineTo(-7,58);ctx.lineTo(0,52);ctx.lineTo(7,58);ctx.lineTo(11,48);ctx.closePath();ctx.clip();
  line(ctx,-11,46,12,54,'#fff1ca',3);line(ctx,-12,51,12,59,'#fff1ca',3);ctx.restore();line(ctx,0,33,0,54,'#e8d9b9',1);ctx.restore();
}
function drawBoardDarts(){
  const r=view.radius;
  state.darts.forEach((dart,i)=>{
    const x=dart.x*r,y=-dart.y*r;circle(ctx,x+1,y+2,2,'#0c160bbb');
    const size=Math.max(.37,r/320);
    if(dart.pose==='rear')drawRearDart(x,y,Math.max(.65,r/210),dart);
    else if(dart.pose==='perspective'){
      ctx.save();ctx.translate(x,y);ctx.rotate(1.2+dart.angle*.3);ctx.scale(1,.48);drawDart(0,0,size*1.45,0);ctx.restore();
    }else{const angle=dart.firm?-1.95+dart.angle*.2+(i%3-1)*.12:dart.angle*.35+(i%3-1)*.24;drawDart(x,y,size*(dart.firm?1.12:1),angle);}
  });
}
function drawRearDart(x,y,size,dart){
  ctx.save();ctx.translate(x,y);ctx.scale(size,size);
  const tx=dart.x*4,ty=-dart.y*4;
  line(ctx,0,0,tx,ty,'#525f51',4);line(ctx,-.5,-.8,tx-.5,ty-.8,'#dfe5cb',1.3);
  ctx.translate(tx,ty);ctx.rotate(dart.angle*.4+.25);ctx.shadowColor='#24321b88';ctx.shadowBlur=4;ctx.shadowOffsetX=2;ctx.shadowOffsetY=2;
  for(let i=0;i<4;i++){
    ctx.save();ctx.rotate(i*Math.PI/2);ctx.beginPath();ctx.moveTo(-1,0);ctx.lineTo(-4,-5);ctx.lineTo(-1.8,-13);ctx.lineTo(2.8,-8.5);ctx.lineTo(2,0);ctx.closePath();
    ctx.fillStyle=i%2?'#af3929':'#e56a48';ctx.fill();ctx.shadowBlur=0;line(ctx,-2.5,-8.5,1.5,-6,'#f9e5b8',1.7);ctx.restore();
  }
  ctx.shadowBlur=0;circle(ctx,0,0,2.6,'#bec8b1');circle(ctx,0,0,1.4,'#55624f');circle(ctx,-.6,-.7,.6,'#eef3d9');ctx.restore();
}
function drawBoardDamage(g=ctx,r=view.radius){
  if(!state.fullPowerHits)return;
  g.save();g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.clip();
  state.crackHits.slice(0,3).forEach((hit,index)=>{
    for(const path of makeImpactCracks(hit,index)){
      g.beginPath();path.vertices.forEach((p,i)=>i?g.lineTo(p.x*r,p.y*r):g.moveTo(p.x*r,p.y*r));g.strokeStyle='#e8d2a466';g.lineWidth=path.lightWidth;g.stroke();g.strokeStyle='#191d12dd';g.lineWidth=path.darkWidth;g.stroke();
    }
  });g.restore();
}
function drawBoard(){
  if(effect?.kind==='smash'||hammerShatter)return;
  const r=view.radius,extent=r*512/480;
  let {x,y,rotation,scale=1}=currentBoardPose();
  if(state.phase==='replacing'){const t=clamp(1-(replaceUntil-clock)/.35,0,1);scale*=.85+.15*(1-(1-t)**3);}
  if(!reducedMotion&&clock<shakeUntil&&mayhem.mode==='normal'){x+=Math.sin(clock*90)*2.5;y+=Math.cos(clock*100)*1.5;}
  ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.scale(scale,scale);
  ctx.shadowColor='#45503e52';ctx.shadowBlur=r*.15;ctx.shadowOffsetX=r*.065;ctx.shadowOffsetY=r*.095;
  ctx.drawImage(board,-extent,-extent,extent*2,extent*2);ctx.shadowBlur=0;ctx.shadowOffsetX=ctx.shadowOffsetY=0;
  const cracks=state.darts.slice(0,11);
  cracks.forEach((d,i)=>{
    if(!d.firm)return;
    const x=d.x*r,y=-d.y*r,len=r*(.025+.002*(i+1)),angle=i*2.3;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(angle)*len*.5,y+Math.sin(angle)*len*.5);ctx.lineTo(x+Math.cos(angle+.5)*len,y+Math.sin(angle+.5)*len);ctx.strokeStyle='#13180ecc';ctx.lineWidth=1+(i+1)*.045;ctx.stroke();
  });
  drawBoardDamage();drawBoardDarts();
  ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.clip();
  boardHammerDamage.paint(ctx,-extent,-extent,extent*2,extent*2);ctx.restore();
  if(mayhem.mode==='hammer'&&!mayhem.damaged.includes('board')&&BREAKABLES.length-mayhem.damaged.length<=3){ctx.beginPath();ctx.arc(0,0,r+3,0,Math.PI*2);ctx.strokeStyle=`rgba(255,241,181,${.35+.3*Math.sin(clock*3)})`;ctx.lineWidth=3;ctx.stroke();}
  ctx.restore();
}

function drawSling(g=ctx,capture=false){
  if(slingBreak&&!capture){drawBrokenSling();return;}
  if(intro==='waiting')return;
  const progress=capture||intro==='playing'?1:clamp((clock-entranceAt)/entranceDuration,0,1),eased=1-(1-progress)**3;
  g.save();g.translate(0,reducedMotion?0:(height-view.sy+80*view.slingScale)*(1-eased));g.globalAlpha=eased;
  const taut=state.phase==='aiming'&&Math.hypot(pull.dx,pull.dy)>=view.maxPull&&!reducedMotion&&mayhem.mode==='normal';
  const s=capture?1:view.slingScale,x=capture?72:view.sx+(taut?Math.sin(clock*93)*1.4:0),y=capture?48:view.sy+(taut?Math.cos(clock*107)*.7:0);
  g.save();g.translate(x,y);g.scale(s,s);
  if(!capture){const shadow=g.createRadialGradient(4,95,0,4,95,62);shadow.addColorStop(0,'#344a2850');shadow.addColorStop(1,'#344a2800');g.save();g.scale(1,.22);g.fillStyle=shadow;g.beginPath();g.ellipse(0,432,80,33,0,0,Math.PI*2);g.fill();g.restore();}
  const wood=g.createLinearGradient(-45,0,30,10);wood.addColorStop(0,'#684122');wood.addColorStop(.18,'#a9743b');wood.addColorStop(.46,'#d2a566');wood.addColorStop(.65,'#a96e34');wood.addColorStop(1,'#634021');
  const branch=()=>{g.beginPath();g.moveTo(-37,-24);g.bezierCurveTo(-40,13,-30,25,-9,42);g.bezierCurveTo(-3,56,-4,73,-7,96);g.moveTo(37,-24);g.bezierCurveTo(40,12,29,31,-6,46);};
  g.lineCap='round';branch();g.strokeStyle='#513a24';g.lineWidth=30;g.shadowColor='#27301c44';g.shadowBlur=6;g.shadowOffsetX=4;g.shadowOffsetY=6;g.stroke();g.shadowBlur=0;g.shadowOffsetX=g.shadowOffsetY=0;
  branch();g.strokeStyle=wood;g.lineWidth=26;g.stroke();
  g.beginPath();g.moveTo(-39,-28);g.bezierCurveTo(-41,0,-35,14,-25,26);g.strokeStyle='#f0c38b88';g.lineWidth=2;g.stroke();
  g.beginPath();g.moveTo(34,-28);g.bezierCurveTo(36,-6,29,16,15,26);g.strokeStyle='#e6b67777';g.lineWidth=2;g.stroke();
  for(let i=0;i<5;i++){g.beginPath();g.moveTo(-9+i*3,53);g.bezierCurveTo(-3+i*2,65,-8+i*2,82,-8+i*3,91);g.strokeStyle=i%2?'#6d451a55':'#d4a46866';g.lineWidth=1;g.stroke();}
  for(const side of [-1,1]){for(let i=0;i<4;i++)line(g,side*37-11,-27+i*3,side*37+10,-27+i*3,'#ccbb85',2.4);}
  slingHammerCracks.forEach(hit=>drawSurfaceCrack(hit.x,hit.y,35,hit.seed,'wood',g));
  if(mayhem.mode==='hammer'&&!mayhem.damaged.includes('sling')&&BREAKABLES.length-mayhem.damaged.length<=3){g.shadowColor='#ffe9a3';g.shadowBlur=12;branch();g.strokeStyle='#ffe9a377';g.lineWidth=3;g.stroke();g.shadowBlur=0;}
  g.restore();
  let dx=0,dy=0;
  if(state.phase==='aiming'){dx=pull.dx;dy=pull.dy;}
  else if(clock-reboundAt<.35){dy=Math.sin((clock-reboundAt)*65)*Math.exp(-(clock-reboundAt)*12)*16;}
  const px=x+dx,py=y+dy;
  for(const side of [-1,1]){
    const ax=x+side*37*s,ay=y-23*s;
    if(mayhem.damaged.includes('sling')){
      g.beginPath();g.moveTo(ax,ay);g.bezierCurveTo(ax+side*18,ay+60,px+side*24,py+66,px+side*12,py+45);g.strokeStyle='#b79857';g.lineWidth=5*s;g.stroke();
    }else{line(g,ax,ay,px,py,'#6d542b99',7*s);line(g,ax,ay-1,px,py-1,'#d6b268',4.5*s);line(g,ax,ay-2,px,py-2,'#edcf88aa',1.2*s);}
  }
  g.save();g.translate(px,py);g.rotate(-dx*.002);g.fillStyle='#61422c';g.strokeStyle='#3c2c1e';g.lineWidth=1;g.beginPath();g.roundRect(-16*s,-7*s,32*s,15*s,6*s);g.fill();g.stroke();line(g,-11*s,3*s,11*s,3*s,'#b18a5866',1);g.restore();
  if(!capture&&['ready','aiming'].includes(state.phase)&&mayhem.mode==='normal')drawDart(px,py-13*s,.84*s,-dx*.001);
  g.restore();
}

function currentSlingParts(){
  return slingPartPoses({width,height,sx:view.sx,sy:view.sy,scale:view.slingScale},(clock-slingBreak.at)*(reducedMotion?5:1));
}
function breakSling(){
  // Capture the existing drawing once; both falling halves retain its exact material.
  const source=document.createElement('canvas');source.width=144;source.height=180;
  drawSling(source.getContext('2d'),true);
  const cut=[{x:0,y:108},{x:56,y:108},{x:61,y:103},{x:67,y:112},{x:73,y:105},{x:79,y:111},{x:86,y:107},{x:144,y:108}];
  const images=[0,1].map(bottom=>{
    const image=document.createElement('canvas');image.width=144;image.height=180;const g=image.getContext('2d');
    g.save();g.beginPath();g.moveTo(0,bottom?180:0);g.lineTo(144,bottom?180:0);
    [...cut].reverse().forEach(p=>g.lineTo(p.x,p.y));g.closePath();g.clip();g.drawImage(source,0,0);
    g.beginPath();cut.slice(1,-1).forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.globalCompositeOperation='source-atop';g.strokeStyle='#e0b87d';g.lineWidth=4;g.stroke();g.restore();return image;
  });
  slingBreak={at:clock,images,landed:false};
}
function drawBrokenSling(){
  const parts=currentSlingParts(),s=view.slingScale;
  parts.forEach((part,i)=>{if(part.landed)return;ctx.save();ctx.translate(part.x,part.y);ctx.rotate(part.rotation);ctx.scale(s,s);ctx.drawImage(slingBreak.images[i],-part.pivot.x,-part.pivot.y);ctx.restore();});
  slingBreak.landed=parts.every(p=>p.landed);if(slingBreak.landed)slingBreak.images=[];canvas.dataset.slingLanded=String(slingBreak.landed);canvas.dataset.slingFragmentCount=String(parts.filter(p=>!p.landed).length);
}

export function currentShot(){return makeShot({...pull,maxPull:view.maxPull,scatterSeed:aimSeed});}
function startAim(){aimSeed=Math.floor(Math.random()*4294967296);state.phase='aiming';fullBuzzed=false;mayhemView.hideReward();}
function drawTrajectory(){
  if(state.phase!=='aiming'||Math.hypot(pull.dx,pull.dy)<5)return;
  const shot=currentShot(),result=resolveFlight(shot);
  if(shot.force+1e-9>=CONFIG.smashForce)return;
  // Show the shared initial arc only; do not mark the destination.
  const end=Math.min(result.time*.78,.57);
  for(let i=1;i<=13;i++){
    const t=end*i/13,p=project(positionAt(shot,t));circle(ctx,p.x,p.y,Math.max(1.15,3-i*.13),`rgba(255,255,235,${.8-i*.038})`);
  }
}
function drawFlight(){
  if(!flight)return;
  const p=project(positionAt(flight.shot,flight.time));
  const prev=project(positionAt(flight.shot,Math.max(0,flight.time-.025)));
  for(let i=5;i>=1;i--){const q=project(positionAt(flight.shot,Math.max(0,flight.time-i*.018)));circle(ctx,q.x,q.y,1.5,'#fff5db38');}
  const direction=Math.atan2(p.x-prev.x,-(p.y-prev.y));drawDart(p.x,p.y,.57*p.scale,direction*.6);
}
function spawnDust(position,kind){
  const p=project(position),count=reducedMotion?7:kind==='miss'?15:25;
  for(let i=0;i<count;i++){particles.push({x:p.x,y:p.y,vx:(Math.random()-.5)*120,vy:-20-Math.random()*90,size:1+Math.random()*2,life:.55+Math.random()*.35,color:kind==='miss'?'#99a284':'#c6ba88'});}
  particles=particles.slice(-150);
}
function beginDestruction(kind,vx=0,vy=0,reason=kind){
  if(effect||mayhem.mode!=='normal')return;
  const pose=currentBoardPose();cancelAim();cancelBoardPointer();mayhemView.hideReward();advanceSwingTier(state,reason);state.phase='destroying';
  effect={kind,time:0,pose,shards:[],duration:reducedMotion&&kind!=='smash'?.4:CONFIG.replacementTime};
  if(kind==='escape'){
    const direction=Math.sign(vx||pose.velocity||1);effect.vx=direction*Math.max(width*.85,Math.abs(vx));effect.vy=clamp(vy,-height*.6,height*.15)||-height*.23;effect.spin=direction*3.2;
  }
  if(kind==='smash'){
    const hit=state.darts.at(-1);effect.impact={x:hit.x,y:-hit.y};
    effect.shards=makeFragments(effect.impact,731+state.shots,reducedMotion?18:30);
  }
}
function fragmentPath(polygon,r,offset=0,g=ctx){g.beginPath();polygon.forEach((p,i)=>{if(i===0)g.moveTo(p.x*r+offset,p.y*r+offset);else g.lineTo(p.x*r+offset,p.y*r+offset);});g.closePath();}
function fragmentImage(shard){
  if(shard.image)return shard.image;
  const unit=480,minX=Math.min(...shard.polygon.map(p=>p.x)),minY=Math.min(...shard.polygon.map(p=>p.y)),maxX=Math.max(...shard.polygon.map(p=>p.x)),maxY=Math.max(...shard.polygon.map(p=>p.y));
  const image=document.createElement('canvas');image.width=Math.ceil((maxX-minX)*unit)+8;image.height=Math.ceil((maxY-minY)*unit)+8;
  const g=image.getContext('2d');g.translate(4-minX*unit,4-minY*unit);fragmentPath(shard.polygon,unit,0,g);g.clip();g.drawImage(board,-512,-512,1024,1024);drawBoardDamage(g,unit);
  boardHammerDamage.paint(g,-512,-512,1024,1024);
  shard.image={image,x:minX-4/unit,y:minY-4/unit,width:image.width/unit,height:image.height/unit};return shard.image;
}
function drawHammerFragments(){
  const pieces=hammerFragmentPoses(),r=view.radius;
  canvas.dataset.fragmentCount=String(pieces.length);
  pieces.forEach(p=>{
    const shard=p.shard,c=shard.center;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rotation);ctx.scale(p.tilt,1);ctx.translate(-c.x*r,-c.y*r);
    ctx.shadowColor='#2c3b2466';ctx.shadowBlur=7;ctx.shadowOffsetY=4;
    fragmentPath(shard.polygon,r,shard.thickness*r/180);ctx.fillStyle=shard.red?'#89301f':'#9b8a5b';ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    const cached=fragmentImage(shard);ctx.drawImage(cached.image,cached.x*r,cached.y*r,cached.width*r,cached.height*r);
    fragmentPath(shard.polygon,r);ctx.strokeStyle=shard.red?'#f3a16b99':'#d8c99b99';ctx.lineWidth=Math.max(.8,r/160);ctx.stroke();ctx.restore();
  });
}
function drawEffects(dt){
  const r=view.radius,extent=r*512/480;
  if(effect?.kind==='smash'){
    const t=Math.max(0,effect.time-.08),gravity=height*1.5;
    effect.shards.forEach(shard=>{
      const c=shard.center,scale=r/180,rotation=effect.pose.rotation,cos=Math.cos(rotation),sin=Math.sin(rotation),vy=(shard.vx*sin+shard.vy*cos)*scale,floor=height*.89+c.y*r*.03,startY=effect.pose.y+(c.x*sin+c.y*cos)*r;
      const landTime=Math.max(0,(-vy+Math.sqrt(vy*vy+2*gravity*Math.max(0,floor-startY)))/gravity),after=Math.max(0,t-landTime),moving=Math.min(t,landTime);
      const x=effect.pose.x+(c.x*cos-c.y*sin)*r+(shard.vx*cos-shard.vy*sin)*scale*(moving+(1-Math.exp(-after*6))*.12);
      const y=t<landTime?startY+vy*t+.5*gravity*t*t:floor-Math.abs(Math.sin(after*16))*30*scale*Math.exp(-after*6);
      ctx.save();ctx.translate(x,y);ctx.rotate(rotation+shard.spin*(moving+after*.15));ctx.scale(Math.max(.28,Math.abs(Math.cos(shard.tilt*t))),1);ctx.translate(-c.x*r,-c.y*r);
      ctx.globalAlpha=clamp((2-effect.time)/.2,0,1);ctx.shadowColor='#2c3b2466';ctx.shadowBlur=9;ctx.shadowOffsetY=5;
      fragmentPath(shard.polygon,r,shard.thickness*scale);ctx.fillStyle=shard.red?'#89301f':'#9b8a5b';ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
      ctx.save();fragmentPath(shard.polygon,r);ctx.clip();ctx.drawImage(board,-extent,-extent,extent*2,extent*2);ctx.restore();
      fragmentPath(shard.polygon,r);ctx.strokeStyle=shard.red?'#f3a16b99':'#d8c99b99';ctx.lineWidth=Math.max(.8,1.4*scale);ctx.stroke();ctx.restore();
    });
    state.darts.forEach((dart,i)=>{const c=Math.cos(effect.pose.rotation),s=Math.sin(effect.pose.rotation);drawDart(effect.pose.x+(dart.x*c+dart.y*s)*r+(i%2?1:-1)*t*80,effect.pose.y+(dart.x*s-dart.y*c)*r-50*t+height*.5*t*t,Math.max(.37,r/320),effect.pose.rotation+t*(i%2?3:-3),clamp(2-t,0,1));});
  }
  particles.forEach(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=190*dt;ctx.globalAlpha=clamp(p.life*2,0,1);circle(ctx,p.x,p.y,p.size,p.color);});ctx.globalAlpha=1;particles=particles.filter(p=>p.life>0);
}

function updateHud(){
  needsRedraw=true;
  ui.score.textContent=state.score;ui.shots.textContent=state.shots;ui.accuracy.textContent=state.shots?`${Math.round(state.hits/state.shots*100)}%`:'—';ui.darts.textContent=state.darts.length;
  [...ui.ticks.children].forEach((tick,i)=>tick.classList.toggle('filled',i<state.darts.length));
  const force=mayhem.damaged.includes('power')?1:state.phase==='aiming'?clamp(Math.hypot(pull.dx,pull.dy)/view.maxPull*CONFIG.maxForce,0,CONFIG.maxForce):0;
  if(mayhem.mode==='normal'&&state.phase==='aiming'&&force>=CONFIG.smashForce&&!fullBuzzed){fullBuzzed=true;if(!reducedMotion){try{navigator.vibrate?.(18);}catch{}}}
  const percentage=Math.floor(force*100+1e-7);ui['power-value'].innerHTML=`${percentage}<span>%</span>`;ui['power-fill'].style.width=`${force/CONFIG.maxForce*100}%`;
  document.querySelector('.power-panel').classList.toggle('hot',force+1e-9>=CONFIG.smashForce);
  ui['power-hint'].textContent=force+1e-9>=CONFIG.smashForce?'100%！松手发射':state.phase==='aiming'?'左右调整方向，松手发射':state.phase==='flying'?'飞镖飞行中…':state.phase==='destroying'?'正在挂上新靶盘…':'拉住弹弓，向后拖动';
  ui.replace.dataset.damage=String(state.fullPowerHits);canvas.dataset.wallHoles=String(wallHoles.length);
  canvas.dataset.mode=mayhem.mode;canvas.dataset.phase=state.phase;canvas.dataset.swingTier=String(state.swingTier);canvas.dataset.broken=mayhem.damaged.join(',');canvas.dataset.scoreFrozen=String(mayhem.scoreFrozen);canvas.dataset.boardStrikes=String(mayhem.boardStrikes);canvas.dataset.slingStrikes=String(mayhem.slingStrikes);canvas.dataset.slingBroken=String(!!slingBreak);canvas.dataset.slingLanded=String(!!slingBreak?.landed);canvas.dataset.slingFragmentCount=String(slingBreak&&!slingBreak.landed?2:0);canvas.dataset.boardMarks=String(boardHammerDamage.count);
  const lastDart=state.darts.at(-1);canvas.dataset.hitX=lastDart?String(lastDart.x):'';canvas.dataset.hitY=lastDart?String(lastDart.y):'';
  ui.replace.dataset.portrait=String(portraitIndex);ui.replace.setAttribute('aria-label',`换个靶盘，当前${portraitStyles[portraitIndex].name}`);
  arena.dataset.intro=intro;canvas.dataset.intro=intro;
  ui.start.disabled=!loaded||startPending;ui.start.setAttribute('aria-busy',String(startPending));
  ui.restart.disabled=!loaded||intro!=='playing';
  ui.replace.disabled=!loaded||intro!=='playing'||state.phase!=='ready';
  ui['pull-hint'].style.opacity=intro==='playing'&&state.phase==='ready'&&state.shots<3?'1':'0';
}
function showFeedback(head,text,impact=false,duration=1.45,badge=''){
  ui.feedback.replaceChildren();const strong=document.createElement('strong');strong.textContent=head;ui.feedback.append(strong,document.createTextNode(text));if(badge){const small=document.createElement('small');small.textContent=badge;ui.feedback.append(small);}ui.feedback.className=`feedback visible${impact?' impact':''}`;feedbackUntil=clock+duration;
}
function updateSoundButton(){ui.sound.setAttribute('aria-pressed',String(soundEnabled));ui.sound.setAttribute('aria-label',soundEnabled?'关闭声音':'开启声音');ui.sound.title=soundEnabled?'关闭声音':'开启声音';if(outputGain)outputGain.gain.value=soundEnabled?1:0;}
function audioOutput(){if(!outputGain&&audio){outputGain=audio.createGain();outputGain.gain.value=soundEnabled?1:0;outputGain.connect(audio.destination);}return outputGain;}
function playSource(source,time){activeSounds.add(source);source.addEventListener('ended',()=>activeSounds.delete(source),{once:true});source.start(time);}
function stopAllSounds(){
  const sources=[...activeSounds];activeSounds.clear();cheerSource=null;
  for(const source of sources){try{source.stop();}catch{}}
  if(outputGain&&!soundEnabled)outputGain.gain.value=0;
}
function prepareAudio(){
  try{
    const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
    const decode=bytes=>Offline?new Offline(1,1,48000).decodeAudioData(bytes):audio?.decodeAudioData(bytes)??null;
    if(!slapDecode){
      if(!slapData){
        const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
        slapData=fetch(new URL('./assets/shatter-slap.wav?v=trp-first-three-fast-1',import.meta.url),{signal:controller.signal})
          .then(response=>{if(!response.ok)throw new Error('Slap asset unavailable');return response.arrayBuffer();})
          .finally(()=>clearTimeout(timeout));
      }
      slapDecode=slapData.then(decode).then(buffer=>{slapBuffer=buffer;if(!buffer)slapDecode=null;return buffer;})
        .catch(()=>{slapData=null;slapDecode=null;return null;});
    }
    if(!cheerDecode){
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
      cheerDecode=fetch(new URL('./assets/human-cheer.wav?v=c2-volume8-1',import.meta.url),{signal:controller.signal})
        .then(response=>{if(!response.ok)throw new Error('Cheer asset unavailable');return response.arrayBuffer();})
        .then(decode).then(buffer=>{cheerBuffer=buffer;if(!buffer)cheerDecode=null;return buffer;})
        .catch(()=>{cheerDecode=null;return null;}).finally(()=>clearTimeout(timeout));
    }
    return Promise.all([slapDecode,cheerDecode]);
  }catch{return Promise.resolve(null);}
}
function unlockAudio(force=false){
  if(!soundEnabled)return;
  try{
    // Create the playback context inside the gesture, not during page loading.
    audio??=new (window.AudioContext||window.webkitAudioContext)();
    prepareAudio();
    if(audio.state==='closed')return;
    // iOS also needs a source started synchronously during touchstart/click.
    // A zero-valued sample is inaudible; completion confirms audio rendering works.
    if(force===true||!audioUnlocked||audio.state!=='running'){
      const source=audio.createBufferSource();source.buffer=audio.createBuffer(1,1,audio.sampleRate);source.connect(audioOutput());
      source.onended=()=>{source.disconnect();audioUnlocked=soundEnabled&&!document.hidden&&audio.state==='running';};
      playSource(source,0);
    }
    if(force===true||!audioUnlocked||audio.state!=='running'){
      const resumed=audio.resume().then(()=>true,()=>false);audioResume=resumed;
      resumed.finally(()=>{if(audioResume===resumed)audioResume=null;});
    }
    return audioResume??Promise.resolve(audio.state==='running');
  }catch{}
}
function beginEntrance(){
  if(intro!=='waiting')return;
  clearTimeout(startTimer);startPending=false;startAttempt++;
  intro='entering';entranceAt=clock;ui['start-screen'].hidden=true;
  ui.feedback.replaceChildren();ui.feedback.className='feedback';feedbackUntil=0;updateHud();
}
function startGame(){
  if(!loaded||intro!=='waiting'||startPending)return;
  // Keep this call in the button's actual click, before waiting for any promise.
  const ready=unlockAudio(true),attempt=++startAttempt;startPending=true;updateHud();
  if(!soundEnabled){beginEntrance();return;}
  const finish=ok=>{
    if(attempt!==startAttempt||intro!=='waiting'||!startPending)return;
    clearTimeout(startTimer);
    if(ok===true&&audio?.state==='running'){beginEntrance();return;}
    startPending=false;updateHud();showFeedback('请再点一次开始','也可以先关闭声音',false,8);
  };
  startTimer=setTimeout(()=>finish(false),2500);
  Promise.resolve(ready).then(finish,()=>finish(false));
}
ui.start.addEventListener('click',startGame);
function stopCheer(){if(cheerSource){activeSounds.delete(cheerSource);try{cheerSource.stop();}catch{}cheerSource=null;}}
function playSound(kind){
  if(!soundEnabled||!audio)return;
  if(audio.state!=='running'){
    const epoch=soundEpoch,shot=state.shots,requestedAt=clock;
    audioResume?.then(()=>{
      if(audio.state==='running'&&soundEnabled&&soundEpoch===epoch&&state.shots===shot&&!document.hidden&&clock-requestedAt<=.8)playSound(kind);
    });
    return;
  }
  try{
    if(kind==='cheer'){
      const epoch=soundEpoch,shot=state.shots;
      const celebrate=()=>{
        if(!cheerBuffer||!soundEnabled||soundEpoch!==epoch||state.shots!==shot||audio.state!=='running'||state.phase!=='destroying'||document.hidden)return;
        stopCheer();const source=audio.createBufferSource();source.buffer=cheerBuffer;source.connect(audioOutput());cheerSource=source;
        source.onended=()=>{if(cheerSource===source)cheerSource=null;};playSource(source,audio.currentTime);
      };
      if(cheerBuffer)celebrate();else cheerDecode?.then(celebrate);
      return;
    }
    if(kind==='smash'){
      const epoch=soundEpoch,shot=state.shots;
      const strike=()=>{
        if(!slapBuffer||!soundEnabled||soundEpoch!==epoch||state.shots!==shot||audio.state!=='running'||state.phase!=='destroying'||document.hidden)return;
        const src=audio.createBufferSource();src.buffer=slapBuffer;src.connect(audioOutput());playSource(src,audio.currentTime);
      };
      if(slapBuffer)strike();else slapDecode?.then(strike);
      return;
    }
    if(kind==='full-impact'){
      const now=audio.currentTime;
      for(const offset of [0]){
        const start=now+offset,length=.14,buffer=audio.createBuffer(1,Math.floor(audio.sampleRate*length),audio.sampleRate),data=buffer.getChannelData(0);
        for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*7);
        const src=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();src.buffer=buffer;filter.type='highpass';filter.frequency.value=500;gain.gain.setValueAtTime(.16,start);gain.gain.exponentialRampToValueAtTime(.001,start+length);src.connect(filter);filter.connect(gain);gain.connect(audioOutput());playSource(src,start);src.stop(start+length);
      }return;
    }
    const t=audio.currentTime,volume=audio.createGain();volume.connect(audioOutput());volume.gain.setValueAtTime(['hammer','wood'].includes(kind)?.17:.08,t);volume.gain.exponentialRampToValueAtTime(.001,t+.2);
    if(['drop','miss','hammer','wood'].includes(kind)){
      const length=.24,buffer=audio.createBuffer(1,Math.floor(audio.sampleRate*length),audio.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*4);
      const src=audio.createBufferSource(),filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=kind==='wood'?780:kind==='hammer'?1600:450;src.buffer=buffer;src.connect(filter);filter.connect(volume);playSource(src,t);src.stop(t+length);
    }else{
      const osc=audio.createOscillator();osc.type='triangle';osc.frequency.setValueAtTime(kind==='release'?260:180,t);osc.frequency.exponentialRampToValueAtTime(kind==='release'?65:55,t+.18);osc.connect(volume);playSource(osc,t);osc.stop(t+.2);
    }
  }catch{}
}

function cancelAim(){
  const id=pointerId;pointerId=null;pointerStart=null;
  if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
  if(state.phase==='aiming')state.phase='ready';pull={dx:0,dy:0};if(fullBuzzed&&!reducedMotion){try{navigator.vibrate?.(0);}catch{}}fullBuzzed=false;if(view)updateHud();
}
function cancelBoardPointer(){
  if(!boardPointer)return;
  const pending=boardPointer;boardPointer=null;
  if(motion.dragAngle!==null)releaseBoard(motion,motion.dragAngle,0,clock);
  if(canvas.hasPointerCapture(pending.id))canvas.releasePointerCapture(pending.id);needsRedraw=true;
}
function moveBoardPointer(e){
  if(boardPointer?.id!==e.pointerId)return;
  const p=eventPoint(e),pending=boardPointer,now=e.timeStamp/1000;
  pending.distance=Math.max(pending.distance,Math.hypot(p.x-pending.start.x,p.y-pending.start.y));
  pending.samples.push({...p,time:now});while(pending.samples.length>2&&pending.samples[1].time<now-.1)pending.samples.shift();
  if(pending.distance>SWING.dragThreshold){
    pending.dragged=true;mayhemView.hideReward();
    const angle=Math.atan2(p.x-pending.pivot.x,p.y-pending.pivot.y);
    motion.dragAngle=clamp(pending.angle+angle-pending.pointerAngle,-Math.PI/3,Math.PI/3);needsRedraw=true;
  }
}
function limitPull(dx,dy){return constrainPull(dx,dy,view,width,height);}
function launch(){
  if(state.phase!=='aiming'||!loaded||intro!=='playing'||mayhem.mode!=='normal')return;
  if(Math.hypot(pull.dx,pull.dy)<3){cancelAim();return;}
  const shot=currentShot();flight={shot,result:resolveFlight(shot),time:0};
  state.phase='flying';pull={dx:0,dy:0};if(fullBuzzed&&!reducedMotion){try{navigator.vibrate?.(0);}catch{}}fullBuzzed=false;reboundAt=clock;playSound('release');updateHud();
}
function eventPoint(e){const rect=canvas.getBoundingClientRect();return {x:(e.clientX-rect.left)*width/rect.width,y:(e.clientY-rect.top)*height/rect.height};}
canvas.addEventListener('pointerdown',e=>{
  if(!loaded||intro!=='playing'||mayhem.mode!=='normal'||!['ready','flying'].includes(state.phase)||pointerId!==null||boardPointer||!e.isPrimary||(e.pointerType==='mouse'&&e.button!==0))return;
  const p=eventPoint(e),pose=currentBoardPose(),local=localPoint(p,pose,view.radius);
  if(Math.hypot(local.x,local.y)<=1&&!effect){
    e.preventDefault();canvas.focus({preventScroll:true});unlockAudio();
    boardPointer={id:e.pointerId,start:p,pivot:pose.pivot,angle:pose.angle,pointerAngle:Math.atan2(p.x-pose.pivot.x,p.y-pose.pivot.y),avatar:Math.hypot(local.x,local.y)<=CONFIG.bullRadius,dragged:false,distance:0,samples:[{...p,time:e.timeStamp/1000}]};canvas.setPointerCapture(e.pointerId);return;
  }
  if(state.phase!=='ready'||Math.hypot(p.x-view.sx,p.y-view.sy)>65*view.slingScale)return;
  e.preventDefault();canvas.focus({preventScroll:true});unlockAudio();pointerId=e.pointerId;pointerStart=p;canvas.setPointerCapture(pointerId);startAim();pull={dx:0,dy:0};updateHud();
});
canvas.addEventListener('pointermove',e=>{if(boardPointer?.id===e.pointerId){e.preventDefault();moveBoardPointer(e);return;}if(e.pointerId!==pointerId||state.phase!=='aiming')return;e.preventDefault();const p=eventPoint(e);pull=limitPull(p.x-pointerStart.x,p.y-pointerStart.y);updateHud();});
canvas.addEventListener('pointerup',e=>{
  if(boardPointer?.id===e.pointerId){
    moveBoardPointer(e);const pending=boardPointer,first=pending.samples[0],last=pending.samples.at(-1),duration=Math.max(.008,last.time-first.time),vx=(last.x-first.x)/duration,vy=(last.y-first.y)/duration;
    const angle=motion.dragAngle??sampleMotion(motion,clock).angle;boardPointer=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(pending.dragged){
      releaseBoard(motion,angle,clamp(vx/(view.radius+40),-12,12),clock);
      if(shouldFling(pending.distance,Math.hypot(vx,vy),view.radius*2)){beginDestruction('escape',vx,vy,'fling');updateHud();}
    }else if(pending.avatar&&state.phase==='ready'&&!effect){mayhemView.showReward();needsRedraw=true;}
    return;
  }
  if(e.pointerId!==pointerId)return;const p=eventPoint(e);pull=limitPull(p.x-pointerStart.x,p.y-pointerStart.y);const id=pointerId;pointerId=null;pointerStart=null;if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);launch();
});
canvas.addEventListener('pointercancel',e=>{if(e.pointerId===pointerId)cancelAim();if(e.pointerId===boardPointer?.id)cancelBoardPointer();});
canvas.addEventListener('lostpointercapture',e=>{if(e.pointerId===pointerId)cancelAim();if(e.pointerId===boardPointer?.id)cancelBoardPointer();});
canvas.addEventListener('blur',()=>{if(state.phase==='aiming')cancelAim();});
canvas.addEventListener('keydown',e=>{
  if(!loaded||intro!=='playing'||mayhem.mode!=='normal')return;
  if(e.key==='Escape'){e.preventDefault();cancelAim();cancelBoardPointer();return;}
  if(!['ready','aiming'].includes(state.phase)||pointerId!==null||boardPointer)return;
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
    e.preventDefault();if(state.phase==='ready'){startAim();pull={dx:0,dy:view.maxPull*.65/CONFIG.maxForce};}
    pull=limitPull(pull.dx+(e.key==='ArrowLeft'?-7:e.key==='ArrowRight'?7:0),pull.dy+(e.key==='ArrowDown'?7:e.key==='ArrowUp'?-7:0));updateHud();
  }else if(e.code==='Space'||e.key==='Enter'){
    if(e.repeat){e.preventDefault();return;}
    e.preventDefault();unlockAudio();if(state.phase==='ready'){startAim();pull={dx:0,dy:view.maxPull*.65/CONFIG.maxForce};}launch();
  }
});
// touchstart precedes a drag; Safari may reject touchend after the finger has moved.
for(const type of ['touchstart','touchend','pointerdown','pointerup','click','keydown'])document.addEventListener(type,()=>{if(intro!=='waiting')unlockAudio();},{passive:true,capture:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden){soundEpoch++;audioUnlocked=false;stopAllSounds();cancelAim();cancelBoardPointer();}lastFrame=performance.now();});
function freshBoard(clearScore=false,cyclePortrait=false){
  if(intro!=='playing'||mayhem.mode!=='normal')return;
  soundEpoch++;
  stopAllSounds();mayhemView.hideReward();
  cancelAim();cancelBoardPointer();if(clearScore)state=createGameState();else replaceBoard(state);
  if(cyclePortrait){portraitIndex=(portraitIndex+1)%portraitStyles.length;buildTextures();}
  flight=null;effect=null;particles=[];pull={dx:0,dy:0};shakeUntil=0;feedbackUntil=0;ui.feedback.replaceChildren();ui.feedback.className='feedback';state.phase='replacing';replaceUntil=clock+.35;motion=createBoardMotion(state.swingTier,replaceUntil);updateHud();
}
ui.replace.addEventListener('click',()=>{if(state.phase==='ready'&&mayhem.mode==='normal')freshBoard(false,true);});ui.restart.addEventListener('click',()=>freshBoard(true));
ui.sound.addEventListener('click',()=>{if(mayhem.mode!=='normal')return;soundEpoch++;soundEnabled=!soundEnabled;if(!soundEnabled)audioUnlocked=false;try{localStorage.setItem('slingshot-sound',soundEnabled?'on':'off');}catch{}if(soundEnabled)unlockAudio(true);else{stopAllSounds();if(startPending)beginEntrance();}updateSoundButton();});

function frame(now){
  const dt=document.hidden?0:Math.min((now-lastFrame)/1000,.05);lastFrame=now;clock+=dt;
  if(view){
    if(intro==='entering'&&clock-entranceAt>=entranceDuration){intro='playing';canvas.tabIndex=0;canvas.focus({preventScroll:true});updateHud();}
    if(flight){
      flight.time+=dt;
      if(flight.time>=flight.result.time){
        const impactAt=clock-(flight.time-flight.result.time),pose=currentBoardPose(impactAt),wasDestroying=!!effect;
        const result=resolveFlight(flight.shot,poseInWorld(pose,view,!effect));flight=null;const outcome=applyResult(state,result);if(wasDestroying)state.phase='destroying';
        if(outcome.shake)shakeUntil=clock+.16;recordWallHole(result);spawnDust(result.position,outcome.kind);playSound(outcome.kind==='smash'?'smash':result.force+1e-9>=CONFIG.smashForce?'full-impact':outcome.kind);
        const cup=result.zone==='bull'?'特大杯':result.zone==='rim'?'中杯':'大杯';
        if(outcome.kind==='smash'){beginDestruction('smash');showFeedback('罗老师，别这样',`+${outcome.points}`,true,1.9);}
        else if(outcome.kind==='drop'){beginDestruction('drop');showFeedback('理解万岁',`+${outcome.points}`,true,1.9);playSound('cheer');}
        else if(outcome.kind==='escape'){beginDestruction('escape');showFeedback(cup,`+${outcome.points}`);}
        else if(result.hit)showFeedback(cup,`+${outcome.points}`);
        else showFeedback('差一点','');
        updateHud();
      }
    }
    if(effect){effect.time+=dt;if(effect.time>=effect.duration){freshBoard(false,true);}}
    if(state.phase==='replacing'&&clock>=replaceUntil){state.phase='ready';updateHud();}
    if(mayhem.mode==='ending'&&clock-endingAt>=(reducedMotion?.2:slingBreak?.9:.5)){mayhem.mode='coffee';mayhemView.showCoffee();updateHud();}
    if(feedbackUntil&&clock>feedbackUntil){ui.feedback.className='feedback';feedbackUntil=0;}
    const pose=currentBoardPose();
    const hammerAnimating=mayhem.mode!=='normal'&&(clock<hammerLayoutUntil||(slingBreak&&!slingBreak.landed)||(hammerShatter&&!hammerShatter.complete)||(hammerFall&&!hammerFall.complete)||(mayhem.mode==='hammer'&&BREAKABLES.length-mayhem.damaged.length<=3));
    const animating=intro==='entering'||flight||effect||particles.length||state.phase!=='ready'||clock<shakeUntil||clock-reboundAt<.35||motionIsActive(motion,clock)||boardPointer||hammerAnimating;
    if(needsRedraw||animating){drawBackground();drawMount();drawBoard();drawTrajectory();drawFlight();drawEffects(dt);drawHammerFragments();drawSling();if(hammerFall&&pose.landed)hammerFall.complete=true;needsRedraw=false;}
    canvas.dataset.boardX=String(pose.x);canvas.dataset.boardY=String(pose.y);canvas.dataset.boardScale=String(pose.scale||1);canvas.dataset.boardRotation=String(pose.rotation);canvas.dataset.phase=state.phase;canvas.dataset.boardState=hammerShatter?'shattered':hammerFall?'whole':'hanging';canvas.dataset.boardLanded=String(!!pose.landed);
    if(mayhem.mode!=='normal'||mayhemView.rewardOpen){const rect=canvas.getBoundingClientRect();mayhemView.frame(clock,{x:rect.x+pose.x,y:rect.y+pose.y+view.radius*.65},BREAKABLES.filter(id=>!mayhem.damaged.includes(id)||(id==='sling'&&mayhem.slingStrikes<2)));}
  }
  requestAnimationFrame(frame);
}
const portraitsReady=Promise.all(portraits.map((portrait,i)=>new Promise(resolve=>{
  portrait.onload=()=>resolve(true);portrait.onerror=()=>resolve(false);portrait.src=new URL(`./assets/${portraitStyles[i].file}`,import.meta.url).href;
})));
// Prepare the recording before showing a playable board; decoding needs no playback permission.
Promise.all([portraitsReady,soundEnabled?prepareAudio():null]).then(([results])=>{buildTextures();loaded=true;ui.loading.classList.add('done');if(results.some(ok=>!ok))showFeedback('头像未加载','请刷新页面再试一次',false,8);updateHud();});
buildTextures();resize();updateHud();updateSoundButton();new ResizeObserver(resize).observe(canvas);requestAnimationFrame(frame);
