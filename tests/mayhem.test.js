import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameState,makeShot,resolveFlight,applyResult,CONFIG,replaceBoard} from '../dist/physics.js';
import {SWING,createBoardMotion,sampleMotion,releaseBoard,boardPose,poseInWorld,localPoint,shouldFling,motionIsActive,advanceSwingTier} from '../dist/motion.js';
import {slingPartPoses} from '../dist/sling-motion.js';
import {createDamageLayer} from '../dist/damage-view.js';
import {BREAKABLES,createMayhemState,strikeMayhem,ropeFallMode} from '../dist/mayhem.js';
import {makeSurfaceCracks,makeFragments,fallingFragmentPose} from '../dist/fracture.js';

test('the same flight can hit a stationary target and miss a moving target without scoring or cracking',()=>{
  const shot=makeShot({dx:0,dy:100,maxPull:100,scatterSeed:91}),stationary=resolveFlight(shot),moving=resolveFlight(shot,{x:3,y:CONFIG.boardY,rotation:.3});
  assert.equal(stationary.hit,true);assert.equal(moving.hit,false);assert.deepEqual(moving.position,stationary.position);
  const state=createGameState();assert.equal(applyResult(state,moving).points,0);assert.equal(state.fullPowerHits,0);assert.equal(state.darts.length,0);
  assert.equal(resolveFlight(shot,{x:0,y:CONFIG.boardY,rotation:0,active:false}).hit,false);
});
test('rotated moving-board scoring, embedded darts and screen coordinates share one transform',()=>{
  const view={cx:400,cy:240,radius:160},m=createBoardMotion(2),pose=boardPose(m,view,.5),world=poseInWorld(pose,view),rotation=pose.rotation;
  for(const [x,y,zone] of [[0,0,'bull'],[.42,.1,'face'],[.8,0,'rim']]){
    const px=pose.x+(x*Math.cos(rotation)+y*Math.sin(rotation))*view.radius,py=pose.y+(x*Math.sin(rotation)-y*Math.cos(rotation))*view.radius;
    const local=localPoint({x:px,y:py},pose,view.radius);assert.ok(Math.abs(local.x-x)<1e-9);assert.ok(Math.abs(local.y+y)<1e-9);
    const time=CONFIG.depth/15,targetX=(px-view.cx)/view.radius,targetY=CONFIG.boardY-(py-view.cy)/view.radius;
    const shot={force:.8,x:0,y:1.45,z:0,vx:targetX/time,vy:(targetY-1.45+.5*CONFIG.gravity*time*time)/time,vz:15};
    const result=resolveFlight(shot,world),state=createGameState();assert.equal(result.zone,zone);applyResult(state,result);
    assert.ok(Math.abs(state.darts[0].x-x)<1e-9);assert.ok(Math.abs(state.darts[0].y-y)<1e-9);
  }
});
test('losses advance 0/6/14/28 degrees; the fourth escape resets the cycle and manual replacement keeps progress',()=>{
  const state=createGameState();for(let tier=1;tier<=3;tier++){advanceSwingTier(state,tier%2?'smash':'drop');replaceBoard(state);assert.equal(state.swingTier,tier);assert.ok(SWING.amplitudes[tier]>SWING.amplitudes[tier-1]);}
  const motion=createBoardMotion(3,10);assert.equal(motionIsActive(motion,1000),true);advanceSwingTier(state,'escape');assert.equal(state.swingTier,0);
  state.swingTier=3;advanceSwingTier(state,'smash');assert.equal(state.swingTier,0);
});
test('a slow manual release is continuous and decays; only a deliberate fast swipe detaches',()=>{
  const motion=createBoardMotion();motion.dragAngle=.4;releaseBoard(motion,.4,1,1);assert.ok(Math.abs(sampleMotion(motion,1).angle-.4)<1e-9);
  assert.ok(Math.abs(sampleMotion(motion,7).angle)>.08);assert.equal(motionIsActive(motion,7),true);
  assert.ok(Math.abs(sampleMotion(motion,35).angle)<.001);assert.equal(motionIsActive(motion,40),false);
  assert.equal(shouldFling(29,1000,200),false);assert.equal(shouldFling(30,799,200),false);assert.equal(shouldFling(30,800,200),true);
  motion.settle={angle:.4,at:2};assert.equal(sampleMotion(motion,2.32).angle,0);
});
test('manual motion visibly completes at least three round trips instead of stopping after five seconds',()=>{
  const m=createBoardMotion();releaseBoard(m,.35,0,0);let crossings=0,previous=sampleMotion(m,0).angle;
  for(let t=.02;t<=6.2;t+=.02){const current=sampleMotion(m,t).angle;if(current*previous<0)crossings++;previous=current;}
  assert.ok(crossings>=6);assert.equal(motionIsActive(m,6.2),true);assert.ok(Math.abs(sampleMotion(m,6).angle)>.07);
});
test('the fourth board escapes on its sixth valid hit; misses do not count',()=>{
  for(const force of [.5,.99]){
    const state=createGameState();state.swingTier=3;const result=resolveFlight(makeShot({dx:0,dy:force*100,maxPull:100,scatterSeed:13}));
    for(let i=1;i<=5;i++){const out=applyResult(state,result);assert.notEqual(out.kind,'smash');assert.notEqual(out.kind,'escape');assert.equal(state.phase,'ready');assert.equal(state.darts.length,i);}
    const before=state.score;applyResult(state,{...result,hit:false,zone:'miss'});assert.equal(state.darts.length,5);assert.equal(state.score,before);
    const last=applyResult(state,result);assert.equal(last.kind,'escape');assert.equal(state.darts.length,6);assert.equal(state.destroyed,0);assert.equal(state.phase,'destroying');assert.ok([5,10,50].includes(last.points));
    assert.equal(state.score,before+last.points);advanceSwingTier(state,last.kind);replaceBoard(state);assert.equal(state.swingTier,0);assert.equal(state.darts.length,0);
  }
});
test('four full-power hits still shatter the fourth board early; shattering takes priority on a simultaneous sixth hit',()=>{
  const full=resolveFlight(makeShot({dx:0,dy:100,maxPull:100,scatterSeed:13})),normal=resolveFlight(makeShot({dx:0,dy:65,maxPull:100}));
  for(const normalHits of [0,2]){
    const state=createGameState();state.swingTier=3;for(let i=0;i<normalHits;i++)applyResult(state,normal);
    for(let i=0;i<3;i++){assert.notEqual(applyResult(state,full).kind,'smash');assert.equal(state.phase,'ready');}
    const before=state.score,last=applyResult(state,full);assert.equal(last.kind,'smash');assert.equal(last.points,100);assert.equal(state.score,before+100);assert.equal(state.dropped,0);assert.equal(state.destroyed,1);assert.equal(state.darts.length,normalHits+4);
    advanceSwingTier(state,last.kind);assert.equal(state.swingTier,0);
  }
});
test('manual replacement on the fourth board restarts its six-hit count without resetting the stage',()=>{
  const state=createGameState();state.swingTier=3;const result=resolveFlight(makeShot({dx:0,dy:65,maxPull:100}));
  for(let i=0;i<5;i++)applyResult(state,result);const score=state.score;replaceBoard(state);assert.equal(state.swingTier,3);assert.equal(state.score,score);
  for(let i=1;i<=6;i++)assert.equal(applyResult(state,result).kind,i===6?'escape':'bull');
});
test('all distinct objects complete in any tested order, repeated strikes never advance progress twice',()=>{
  const orders=BREAKABLES.flatMap((_,i)=>{const order=[...BREAKABLES.slice(i),...BREAKABLES.slice(0,i)];return [order,[...order].reverse()];});
  for(const order of orders){
    const s=createMayhemState();s.mode='hammer';
    order.forEach((id,i)=>{
      const result=strikeMayhem(s,id);assert.equal(result.first,true);assert.equal(result.complete,i===order.length-1&&id!=='sling');assert.equal(s.damaged.length,i+1);
      if(id==='sling'){assert.equal(strikeMayhem(s,id).complete,i===order.length-1);assert.equal(s.slingStrikes,2);}
      if(i<order.length-1){strikeMayhem(s,id);assert.equal(s.damaged.length,i+1);assert.equal(s.mode,'hammer');}
    });assert.equal(s.mode,'ending');assert.equal(strikeMayhem(s,'board').points,0);
  }
});
test('the combined branding counts once while repeated strikes still give one strike award',()=>{
  const state=createMayhemState();state.mode='hammer';assert.equal(strikeMayhem(state,'brand').points,666);assert.deepEqual(state.damaged,['brand']);
  const repeat=strikeMayhem(state,'brand');assert.equal(repeat.points,666);assert.equal(repeat.first,false);assert.deepEqual(state.damaged,['brand']);
  assert.equal(BREAKABLES.length,9);assert.equal(BREAKABLES.includes('logo'),false);assert.equal(BREAKABLES.includes('title'),false);
});
test('airborne fragments stay inside the arena and disappear as soon as they land',()=>{
  const scene={radius:110,width:390,height:690,origin:{x:195,y:260},rotation:.2},shards=makeFragments({x:0,y:-.9},523,30);
  for(const shard of shards){
    for(const time of [0,.3,.6,1]){
      const pose=fallingFragmentPose(shard,scene,time);if(pose.landed){assert.equal(pose.polygon,undefined);continue;}
      assert.ok(pose.polygon.every(p=>p.x>=9.99&&p.x<=380.01&&p.y>=9.99&&p.y<=678.01));
    }
    assert.deepEqual(fallingFragmentPose(shard,scene,10),{landed:true});
  }
});
test('rope fall switches to shattering on the tenth hammer strike, including after scoring is frozen',()=>{
  const state=createMayhemState();assert.equal(ropeFallMode(state),'whole');
  strikeMayhem(state,'board');assert.equal(state.boardStrikes,0);state.mode='hammer';
  strikeMayhem(state,'background');strikeMayhem(state,'score');assert.equal(state.boardStrikes,0);
  for(let i=1;i<=11;i++){assert.equal(strikeMayhem(state,'board').points,0);assert.equal(state.boardStrikes,i);assert.equal(ropeFallMode(state),i>=10?'shatter':'whole');}
  assert.equal(createMayhemState().boardStrikes,0);
});
test('special strikes award 666; the scoreboard awards its final 40 then stops every score and popup',()=>{
  const s=createMayhemState();s.mode='hammer';
  assert.equal(strikeMayhem(s,'board').points,80);
  for(const target of ['rope','sound','brand'])assert.equal(strikeMayhem(s,target).points,666);
  assert.equal(strikeMayhem(s,'background').points,40);const last=strikeMayhem(s,'score');assert.equal(last.points,40);assert.equal(last.showPoints,true);
  for(const target of ['board','rope','background','power']){const result=strikeMayhem(s,target);assert.equal(result.points,0);assert.equal(result.showPoints,false);}
});
test('surface cracks are deterministic, start at impact and follow wood grain',()=>{
  const wall=makeSurfaceCracks(74),wood=makeSurfaceCracks(74,'wood');assert.deepEqual(wall,makeSurfaceCracks(74));assert.notDeepEqual(wall,makeSurfaceCracks(75));
  assert.ok(wall.filter(p=>p[0].x===0&&p[0].y===0).length>=7);
  assert.ok(wood.filter(p=>p[0].x===0&&p[0].y===0).every(p=>Math.abs(p.at(-1).y)>Math.abs(p.at(-1).x)*3));
});

test('one sling hit loosens it; the second is required to complete after all other objects, even with frozen scoring',()=>{
  const state=createMayhemState();state.mode='hammer';
  for(const id of BREAKABLES.filter(id=>id!=='sling'))strikeMayhem(state,id);
  const first=strikeMayhem(state,'sling');assert.equal(first.complete,false);assert.equal(state.mode,'hammer');assert.equal(state.slingStrikes,1);assert.equal(first.points,0);
  const second=strikeMayhem(state,'sling');assert.equal(second.complete,true);assert.equal(state.mode,'ending');assert.equal(state.slingStrikes,2);assert.equal(second.points,0);
  assert.equal(createMayhemState().slingStrikes,0);
});
test('the two sling pieces separate and disappear on landing without leaving clickable poses',()=>{
  for(const scene of [{width:320,height:480,sx:160,sy:340,scale:.72},{width:390,height:720,sx:195,sy:440,scale:.72},{width:1294,height:780,sx:647,sy:520,scale:1}]){
    const start=slingPartPoses(scene,0),fall=slingPartPoses(scene,.4),landed=slingPartPoses(scene,2);
    assert.equal(start.length,2);assert.ok(fall[0].x<start[0].x);assert.ok(fall[1].x>start[1].x);
    assert.ok(fall[0].rotation<0);assert.ok(fall[1].rotation>0);assert.equal(fall[0].landed,false);
    assert.deepEqual(landed,slingPartPoses(scene,20));
    assert.deepEqual(landed,[{landed:true},{landed:true}]);
    for(const part of fall){
      assert.equal(part.landed,false);const b=part.bounds,c=part.pivot,cos=Math.cos(part.rotation),sin=Math.sin(part.rotation);
      for(const [x,y] of [[b.left,b.top],[b.right,b.top],[b.right,b.bottom],[b.left,b.bottom]]){
        const px=part.x+((x-c.x)*cos-(y-c.y)*sin)*scene.scale,py=part.y+((x-c.x)*sin+(y-c.y)*cos)*scene.scale;
        assert.ok(px>=11.99&&px<=scene.width-11.99);assert.ok(py<=scene.height-13.99);
      }
    }
  }
});

test('wall cracks have four visibly different branching patterns while remaining deterministic',()=>{
  const roots=seed=>makeSurfaceCracks(seed).filter(path=>path[0].x===0&&path[0].y===0);
  assert.deepEqual([80,81,82,83].map(seed=>roots(seed).length),[7,4,8,5]);
  for(const seed of [80,81,82,83])assert.deepEqual(makeSurfaceCracks(seed),makeSurfaceCracks(seed));
});
test('permanent damage survives more than 100 strikes and a larger surface; transient history cannot evict it',()=>{
  const makeCanvas=()=>{
    const canvas={width:0,height:0,marks:[]};
    canvas.getContext=()=>({drawImage(source,...args){canvas.marks.push(...(source.marks?source.marks.map(mark=>({...mark})):[{id:source.id,args}]));}});
    return canvas;
  };
  const layer=createDamageLayer(makeCanvas);
  for(let id=0;id<250;id++)layer.add({id},{x:id,y:10,size:20,width:id<120?640:1200,height:844});
  const painted=makeCanvas();layer.paint(painted.getContext('2d'),0,0);
  assert.equal(layer.count,250);assert.equal(painted.marks.length,250);
  assert.deepEqual(painted.marks.map(mark=>mark.id),Array.from({length:250},(_,i)=>i));
  assert.deepEqual(painted.marks[0].args,[0,10,20,20]);
  layer.clear();const empty=makeCanvas();layer.paint(empty.getContext('2d'),0,0);assert.equal(layer.count,0);assert.equal(empty.marks.length,0);
});
