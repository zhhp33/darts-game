import {makeSurfaceCracks} from './fracture.js?v=varied-cracks-2';
import {createDamageStamp,createDamageLayer} from './damage-view.js?v=4';

export function createMayhemView({reducedMotion,onStrike,onCollect,onReset,onCancel}){
  const reward=document.querySelector('#hammer-reward'),cursor=document.querySelector('#hammer-cursor'),coffee=document.querySelector('#coffee-screen'),canvas=document.querySelector('#mayhem-effects'),ctx=canvas.getContext('2d');
  const elements={sound:document.querySelector('#sound'),score:document.querySelector('.scoreboard'),restart:document.querySelector('#restart'),replace:document.querySelector('#replace'),brand:document.querySelector('.brand'),power:document.querySelector('.power-panel')};
  const brandParts={logo:document.querySelector('.brand-mark'),title:document.querySelector('.brand h1')};
  let mode='normal',pointer=null,mouse={x:-200,y:-200},strokeAt=-10,breakAt=-10,shards=[],impacts=[],seed=71,oldFocus=null,rewardArmed=false;
  const fallingAnimations=new Map(),wallDamage=createDamageLayer();
  let effectsDirty=true,effectsUntil=-1,effectsAnimating=false,lastScrollX=scrollX,lastScrollY=scrollY;
  const sizes=()=>({width:innerWidth,height:innerHeight});
  function resize(){effectsDirty=true;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(innerWidth*dpr);canvas.height=Math.round(innerHeight*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
  addEventListener('resize',resize);resize();
  reward.addEventListener('pointerdown',()=>{rewardArmed=true;});
  reward.addEventListener('click',e=>{
    e.stopPropagation();
    // A touch release on the portrait can dispatch a later compatibility click.
    // Require a new press on the reward, or an explicit keyboard activation.
    if(!rewardArmed&&e.detail!==0){e.preventDefault();return;}
    const r=reward.getBoundingClientRect();onCollect();if(mode==='hammer')hammerPoint({clientX:e.clientX||r.x+r.width/2,clientY:e.clientY||r.y+r.height/2,pointerType:e.pointerType||'mouse'});
  });
  coffee.querySelector('button').addEventListener('click',onReset);
  function isControl(target){return target instanceof Element&&(target.closest('#coffee-screen')||target.closest('#hammer-reward'));}
  function hammerPoint(e){mouse={x:e.clientX,y:e.clientY};cursor.style.left=`${Math.max(30,Math.min(innerWidth-50,mouse.x))}px`;cursor.style.top=`${Math.max(70,Math.min(innerHeight-15,mouse.y-(e.pointerType==='touch'?48:0)))}px`;cursor.hidden=false;}
  document.addEventListener('pointerdown',e=>{
    if(mode!=='hammer'||isControl(e.target)||!e.isPrimary||(e.pointerType==='mouse'&&e.button!==0))return;
    e.stopImmediatePropagation();if(e.pointerType!=='touch')e.preventDefault();
    pointer={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};hammerPoint(e);
  },true);
  document.addEventListener('pointermove',e=>{
    if(mode!=='hammer')return;
    if(e.pointerType==='mouse'||pointer?.id===e.pointerId)hammerPoint(e);
    if(pointer?.id===e.pointerId&&Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>8)pointer.moved=true;
  },true);
  document.addEventListener('pointerup',e=>{
    if(mode!=='hammer'||pointer?.id!==e.pointerId)return;
    e.stopImmediatePropagation();const hit=!pointer.moved;pointer=null;
    if(hit){e.preventDefault();onStrike({x:e.clientX,y:e.clientY,pointerType:e.pointerType});}
  },true);
  document.addEventListener('pointercancel',()=>{pointer=null;cursor.hidden=true;},true);
  document.addEventListener('click',e=>{
    if(['hammer','ending'].includes(mode)&&!isControl(e.target)){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  document.addEventListener('keydown',e=>{
    if(mode==='normal'&&e.key==='Escape'&&!reward.hidden){reward.hidden=true;onCancel();return;}
    if(mode!=='hammer'||!['Enter',' '].includes(e.key)||isControl(e.target))return;
    e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;
    const el=Object.values(elements).find(el=>el===e.target||el.contains(e.target));
    if(el){const r=el.getBoundingClientRect();onStrike({x:r.x+r.width/2,y:r.y+r.height/2,pointerType:'keyboard'});}
  },true);
  function showReward(){oldFocus=document.activeElement;rewardArmed=false;reward.hidden=false;reward.focus({preventScroll:true});}
  function hideReward(){reward.hidden=true;if(document.activeElement===reward)oldFocus?.focus({preventScroll:true});}
  function setMode(next){effectsDirty=true;mode=next;pointer=null;document.body.classList.toggle('hammer-mode',next==='hammer'||next==='ending');if(next!=='normal')hideReward();if(next!=='hammer')cursor.hidden=true;}
  function tossLogo(el,dx,dy,scale,rotation){
    const frames=[],flightFraction=.78,lift=-Math.min(120,Math.max(42,dy*.12)),bounceHeight=reducedMotion?4:14;
    const transform=(x,y,angle,size)=>`translate(${x}px,${y}px) rotate(${angle}deg) scale(${size})`;
    // Equal time samples follow constant horizontal speed and gravitational acceleration.
    for(let i=0;i<=20;i++){
      const t=i/20;
      frames.push({offset:t*flightFraction,transform:transform(dx*t,lift*t+(dy-lift)*t*t,-5+(rotation+5)*t,1+(scale-1)*t)});
    }
    for(let i=1;i<=10;i++){
      const t=i/10;
      frames.push({offset:flightFraction+(1-flightFraction)*t,transform:transform(dx,dy-4*bounceHeight*t*(1-t),rotation+4*Math.sin(t*Math.PI),scale)});
    }
    const animation=el.animate(frames,{duration:reducedMotion?200:1120,easing:'linear'});
    fallingAnimations.set(el,animation);
    animation.finished.then(()=>{if(fallingAnimations.get(el)===animation)fallingAnimations.delete(el);}).catch(()=>{});
  }
  function markDamage(id,point){
    if(id==='brand'){Object.keys(brandParts).forEach(part=>markDamage(part,point));return;}
    const el=elements[id]||brandParts[id];if(!el)return;
    const rect=el.getBoundingClientRect();
    if(!el.classList.contains('is-broken')){
      el.classList.add('breakable-surface','is-broken');el.dataset.broken='true';
      if(['restart','replace','logo'].includes(id)){
        // Transform only: the original layout stays in place, while the object remains reachable.
        const arena=document.querySelector('.arena').getBoundingClientRect(),scale=id==='logo'?.76:1;
        const rotation=id==='logo'?-24:9,angle=rotation*Math.PI/180,halfW=(rect.width*Math.cos(angle)+rect.height*Math.abs(Math.sin(angle)))*scale/2,halfH=(rect.height*Math.cos(angle)+rect.width*Math.abs(Math.sin(angle)))*scale/2;
        const x=id==='replace'?rect.x+rect.width/2-8:Math.max(halfW+10,Math.min(innerWidth-halfW-10,arena.x+arena.width*(id==='logo'?.16:.84)));
        const y=id==='logo'?Math.min(innerHeight-halfH-12,arena.bottom-halfH-16):id==='replace'?Math.min(innerHeight-halfH-12,rect.y+rect.height/2+22):Math.max(halfH+10,Math.min(innerHeight-halfH-12,arena.y+arena.height*.58));
        const dx=x-rect.x-rect.width/2,dy=y-rect.y-rect.height/2;
        el.style.setProperty('--fall-y',`${dy}px`);el.style.setProperty('--fall-x',`${dx}px`);el.style.setProperty('--fall-scale',String(scale));el.style.setProperty('--fall-rotation',`${rotation}deg`);el.classList.add('object-fallen');
        if(id==='logo'){el.classList.add('logo-falling');tossLogo(el,dx,dy,scale,rotation);}
      }
      if(id==='title')el.classList.add('title-hanging');
    }
    const previous=el.querySelectorAll('.surface-cracks');if(previous.length>=8)previous[0].remove();
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('surface-cracks');svg.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);svg.setAttribute('aria-hidden','true');
    const scale=Math.min(80,Math.max(25,rect.width*.48)),x=Math.max(0,Math.min(rect.width,point.x-rect.x)),y=Math.max(0,Math.min(rect.height,point.y-rect.y));
    for(const path of makeSurfaceCracks(++seed)){
      const d=path.map((p,i)=>`${i?'L':'M'}${x+p.x*scale},${y+p.y*scale}`).join(' ');
      for(const [color,width,offset] of [['#fff8dfbb',2,1],['#3b4235dd',1,0]]){
        const line=document.createElementNS(svg.namespaceURI,'path');line.setAttribute('d',d);line.setAttribute('stroke',color);line.setAttribute('stroke-width',width);line.setAttribute('fill','none');line.setAttribute('transform',`translate(${offset} ${offset})`);svg.append(line);
      }
    }
    el.append(svg);
  }
  function strike(point,time,{background=false,points=null}={}){
    effectsDirty=true;effectsUntil=time+.9;strokeAt=time;cursor.classList.remove('hammer-striking');void cursor.offsetWidth;cursor.classList.add('hammer-striking');
    if(background){wallDamage.add(createDamageStamp(++seed,'wall'),{x:point.x+scrollX-48,y:point.y+scrollY-48,size:96,width:Math.max(innerWidth,document.documentElement.scrollWidth),height:Math.max(innerHeight,document.documentElement.scrollHeight)});canvas.dataset.wallMarks=String(wallDamage.count);}
    impacts.push({x:point.x,y:point.y,time,points,background});
    impacts=impacts.filter(p=>time-p.time<1).slice(-24);
  }
  function breakHammer(point,time){
    effectsDirty=true;effectsUntil=time+1.2;breakAt=time;cursor.hidden=true;shards=[];
    for(let i=0;i<16;i++)shards.push({x:point.x+(i%4-1.5)*9,y:point.y-32+Math.floor(i/4)*11,vx:Math.cos(i*2.4)*(65+i*5),vy:-80-Math.sin(i*1.7)*80,spin:(i%2?1:-1)*(2+i*.3),wood:i>9});
  }
  function showCoffee(){setMode('coffee');coffee.hidden=false;coffee.querySelector('button').focus({preventScroll:true});}
  function restore(){
    setMode('normal');coffee.hidden=true;hideReward();cursor.hidden=true;shards=[];impacts=[];breakAt=-10;wallDamage.clear();canvas.dataset.wallMarks='0';
    fallingAnimations.forEach(animation=>animation.cancel());fallingAnimations.clear();
    Object.values({...elements,...brandParts}).forEach(el=>{el.classList.remove('breakable-surface','is-broken','object-fallen','logo-falling','title-hanging','mayhem-hint');delete el.dataset.broken;['--fall-y','--fall-x','--fall-rotation','--fall-scale'].forEach(key=>el.style.removeProperty(key));el.querySelectorAll('.surface-cracks').forEach(s=>s.remove());});
    ctx.clearRect(0,0,innerWidth,innerHeight);
  }
  function frame(time,anchor,remaining){
    const {width,height}=sizes();
    if(!reward.hidden&&anchor){reward.style.left=`${Math.max(85,Math.min(width-85,anchor.x))}px`;reward.style.top=`${Math.max(95,Math.min(height-110,anchor.y))}px`;}
    Object.entries(elements).forEach(([id,el])=>el.classList.toggle('mayhem-hint',mode==='hammer'&&remaining.length<=3&&remaining.includes(id)));
    const active=time<effectsUntil,scrolled=scrollX!==lastScrollX||scrollY!==lastScrollY;
    if(!effectsDirty&&!active&&!effectsAnimating&&!scrolled)return;
    effectsDirty=false;effectsAnimating=active;lastScrollX=scrollX;lastScrollY=scrollY;ctx.clearRect(0,0,width,height);wallDamage.paint(ctx,-scrollX,-scrollY);
    impacts.forEach(p=>{
      const age=time-p.time;
      if(!reducedMotion&&age<.35){ctx.globalAlpha=1-age/.35;ctx.fillStyle=p.background?'#e4dfc8':'#c2a16e';for(let i=0;i<3;i++){const side=i-1;ctx.fillRect(p.x+side*(5+age*24),p.y-4-age*16+age*age*180+i*3,2,2);}ctx.globalAlpha=1;}
      if(p.points!==null&&age<.85){ctx.globalAlpha=Math.min(1,(.85-age)*3);ctx.fillStyle='#a44429';ctx.font='700 24px -apple-system, sans-serif';ctx.textAlign='center';ctx.fillText(`+${p.points}`,Math.max(40,Math.min(width-40,p.x)),Math.max(30,p.y-20-age*36));ctx.globalAlpha=1;}
    });
    if(breakAt>=0&&time-breakAt<1.1){
      const t=time-breakAt;shards.forEach(p=>{ctx.save();ctx.translate(p.x+p.vx*t,p.y+p.vy*t+330*t*t);ctx.rotate(p.spin*t);ctx.globalAlpha=Math.max(0,1-t/1.1);ctx.fillStyle=p.wood?'#ae7748':'#7e8c80';ctx.strokeStyle=p.wood?'#59402b':'#36433a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-6,-6);ctx.lineTo(7,-3);ctx.lineTo(5,7);ctx.lineTo(-5,4);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();});
    }
    if(time-strokeAt>.3)cursor.classList.remove('hammer-striking');
  }
  function clearScorePopups(){effectsDirty=true;impacts.forEach(p=>p.points=null);}
  return {elements,get hitElements(){return Object.entries({...elements,...brandParts}).map(([id,el])=>[id in brandParts?'brand':id,el]);},showReward,hideReward,setMode,markDamage,strike,breakHammer,showCoffee,restore,frame,clearScorePopups,get rewardOpen(){return !reward.hidden;}};
}
