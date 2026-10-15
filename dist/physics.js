// World-space flight is shared by the rendered trajectory and collision resolver.
export const CONFIG = Object.freeze({depth:8, boardY:2.6, radius:1, faceRadius:.675, bullRadius:.245, gravity:9.8, floorY:-.4, maxForce:1, smashForce:1, smashHits:4, swingEscapeHits:6, firmForce:.6, dartLimit:12, replacementTime:2});
export const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));

export function fullPowerTarget(dx,dy,seed=0){
  const step=Math.PI/4,sector=(Math.round(Math.atan2(dy,-dx)/step)+8)%8;
  let value=seed>>>0;
  const random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
  const angle=sector*step+(random()-.5)*step;
  const radius=Math.sqrt(random())*CONFIG.radius*.98;
  return {x:Math.cos(angle)*radius,y:CONFIG.boardY+Math.sin(angle)*radius,sector};
}

export function makeShot({dx,dy,maxPull,scatterSeed=0}) {
  const length=Math.hypot(dx,dy);
  const force=clamp(length/maxPull*CONFIG.maxForce,0,CONFIG.maxForce);
  const vz=4+13*force;
  const pitch=.2-.0615*clamp((force-.65)/.35,0,1);
  const time=CONFIG.depth/vz,baseVy=2.4+vz*pitch;
  const baseHeight=1.45+baseVy*time-.5*CONFIG.gravity*time*time;
  const topRimHeight=CONFIG.boardY+(CONFIG.radius+CONFIG.faceRadius)/2;
  // Keep the easy center band; smoothly raise stronger shots to the upper rim.
  const progress=clamp((force-.7)/.3,0,1),blend=progress*progress*(3-2*progress);
  const lift=(topRimHeight-baseHeight)*blend/time;
  const shot={force,x:0,y:1.45,z:0,vx:-dx/maxPull*vz*.36,vy:baseVy+lift+vz*(dy/Math.max(length,1)-1)*.3,vz};
  if(force+1e-9>=CONFIG.smashForce){
    // Replay the same seeded target for the guide and the actual ballistic flight.
    const target=fullPowerTarget(dx,dy,scatterSeed);
    shot.vx=target.x/time;shot.vy=(target.y-shot.y+.5*CONFIG.gravity*time*time)/time;shot.sector=target.sector;
  }
  return shot;
}
export function positionAt(shot,t) {
  return {x:shot.x+shot.vx*t,y:shot.y+shot.vy*t-.5*CONFIG.gravity*t*t,z:shot.z+shot.vz*t};
}
export function resolveFlight(shot,board={x:0,y:CONFIG.boardY,rotation:0,active:true}) {
  const wallTime=(CONFIG.depth-shot.z)/shot.vz;
  const floorTime=(shot.vy+Math.sqrt(shot.vy**2+2*CONFIG.gravity*(shot.y-CONFIG.floorY)))/CONFIG.gravity;
  const time=Math.max(0,Math.min(wallTime,floorTime));
  const position=positionAt(shot,time);
  const dx=position.x-board.x,dy=position.y-board.y,c=Math.cos(board.rotation),s=Math.sin(board.rotation);
  const localPosition={x:dx*c-dy*s,y:CONFIG.boardY+dx*s+dy*c};
  const distance=Math.hypot(localPosition.x,localPosition.y-CONFIG.boardY);
  const hit=board.active!==false && wallTime<=floorTime && distance<=CONFIG.radius+1e-9;
  const zone=!hit?'miss':distance<=CONFIG.bullRadius+1e-9?'bull':distance<=CONFIG.faceRadius+1e-9?'face':'rim';
  return {time,position,localPosition,hit,bull:zone==='bull',zone,force:shot.force,surface:wallTime<=floorTime?'wall':'floor'};
}
export function createGameState(){return {score:0,shots:0,hits:0,darts:[],phase:'ready',destroyed:0,dropped:0,swingTier:0,fullPowerHits:0,crackHits:[]};}
export function applyResult(state,result){
  state.shots++;
  if(!result.hit){state.phase='ready';return {kind:'miss',points:0,shake:false};}
  state.hits++;
  const fullPower=result.force+1e-9>=CONFIG.smashForce;
  const impact=result.localPosition||result.position;
  if(fullPower){state.fullPowerHits++;state.crackHits.push({x:impact.x,y:impact.y-CONFIG.boardY});}
  const escapeStage=state.swingTier===3;
  const shatters=fullPower&&state.fullPowerHits>=CONFIG.smashHits;
  const points=shatters?100:result.zone==='bull'?50:result.zone==='rim'?5:10;
  state.score+=points;
  const firm=result.force>CONFIG.firmForce+1e-9;
  const pose=firm?['oblique','rear','perspective'][state.darts.filter(d=>d.firm).length%3]:'droop';
  state.darts.push({x:impact.x,y:impact.y-CONFIG.boardY,angle:Math.atan2(impact.x,.9),force:result.force,firm,pose});
  if(shatters){state.destroyed++;state.phase='destroying';return {kind:'smash',points,shake:firm};}
  if(escapeStage&&state.darts.length>=CONFIG.swingEscapeHits){state.dropped++;state.phase='destroying';return {kind:'escape',points,shake:firm};}
  if(state.darts.length>=CONFIG.dartLimit){state.dropped++;state.phase='destroying';return {kind:'drop',points,shake:firm};}
  state.phase='ready';return {kind:result.bull?'bull':'hit',points,shake:firm};
}
export function replaceBoard(state){state.darts=[];state.fullPowerHits=0;state.crackHits=[];state.phase='ready';return state;}

// Constrain the entire pouch and dart to the stage, including capture outside it.
export function constrainPull(dx,dy,view,width,height){
  const length=Math.hypot(dx,dy),factor=length>view.maxPull?view.maxPull/length:1;
  return {dx:clamp(dx*factor,24-view.sx,width-24-view.sx),dy:clamp(dy*factor,35-view.sy,height-42-view.sy)};
}
