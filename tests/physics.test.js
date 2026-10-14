import test from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG,makeShot,positionAt,resolveFlight,createGameState,applyResult,replaceBoard,constrainPull} from '../dist/physics.js';
import {makeFragments} from '../dist/fracture.js';
function aimedShot(x=0,y=CONFIG.boardY,force=.65){const vz=4+13*force,t=CONFIG.depth/vz;return {x:0,y:1.45,z:0,vx:x/t,vy:(y-1.45+.5*CONFIG.gravity*t*t)/t,vz,force};}
test('center, face, red rim and off-board areas score 50/10/5/0',()=>{
  for(const [x,zone,score] of [[0,'bull',50],[.5,'face',10],[.8,'rim',5],[1,'rim',5],[1.001,'miss',0]]){const r=resolveFlight(aimedShot(x)),s=createGameState();assert.equal(r.zone,zone);assert.equal(applyResult(s,r).points,score);}
  assert.equal(resolveFlight(aimedShot(CONFIG.bullRadius+.001)).zone,'face');assert.equal(resolveFlight(aimedShot(CONFIG.faceRadius+.001)).zone,'rim');
});
test('weak pull hits floor; trajectory and collision agree up to 300%',()=>{
  const weak=makeShot({dx:0,dy:100*.2/3,maxPull:100}),r=resolveFlight(weak);assert.equal(r.hit,false);assert.equal(r.surface,'floor');assert.ok(r.position.z<CONFIG.depth);
  for(const force of [.45,.65,1,2,2.99,3]){const shot=makeShot({dx:0,dy:force*100/3,maxPull:100}),result=resolveFlight(shot);assert.equal(result.hit,true);assert.deepEqual(positionAt(shot,result.time),result.position);}
  assert.equal(resolveFlight(makeShot({dx:0,dy:100,maxPull:100})).bull,true);
});
test('299% stays intact; 300% shatters; powerful miss never shatters',()=>{
  const normal=createGameState();assert.equal(applyResult(normal,resolveFlight(aimedShot(0,CONFIG.boardY,2.99))).kind,'bull');assert.equal(normal.phase,'ready');
  const strong=createGameState();assert.equal(applyResult(strong,resolveFlight(aimedShot(0,CONFIG.boardY,3))).kind,'smash');assert.equal(strong.destroyed,1);
  const missed=createGameState();assert.equal(applyResult(missed,resolveFlight(aimedShot(2,CONFIG.boardY,3))).kind,'miss');assert.equal(missed.destroyed,0);assert.equal(missed.darts.length,0);
});
test('over 60% gives rigid insertion and shake, at or below 60% gives neither',()=>{
  for(const [force,firm] of [[.59,false],[.6,false],[.6000000000000001,false],[.6001,true],[2,true]]){const s=createGameState(),r=applyResult(s,resolveFlight(aimedShot(0,CONFIG.boardY,force)));assert.equal(s.darts[0].firm,firm);assert.equal(r.shake,firm);}
  assert.equal(applyResult(createGameState(),resolveFlight(aimedShot(2,CONFIG.boardY,3))).shake,false);
});
test('accumulated darts still drop the board; shattering has priority',()=>{
  const s=createGameState(),regular=resolveFlight(aimedShot(.5));for(let i=0;i<11;i++)applyResult(s,regular);assert.equal(s.phase,'ready');assert.equal(s.darts.length,11);assert.equal(applyResult(s,regular).kind,'drop');assert.equal(s.dropped,1);
  const strong=createGameState();for(let i=0;i<11;i++)applyResult(strong,regular);assert.equal(applyResult(strong,resolveFlight(aimedShot(.5,CONFIG.boardY,3))).kind,'smash');assert.equal(strong.dropped,0);
});
test('board replacement keeps stats, a new game resets them',()=>{
  const s=createGameState();for(const x of [0,.5,.8,2])applyResult(s,resolveFlight(aimedShot(x)));assert.equal(s.score,65);assert.equal(s.shots,4);assert.equal(s.hits,3);replaceBoard(s);assert.equal(s.score,65);assert.equal(s.darts.length,0);assert.equal(s.phase,'ready');assert.equal(createGameState().score,0);
});
test('rope and pouch stay inside stage after captured pointer exits',()=>{
  const v={sx:148,sy:380,maxPull:58};for(const [dx,dy] of [[0,10000],[10000,0],[-10000,0],[0,-10000],[1000,1000]]){const p=constrainPull(dx,dy,v,296,480);assert.ok(v.sx+p.dx>=24&&v.sx+p.dx<=272);assert.ok(v.sy+p.dy>=35&&v.sy+p.dy<=438);assert.ok(Math.hypot(p.dx,p.dy)<=v.maxPull+1e-8);}assert.equal(makeShot({dx:0,dy:200,maxPull:100}).force,3);
});
test('fracture fills disk with unequal solid pieces around impact',()=>{
  const pieces=makeFragments({x:.2,y:-.3},75,30);assert.equal(pieces.length,30);const area=pieces.reduce((sum,s)=>sum+Math.abs(s.polygon.reduce((a,p,i)=>{const q=s.polygon[(i+1)%s.polygon.length];return a+p.x*q.y-p.y*q.x;},0))/2,0);assert.ok(Math.abs(area-Math.PI)<.02);assert.ok(pieces.some(s=>s.red));assert.ok(pieces.some(s=>!s.red));assert.ok(pieces.every(s=>s.polygon.length>=3&&s.polygon.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.hypot(p.x,p.y)<=1.0001)));assert.notDeepEqual(pieces,makeFragments({x:-.6,y:0},75,30));
});
