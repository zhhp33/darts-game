import {CONFIG,clamp,makeShot,positionAt,resolveFlight,createGameState,applyResult,replaceBoard,constrainPull} from './physics.js?v=3';
import {makeFragments,makeImpactCracks} from './fracture.js?v=3';

const canvas=document.querySelector('#game');
const ctx=canvas.getContext('2d',{alpha:false});
const ui=Object.fromEntries(['score','shots','accuracy','darts','feedback','power-value','power-fill','power-hint','pull-hint','replace','restart','sound','loading'].map(id=>[id,document.getElementById(id)]));
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let state=createGameState(),width=0,height=0,view=null,pull={dx:0,dy:0},pointerId=null,pointerStart=null;
let flight=null,effect=null,particles=[],clock=0,lastFrame=performance.now(),feedbackUntil=0,shakeUntil=0,replaceUntil=0,reboundAt=-10;
let loaded=false,soundEnabled=true,audio=null;
let slapBuffer=null,slapDecode=null;
const slapData=fetch(new URL('./assets/shatter-slap.wav',import.meta.url)).then(response=>{if(!response.ok)throw new Error('Slap asset unavailable');return response.arrayBuffer();}).catch(()=>null);
let needsRedraw=true,backgroundReady=false;
let wallHoles=[];
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
  const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;
  const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  const radius=Math.min(height*.232,width*.348);
  const cy=width<340?height*.42:width<600?height*.375:height*.351;
  view={cx:width*.5,cy,radius,maxPull:Math.min(156,height*.23,width*.30),slingScale:clamp(width/650,.72,1)};
  const origin=project({x:0,y:1.45,z:0});view.sx=origin.x;view.sy=origin.y;view.maxPull=Math.min(view.maxPull,height-view.sy-42);
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

function drawMount(){
  const x=view.cx,y=view.cy-view.radius-16;
  line(ctx,x,y+2,x,view.cy-view.radius+10,'#4c5546',3);
  circle(ctx,x,y,6,'#89927d');circle(ctx,x-.5,y-1,4,'#c3c9b5');circle(ctx,x,y,2.7,'#6c7563');line(ctx,x-2,y+1,x+2,y-1,'#444e3b',1);
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
function drawBoardDamage(){
  if(!state.fullPowerHits)return;
  const r=view.radius;
  ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.clip();
  state.crackHits.slice(0,3).forEach((hit,index)=>{
    for(const path of makeImpactCracks(hit,index)){
      ctx.beginPath();path.vertices.forEach((p,i)=>i?ctx.lineTo(p.x*r,p.y*r):ctx.moveTo(p.x*r,p.y*r));ctx.strokeStyle='#e8d2a466';ctx.lineWidth=path.lightWidth;ctx.stroke();ctx.strokeStyle='#191d12dd';ctx.lineWidth=path.darkWidth;ctx.stroke();
    }
  });ctx.restore();
}
function drawBoard(){
  if(effect?.kind==='smash')return;
  const r=view.radius,extent=r*512/480;
  let x=view.cx,y=view.cy,rotation=0,scale=1;
  if(effect?.kind==='drop'){
    const t=effect.time;x+=Math.sin(t*2)*r*.12;y+=height*.7*t*t;rotation=t*.6;
  }
  if(state.phase==='replacing'){const t=clamp(1-(replaceUntil-clock)/.35,0,1);scale=.85+.15*(1-(1-t)**3);}
  if(!reducedMotion&&clock<shakeUntil){x+=Math.sin(clock*90)*2.5;y+=Math.cos(clock*100)*1.5;}
  ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.scale(scale,scale);
  ctx.shadowColor='#45503e52';ctx.shadowBlur=r*.15;ctx.shadowOffsetX=r*.065;ctx.shadowOffsetY=r*.095;
  ctx.drawImage(board,-extent,-extent,extent*2,extent*2);ctx.shadowBlur=0;ctx.shadowOffsetX=ctx.shadowOffsetY=0;
  const cracks=state.darts.slice(0,11);
  cracks.forEach((d,i)=>{
    if(!d.firm)return;
    const x=d.x*r,y=-d.y*r,len=r*(.025+.002*(i+1)),angle=i*2.3;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(angle)*len*.5,y+Math.sin(angle)*len*.5);ctx.lineTo(x+Math.cos(angle+.5)*len,y+Math.sin(angle+.5)*len);ctx.strokeStyle='#13180ecc';ctx.lineWidth=1+(i+1)*.045;ctx.stroke();
  });
  drawBoardDamage();drawBoardDarts();ctx.restore();
}

function drawSling(){
  const s=view.slingScale,x=view.sx,y=view.sy;
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);
  const shadow=ctx.createRadialGradient(4,95,0,4,95,62);shadow.addColorStop(0,'#344a2850');shadow.addColorStop(1,'#344a2800');ctx.save();ctx.scale(1,.22);ctx.fillStyle=shadow;ctx.beginPath();ctx.ellipse(0,432,80,33,0,0,Math.PI*2);ctx.fill();ctx.restore();
  const wood=ctx.createLinearGradient(-45,0,30,10);wood.addColorStop(0,'#684122');wood.addColorStop(.18,'#a9743b');wood.addColorStop(.46,'#d2a566');wood.addColorStop(.65,'#a96e34');wood.addColorStop(1,'#634021');
  const branch=()=>{ctx.beginPath();ctx.moveTo(-37,-24);ctx.bezierCurveTo(-40,13,-30,25,-9,42);ctx.bezierCurveTo(-3,56,-4,73,-7,96);ctx.moveTo(37,-24);ctx.bezierCurveTo(40,12,29,31,-6,46);};
  ctx.lineCap='round';branch();ctx.strokeStyle='#513a24';ctx.lineWidth=30;ctx.shadowColor='#27301c44';ctx.shadowBlur=6;ctx.shadowOffsetX=4;ctx.shadowOffsetY=6;ctx.stroke();ctx.shadowBlur=0;ctx.shadowOffsetX=ctx.shadowOffsetY=0;
  branch();ctx.strokeStyle=wood;ctx.lineWidth=26;ctx.stroke();
  ctx.beginPath();ctx.moveTo(-39,-28);ctx.bezierCurveTo(-41,0,-35,14,-25,26);ctx.strokeStyle='#f0c38b88';ctx.lineWidth=2;ctx.stroke();
  ctx.beginPath();ctx.moveTo(34,-28);ctx.bezierCurveTo(36,-6,29,16,15,26);ctx.strokeStyle='#e6b67777';ctx.lineWidth=2;ctx.stroke();
  for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(-9+i*3,53);ctx.bezierCurveTo(-3+i*2,65,-8+i*2,82,-8+i*3,91);ctx.strokeStyle=i%2?'#6d451a55':'#d4a46866';ctx.lineWidth=1;ctx.stroke();}
  for(const side of [-1,1]){for(let i=0;i<4;i++)line(ctx,side*37-11,-27+i*3,side*37+10,-27+i*3,'#ccbb85',2.4);}
  ctx.restore();
  let dx=0,dy=0;
  if(state.phase==='aiming'){dx=pull.dx;dy=pull.dy;}
  else if(clock-reboundAt<.35){dy=Math.sin((clock-reboundAt)*65)*Math.exp(-(clock-reboundAt)*12)*16;}
  const px=x+dx,py=y+dy;
  for(const side of [-1,1]){
    const ax=x+side*37*s,ay=y-23*s;line(ctx,ax,ay,px,py,'#6d542b99',7*s);line(ctx,ax,ay-1,px,py-1,'#d6b268',4.5*s);line(ctx,ax,ay-2,px,py-2,'#edcf88aa',1.2*s);
  }
  ctx.save();ctx.translate(px,py);ctx.rotate(-dx*.002);ctx.fillStyle='#61422c';ctx.strokeStyle='#3c2c1e';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(-16*s,-7*s,32*s,15*s,6*s);ctx.fill();ctx.stroke();line(ctx,-11*s,3*s,11*s,3*s,'#b18a5866',1);ctx.restore();
  if(['ready','aiming'].includes(state.phase))drawDart(px,py-13*s,.84*s,-dx*.001);
}

function drawTrajectory(){
  if(state.phase!=='aiming'||Math.hypot(pull.dx,pull.dy)<5)return;
  const shot=makeShot({...pull,maxPull:view.maxPull}),result=resolveFlight(shot);
  // Show the initial arc only: no destination marker or automatic aim correction.
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
function beginDestruction(kind){
  effect={kind,time:0,shards:[]};
  if(kind==='smash'){
    const hit=state.darts.at(-1);effect.impact={x:hit.x,y:-hit.y};
    effect.shards=makeFragments(effect.impact,731+state.shots,reducedMotion?18:30);
  }
}
function fragmentPath(polygon,r,offset=0){ctx.beginPath();polygon.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x*r+offset,p.y*r+offset);else ctx.lineTo(p.x*r+offset,p.y*r+offset);});ctx.closePath();}
function drawEffects(dt){
  const r=view.radius,extent=r*512/480;
  if(effect?.kind==='smash'){
    const t=Math.max(0,effect.time-.08),gravity=height*1.5;
    effect.shards.forEach(shard=>{
      const c=shard.center,scale=r/180,vy=shard.vy*scale,floor=height*.89+c.y*r*.03,startY=view.cy+c.y*r;
      const landTime=Math.max(0,(-vy+Math.sqrt(vy*vy+2*gravity*Math.max(0,floor-startY)))/gravity),after=Math.max(0,t-landTime),moving=Math.min(t,landTime);
      const x=view.cx+c.x*r+shard.vx*scale*(moving+(1-Math.exp(-after*6))*.12);
      const y=t<landTime?startY+vy*t+.5*gravity*t*t:floor-Math.abs(Math.sin(after*16))*30*scale*Math.exp(-after*6);
      ctx.save();ctx.translate(x,y);ctx.rotate(shard.spin*(moving+after*.15));ctx.scale(Math.max(.28,Math.abs(Math.cos(shard.tilt*t))),1);ctx.translate(-c.x*r,-c.y*r);
      ctx.globalAlpha=clamp((2-effect.time)/.2,0,1);ctx.shadowColor='#2c3b2466';ctx.shadowBlur=9;ctx.shadowOffsetY=5;
      fragmentPath(shard.polygon,r,shard.thickness*scale);ctx.fillStyle=shard.red?'#89301f':'#9b8a5b';ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
      ctx.save();fragmentPath(shard.polygon,r);ctx.clip();ctx.drawImage(board,-extent,-extent,extent*2,extent*2);ctx.restore();
      fragmentPath(shard.polygon,r);ctx.strokeStyle=shard.red?'#f3a16b99':'#d8c99b99';ctx.lineWidth=Math.max(.8,1.4*scale);ctx.stroke();ctx.restore();
    });
    state.darts.forEach((dart,i)=>drawDart(view.cx+dart.x*r+(i%2?1:-1)*t*80,view.cy-dart.y*r-50*t+height*.5*t*t,Math.max(.37,r/320),t*(i%2?3:-3),clamp(2-t,0,1)));
  }
  particles.forEach(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=190*dt;ctx.globalAlpha=clamp(p.life*2,0,1);circle(ctx,p.x,p.y,p.size,p.color);});ctx.globalAlpha=1;particles=particles.filter(p=>p.life>0);
}

function updateHud(){
  needsRedraw=true;
  ui.score.textContent=state.score;ui.shots.textContent=state.shots;ui.accuracy.textContent=state.shots?`${Math.round(state.hits/state.shots*100)}%`:'—';ui.darts.textContent=state.darts.length;
  const force=state.phase==='aiming'?clamp(Math.hypot(pull.dx,pull.dy)/view.maxPull*CONFIG.maxForce,0,CONFIG.maxForce):0;
  const percentage=Math.floor(force*100+1e-7);ui['power-value'].innerHTML=`${percentage}<span>%</span>`;ui['power-fill'].style.width=`${force/CONFIG.maxForce*100}%`;
  document.querySelector('.power-panel').classList.toggle('hot',force+1e-9>=CONFIG.smashForce);
  ui['power-hint'].textContent=force+1e-9>=CONFIG.smashForce?'100%！松手发射':state.phase==='aiming'?'左右调整方向，松手发射':state.phase==='flying'?'飞镖飞行中…':state.phase==='destroying'?'正在挂上新靶盘…':'拉住弹弓，向后拖动';
  ui.replace.dataset.damage=String(state.fullPowerHits);canvas.dataset.wallHoles=String(wallHoles.length);
  ui.replace.dataset.portrait=String(portraitIndex);ui.replace.setAttribute('aria-label',`换个靶盘，当前${portraitStyles[portraitIndex].name}`);
  ui.replace.disabled=!loaded||state.phase!=='ready';
  ui['pull-hint'].style.opacity=state.phase==='ready'&&state.shots<3?'1':'0';
}
function showFeedback(head,text,impact=false,duration=1.45,badge=''){
  ui.feedback.replaceChildren();const strong=document.createElement('strong');strong.textContent=head;ui.feedback.append(strong,document.createTextNode(text));if(badge){const small=document.createElement('small');small.textContent=badge;ui.feedback.append(small);}ui.feedback.className=`feedback visible${impact?' impact':''}`;feedbackUntil=clock+duration;
}
function updateSoundButton(){ui.sound.setAttribute('aria-pressed',String(soundEnabled));ui.sound.setAttribute('aria-label',soundEnabled?'关闭声音':'开启声音');ui.sound.title=soundEnabled?'关闭声音':'开启声音';}
function unlockAudio(){
  if(!soundEnabled)return;
  try{
    audio??=new (window.AudioContext||window.webkitAudioContext)();
    if(audio.state==='suspended')audio.resume().catch(()=>{});
    slapDecode??=slapData.then(bytes=>bytes?audio.decodeAudioData(bytes):null).then(buffer=>{slapBuffer=buffer;}).catch(()=>{});
  }catch{}
}
function playSound(kind){
  if(!soundEnabled||!audio||audio.state!=='running')return;
  try{
    if(kind==='smash'){
      const requestedAt=clock;
      const strike=()=>{
        if(!slapBuffer||!soundEnabled||audio.state!=='running'||state.phase!=='destroying'||clock-requestedAt>.8)return;
        const now=audio.currentTime;
        for(const offset of [0,.4,.8]){
          const src=audio.createBufferSource();src.buffer=slapBuffer;src.connect(audio.destination);src.start(now+offset);
        }
      };
      if(slapBuffer)strike();else slapDecode?.then(strike);
      return;
    }
    if(kind==='full-impact'){
      const now=audio.currentTime;
      for(const offset of [0]){
        const start=now+offset,length=.14,buffer=audio.createBuffer(1,Math.floor(audio.sampleRate*length),audio.sampleRate),data=buffer.getChannelData(0);
        for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*7);
        const src=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();src.buffer=buffer;filter.type='highpass';filter.frequency.value=500;gain.gain.setValueAtTime(.16,start);gain.gain.exponentialRampToValueAtTime(.001,start+length);src.connect(filter);filter.connect(gain);gain.connect(audio.destination);src.start(start);src.stop(start+length);
      }return;
    }
    const t=audio.currentTime,volume=audio.createGain();volume.connect(audio.destination);volume.gain.setValueAtTime(.08,t);volume.gain.exponentialRampToValueAtTime(.001,t+.2);
    if(['drop','miss'].includes(kind)){
      const length=.24,buffer=audio.createBuffer(1,Math.floor(audio.sampleRate*length),audio.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*4);
      const src=audio.createBufferSource(),filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=450;src.buffer=buffer;src.connect(filter);filter.connect(volume);src.start(t);src.stop(t+length);
    }else{
      const osc=audio.createOscillator();osc.type='triangle';osc.frequency.setValueAtTime(kind==='release'?260:180,t);osc.frequency.exponentialRampToValueAtTime(kind==='release'?65:55,t+.18);osc.connect(volume);osc.start(t);osc.stop(t+.2);
    }
  }catch{}
}

function cancelAim(){
  const id=pointerId;pointerId=null;pointerStart=null;
  if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
  if(state.phase==='aiming')state.phase='ready';pull={dx:0,dy:0};if(view)updateHud();
}
function limitPull(dx,dy){return constrainPull(dx,dy,view,width,height);}
function launch(){
  if(state.phase!=='aiming'||!loaded)return;
  if(Math.hypot(pull.dx,pull.dy)<3){cancelAim();return;}
  const shot=makeShot({...pull,maxPull:view.maxPull});flight={shot,result:resolveFlight(shot),time:0};
  state.phase='flying';pull={dx:0,dy:0};reboundAt=clock;playSound('release');updateHud();
}
function eventPoint(e){const rect=canvas.getBoundingClientRect();return {x:(e.clientX-rect.left)*width/rect.width,y:(e.clientY-rect.top)*height/rect.height};}
canvas.addEventListener('pointerdown',e=>{
  if(!loaded||state.phase!=='ready'||pointerId!==null||!e.isPrimary||(e.pointerType==='mouse'&&e.button!==0))return;
  const p=eventPoint(e);if(Math.hypot(p.x-view.sx,p.y-view.sy)>65*view.slingScale)return;
  e.preventDefault();canvas.focus({preventScroll:true});unlockAudio();pointerId=e.pointerId;pointerStart=p;canvas.setPointerCapture(pointerId);state.phase='aiming';pull={dx:0,dy:0};updateHud();
});
canvas.addEventListener('pointermove',e=>{if(e.pointerId!==pointerId||state.phase!=='aiming')return;e.preventDefault();const p=eventPoint(e);pull=limitPull(p.x-pointerStart.x,p.y-pointerStart.y);updateHud();});
canvas.addEventListener('pointerup',e=>{if(e.pointerId!==pointerId)return;const p=eventPoint(e);pull=limitPull(p.x-pointerStart.x,p.y-pointerStart.y);const id=pointerId;pointerId=null;pointerStart=null;if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);launch();});
canvas.addEventListener('pointercancel',e=>{if(e.pointerId===pointerId)cancelAim();});
canvas.addEventListener('lostpointercapture',e=>{if(e.pointerId===pointerId)cancelAim();});
canvas.addEventListener('blur',()=>{if(state.phase==='aiming')cancelAim();});
canvas.addEventListener('keydown',e=>{
  if(!loaded||!['ready','aiming'].includes(state.phase)||pointerId!==null)return;
  if(e.key==='Escape'){e.preventDefault();cancelAim();return;}
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
    e.preventDefault();if(state.phase==='ready'){state.phase='aiming';pull={dx:0,dy:view.maxPull*.65/CONFIG.maxForce};}
    pull=limitPull(pull.dx+(e.key==='ArrowLeft'?-7:e.key==='ArrowRight'?7:0),pull.dy+(e.key==='ArrowDown'?7:e.key==='ArrowUp'?-7:0));updateHud();
  }else if(e.code==='Space'||e.key==='Enter'){
    e.preventDefault();unlockAudio();if(state.phase==='ready'){state.phase='aiming';pull={dx:0,dy:view.maxPull*.65/CONFIG.maxForce};}launch();
  }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelAim();lastFrame=performance.now();});
function freshBoard(clearScore=false,cyclePortrait=false){
  cancelAim();if(clearScore)state=createGameState();else replaceBoard(state);
  if(cyclePortrait){portraitIndex=(portraitIndex+1)%portraitStyles.length;buildTextures();}
  flight=null;effect=null;particles=[];pull={dx:0,dy:0};shakeUntil=0;feedbackUntil=0;ui.feedback.replaceChildren();ui.feedback.className='feedback';state.phase='replacing';replaceUntil=clock+.35;updateHud();
}
ui.replace.addEventListener('click',()=>{if(state.phase==='ready')freshBoard(false,true);});ui.restart.addEventListener('click',()=>freshBoard(true));
ui.sound.addEventListener('click',()=>{soundEnabled=!soundEnabled;try{localStorage.setItem('slingshot-sound',soundEnabled?'on':'off');}catch{}if(soundEnabled)unlockAudio();updateSoundButton();});

function frame(now){
  const dt=document.hidden?0:Math.min((now-lastFrame)/1000,.05);lastFrame=now;clock+=dt;
  if(view){
    if(flight){
      flight.time+=dt;
      if(flight.time>=flight.result.time){
        const result=flight.result;flight=null;const outcome=applyResult(state,result);if(outcome.shake)shakeUntil=clock+.16;recordWallHole(result);spawnDust(result.position,outcome.kind);playSound(outcome.kind==='smash'?'smash':result.force+1e-9>=CONFIG.smashForce?'full-impact':outcome.kind);
        const cup=result.zone==='bull'?'特大杯':result.zone==='rim'?'中杯':'大杯';
        if(outcome.kind==='smash'){beginDestruction('smash');showFeedback('罗老师，别这样',`+${outcome.points}`,true,1.9);}
        else if(outcome.kind==='drop'){beginDestruction('drop');showFeedback(cup,`+${outcome.points}`);}
        else if(result.hit)showFeedback(cup,`+${outcome.points}`);
        else showFeedback('差一点','再调整方向试试');
        updateHud();
      }
    }
    if(effect){effect.time+=dt;if(effect.time>=CONFIG.replacementTime){freshBoard(false,true);}}
    if(state.phase==='replacing'&&clock>=replaceUntil){state.phase='ready';updateHud();}
    if(feedbackUntil&&clock>feedbackUntil){ui.feedback.className='feedback';feedbackUntil=0;}
    const animating=flight||effect||particles.length||state.phase!=='ready'||clock<shakeUntil||clock-reboundAt<.35;
    if(needsRedraw||animating){drawBackground();drawMount();drawBoard();drawTrajectory();drawFlight();drawEffects(dt);drawSling();needsRedraw=false;}
  }
  requestAnimationFrame(frame);
}
Promise.all(portraits.map((portrait,i)=>new Promise(resolve=>{
  portrait.onload=()=>resolve(true);portrait.onerror=()=>resolve(false);portrait.src=new URL(`./assets/${portraitStyles[i].file}`,import.meta.url).href;
}))).then(results=>{buildTextures();loaded=true;ui.loading.classList.add('done');if(results.some(ok=>!ok))showFeedback('头像未加载','请刷新页面再试一次',false,8);updateHud();});
buildTextures();resize();updateHud();updateSoundButton();new ResizeObserver(resize).observe(canvas);requestAnimationFrame(frame);
