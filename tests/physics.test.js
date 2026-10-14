import test from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG,makeShot,positionAt,resolveFlight,createGameState,applyResult,replaceBoard,constrainPull} from '../dist/physics.js';
import {makeFragments,makeImpactCracks} from '../dist/fracture.js';
function aimedShot(x=0,y=CONFIG.boardY,force=.65){const vz=4+13*force,t=CONFIG.depth/vz;return {x:0,y:1.45,z:0,vx:x/t,vy:(y-1.45+.5*CONFIG.gravity*t*t)/t,vz,force};}
const hit=(force=1,x=0)=>resolveFlight(aimedShot(x,CONFIG.boardY,force));
test('normal center, face, red rim and miss score 50/10/5/0',()=>{
  for(const [x,zone,score] of [[0,'bull',50],[.5,'face',10],[.8,'rim',5],[1,'rim',5],[1.001,'miss',0]]){const r=hit(.65,x),s=createGameState();assert.equal(r.zone,zone);assert.equal(applyResult(s,r).points,score);}
});
test('four full-power hits break board; fourth awards exactly 100',()=>{
  const s=createGameState();assert.equal(applyResult(s,hit()).kind,'bull');assert.equal(s.fullPowerHits,1);assert.equal(s.crackHits.length,1);assert.equal(s.score,50);
  assert.equal(applyResult(s,hit()).kind,'bull');assert.equal(s.fullPowerHits,2);assert.equal(s.score,100);assert.equal(applyResult(s,hit()).kind,'bull');assert.equal(s.fullPowerHits,3);assert.equal(s.phase,'ready');const fourth=applyResult(s,hit());assert.equal(fourth.kind,'smash');assert.equal(fourth.points,100);assert.equal(s.score,250);assert.equal(s.phase,'destroying');
  const rim=createGameState();for(let i=0;i<4;i++)applyResult(rim,hit(1,.9));assert.equal(rim.score,115);
});
test('99% and full-power misses do not add cracks or reset existing progress',()=>{
  const s=createGameState();applyResult(s,hit());applyResult(s,hit(.99));applyResult(s,hit(1,2));assert.equal(s.fullPowerHits,1);assert.equal(s.crackHits.length,1);assert.equal(s.destroyed,0);
  applyResult(s,hit());assert.equal(s.fullPowerHits,2);assert.equal(applyResult(s,hit()).kind,'bull');assert.equal(applyResult(s,hit()).kind,'smash');
});
test('board replacement and restart clear cracks; replacement keeps score',()=>{
  const s=createGameState();applyResult(s,hit());applyResult(s,hit());replaceBoard(s);assert.equal(s.fullPowerHits,0);assert.equal(s.crackHits.length,0);assert.equal(s.darts.length,0);assert.equal(s.score,100);assert.notEqual(applyResult(s,hit()).kind,'smash');assert.equal(createGameState().fullPowerHits,0);
});
test('force caps at 100%, full pull remains reachable, weak pull lands short',()=>{
  assert.equal(makeShot({dx:0,dy:200,maxPull:100}).force,1);
  const weak=resolveFlight(makeShot({dx:0,dy:20,maxPull:100}));assert.equal(weak.hit,false);assert.equal(weak.surface,'floor');
  for(const force of [.45,.65,.8,.99,1]){const shot=makeShot({dx:0,dy:force*100,maxPull:100}),r=resolveFlight(shot);assert.equal(r.hit,true);assert.deepEqual(positionAt(shot,r.time),r.position);}
  assert.equal(resolveFlight(makeShot({dx:0,dy:100,maxPull:100})).bull,true);
});
test('over 60% inserts rigidly with three alternating poses and shakes',()=>{
  for(const [force,firm] of [[.59,false],[.6,false],[.6000000000000001,false],[.6001,true]]){const s=createGameState(),r=applyResult(s,hit(force));assert.equal(s.darts[0].firm,firm);assert.equal(r.shake,firm);}
  const s=createGameState();for(let i=0;i<3;i++)applyResult(s,hit(.8));assert.deepEqual(s.darts.map(d=>d.pose),['oblique','rear','perspective']);
  assert.equal(applyResult(createGameState(),hit(1,2)).shake,false);
});
test('12 ordinary hits drop board; a fourth full-power 12th hit breaks it',()=>{
  const s=createGameState();for(let i=0;i<11;i++)applyResult(s,hit(.65));assert.equal(s.phase,'ready');assert.equal(applyResult(s,hit(.65)).kind,'drop');
  const strong=createGameState();for(let i=0;i<3;i++)applyResult(strong,hit());for(let i=0;i<8;i++)applyResult(strong,hit(.65));assert.equal(applyResult(strong,hit()).kind,'smash');assert.equal(strong.dropped,0);
});
test('each impact follows its own position, grows by hit order, and leaves earlier cracks unchanged',()=>{
  const s=createGameState();applyResult(s,hit());const first=makeImpactCracks(s.crackHits[0],0),extent=paths=>Math.max(...paths.flatMap(p=>p.vertices.map(v=>Math.hypot(v.x,v.y))));
  applyResult(s,hit(1,.45));const second=makeImpactCracks(s.crackHits[1],1);applyResult(s,hit(1,-.3));const third=makeImpactCracks(s.crackHits[2],2);
  assert.deepEqual(makeImpactCracks(s.crackHits[0],0),first);assert.deepEqual(makeImpactCracks(s.crackHits[1],1),second);
  for(let i=0;i<3;i++){const origin=s.crackHits[i],paths=makeImpactCracks(origin,i);assert.deepEqual(paths[0].vertices[0],{x:origin.x,y:-origin.y});assert.ok(paths.every(p=>p.vertices.every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y))));}
  const sizes=[0,1,2].map(i=>extent(makeImpactCracks({x:0,y:0},i)));assert.ok(sizes[0]<.15&&sizes[1]>sizes[0]*1.8&&sizes[2]>sizes[1]*1.4);
  // Preserve the first hit's previous four jagged arms exactly.
  let seed=1903;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let arm=0;arm<4;arm++){const angle=arm/4*Math.PI*2+rnd()*.55,len=.065+rnd()*.08,vertices=[{x:0,y:-0}];for(let step=1;step<=4;step++){const d=len*step/4,drift=(rnd()-.5)*len*.18;vertices.push({x:Math.cos(angle)*d-Math.sin(angle)*drift,y:Math.sin(angle)*d+Math.cos(angle)*drift});}assert.deepEqual(first[arm].vertices,vertices);}
});
test('rope and pouch stay inside stage after captured pointer exits',()=>{
  const v={sx:148,sy:380,maxPull:58};for(const [dx,dy] of [[0,10000],[10000,0],[-10000,0],[0,-10000],[1000,1000]]){const p=constrainPull(dx,dy,v,296,480);assert.ok(v.sx+p.dx>=24&&v.sx+p.dx<=272);assert.ok(v.sy+p.dy>=35&&v.sy+p.dy<=438);assert.ok(Math.hypot(p.dx,p.dy)<=v.maxPull+1e-8);}
});
test('fracture still fills disk with solid pieces around actual impact',()=>{
  const pieces=makeFragments({x:.2,y:-.3},75,30),area=pieces.reduce((sum,s)=>sum+Math.abs(s.polygon.reduce((a,p,i)=>{const q=s.polygon[(i+1)%s.polygon.length];return a+p.x*q.y-p.y*q.x;},0))/2,0);assert.equal(pieces.length,30);assert.ok(Math.abs(area-Math.PI)<.02);assert.ok(pieces.every(s=>s.polygon.length>=3&&s.polygon.every(p=>Number.isFinite(p.x)&&Math.hypot(p.x,p.y)<=1.0001)));
});
