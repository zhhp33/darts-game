import test from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG,makeShot,positionAt,resolveFlight,createGameState,applyResult,replaceBoard} from '../dist/physics.js';

function aimedShot(x=0,y=CONFIG.boardY,force=.65){
  const vz=4+13*force,t=CONFIG.depth/vz;
  return {x:0,y:1.45,z:0,vx:x/t,vy:(y-1.45+.5*CONFIG.gravity*t*t)/t,vz,force};
}
test('center, board edge, red frame and off-board collision',()=>{
  assert.equal(resolveFlight(aimedShot()).bull,true);
  assert.equal(resolveFlight(aimedShot(.99)).hit,true);
  assert.equal(resolveFlight(aimedShot(1)).hit,true);
  assert.equal(resolveFlight(aimedShot(1.001)).hit,false);
  assert.equal(resolveFlight(aimedShot(CONFIG.bullRadius+.001)).bull,false);
});
test('weak pull lands on floor before target; launch arc matches result',()=>{
  const weak=makeShot({dx:0,dy:10,maxPull:100});const r=resolveFlight(weak);
  assert.equal(r.hit,false);assert.equal(r.surface,'floor');assert.ok(r.position.z<CONFIG.depth);
  for(const force of [.45,.65,.89,.9,1]){
    const shot=makeShot({dx:0,dy:force*100,maxPull:100}),result=resolveFlight(shot);
    assert.equal(result.hit,true);assert.deepEqual(positionAt(shot,result.time),result.position);
  }
});
test('89% sticks; 90% shatters; a full-force miss never shatters',()=>{
  const normal=createGameState();assert.equal(applyResult(normal,resolveFlight(aimedShot(0,CONFIG.boardY,.89))).kind,'bull');assert.equal(normal.phase,'ready');
  const strong=createGameState();assert.equal(applyResult(strong,resolveFlight(aimedShot(0,CONFIG.boardY,.9))).kind,'smash');assert.equal(strong.destroyed,1);
  const missed=createGameState();assert.equal(applyResult(missed,resolveFlight(aimedShot(2,CONFIG.boardY,1))).kind,'miss');assert.equal(missed.destroyed,0);assert.equal(missed.darts.length,0);
});
test('11 darts remain, 12th drops; heavy 12th prioritizes shattering',()=>{
  const s=createGameState();const regular=resolveFlight(aimedShot(.5));
  for(let i=0;i<11;i++)applyResult(s,regular);
  assert.equal(s.phase,'ready');assert.equal(s.darts.length,11);assert.equal(applyResult(s,regular).kind,'drop');assert.equal(s.dropped,1);
  const strong=createGameState();for(let i=0;i<11;i++)applyResult(strong,regular);
  assert.equal(applyResult(strong,resolveFlight(aimedShot(.5,CONFIG.boardY,.9))).kind,'smash');assert.equal(strong.dropped,0);
});
test('scores, hits and shots survive changing boards, new game clears them',()=>{
  const s=createGameState();applyResult(s,resolveFlight(aimedShot()));applyResult(s,resolveFlight(aimedShot(.5)));applyResult(s,resolveFlight(aimedShot(2)));
  assert.equal(s.score,60);assert.equal(s.shots,3);assert.equal(s.hits,2);replaceBoard(s);
  assert.equal(s.score,60);assert.equal(s.darts.length,0);assert.equal(s.phase,'ready');assert.equal(createGameState().score,0);
});
test('drag power is capped and horizontal aim is opposite the pull',()=>{
  assert.equal(makeShot({dx:0,dy:150,maxPull:100}).force,1);
  const left=resolveFlight(makeShot({dx:30,dy:65,maxPull:100}));assert.ok(left.position.x<0);
});
