// World-space flight is shared by the rendered trajectory and collision resolver.
export const CONFIG = Object.freeze({depth:8, boardY:2.6, radius:1, faceRadius:.675, bullRadius:.245, gravity:9.8, floorY:-.4, maxForce:3, smashForce:3, firmForce:.6, dartLimit:12, replacementTime:2});
export const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));

export function makeShot({dx,dy,maxPull}) {
  const length=Math.hypot(dx,dy);
  const force=clamp(length/maxPull*CONFIG.maxForce,0,CONFIG.maxForce);
  const vz=4+13*force;
  const pitch=.2-.092*clamp((force-.65)/2.35,0,1);
  return {force,x:0,y:1.45,z:0,vx:-dx/maxPull*vz*.36,vy:2.4+vz*(pitch+(dy/Math.max(length,1)-1)*.3),vz};
}
export function positionAt(shot,t) {
  return {x:shot.x+shot.vx*t,y:shot.y+shot.vy*t-.5*CONFIG.gravity*t*t,z:shot.z+shot.vz*t};
}
export function resolveFlight(shot) {
  const wallTime=(CONFIG.depth-shot.z)/shot.vz;
  const floorTime=(shot.vy+Math.sqrt(shot.vy**2+2*CONFIG.gravity*(shot.y-CONFIG.floorY)))/CONFIG.gravity;
  const time=Math.max(0,Math.min(wallTime,floorTime));
  const position=positionAt(shot,time);
  const distance=Math.hypot(position.x,position.y-CONFIG.boardY);
  const hit=wallTime<=floorTime && distance<=CONFIG.radius+1e-9;
  const zone=!hit?'miss':distance<=CONFIG.bullRadius+1e-9?'bull':distance<=CONFIG.faceRadius+1e-9?'face':'rim';
  return {time,position,hit,bull:zone==='bull',zone,force:shot.force,surface:wallTime<=floorTime?'wall':'floor'};
}
export function createGameState(){return {score:0,shots:0,hits:0,darts:[],phase:'ready',destroyed:0,dropped:0};}
export function applyResult(state,result){
  state.shots++;
  if(!result.hit){state.phase='ready';return {kind:'miss',points:0,shake:false};}
  state.hits++;
  const points=result.zone==='bull'?50:result.zone==='rim'?5:10;
  state.score+=points;
  const firm=result.force>CONFIG.firmForce+1e-9;
  state.darts.push({x:result.position.x,y:result.position.y-CONFIG.boardY,angle:Math.atan2(result.position.x,.9),force:result.force,firm});
  if(result.force+1e-9>=CONFIG.smashForce){state.destroyed++;state.phase='destroying';return {kind:'smash',points,shake:firm};}
  if(state.darts.length>=CONFIG.dartLimit){state.dropped++;state.phase='destroying';return {kind:'drop',points,shake:firm};}
  state.phase='ready';return {kind:result.bull?'bull':'hit',points,shake:firm};
}
export function replaceBoard(state){state.darts=[];state.phase='ready';return state;}

// Constrain the entire pouch and dart to the stage, including capture outside it.
export function constrainPull(dx,dy,view,width,height){
  const length=Math.hypot(dx,dy),factor=length>view.maxPull?view.maxPull/length:1;
  return {dx:clamp(dx*factor,24-view.sx,width-24-view.sx),dy:clamp(dy*factor,35-view.sy,height-42-view.sy)};
}
